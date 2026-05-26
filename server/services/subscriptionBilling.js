const Subscription = require('../models/Subscription');
const User = require('../models/User');
const EmailService = require('./email');
const notifyService = require('./notifyService');
const vpnProvisioning = require('./vpnProvisioning');

function nowIso() {
  return new Date().toISOString();
}

function parseConfigData(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

const DISABLED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// Хранилище последнего лога биллинга
let lastBillingLog = {
  timestamp: null,
  details: []
};

class SubscriptionBillingService {
  constructor() {
    this.emailService = EmailService;
  }

  /**
   * Получить последний лог биллинга
   */
  getLastBillingLog() {
    return lastBillingLog;
  }

  /**
   * Проверка и отключение истёкших cancelled подписок
   * Запускается каждые 5 минут
   */
  async checkExpiredCancelled() {
    try {
      const cancelledExpired = this.getCancelledExpiredSubscriptions();

      let disabled = 0;
      for (const sub of cancelledExpired) {
        const ok = await this.pauseExternalServices(sub, 'cancelled');
        if (ok) {
          Subscription.update(sub.id, { status: 'expired' });
          disabled++;
        }
      }

      const deleted = await this.cleanupExpiredDisabledUsers();
      console.log('[Billing] Checked expired cancelled:', { checked: cancelledExpired.length, disabled, deleted });
      return { checked: cancelledExpired.length, disabled, deleted };
    } catch (error) {
      console.error('[Billing] Check expired cancelled error:', error);
      return { error: error.message };
    }
  }

  /**
   * Получить истёкшие cancelled подписки для отключения сервисов
   */
  getCancelledExpiredSubscriptions() {
    const { db } = require('../config/database');
    // Тот же формат, что и в expires_at из JS (ISO 8601). Сравнение с datetime('now') ломало выборку.
    return db.prepare(`
      SELECT * FROM subscriptions
      WHERE status = 'cancelled' AND expires_at <= ?
    `).all(nowIso());
  }

  getExpiredVpnSubscriptions() {
    const { db } = require('../config/database');
    return db.prepare(`
      SELECT * FROM subscriptions
      WHERE status = 'expired' AND type = 'vpn'
    `).all();
  }

  async pauseExternalServices(subscription, reason = 'unknown') {
    const sub = Subscription.getById(subscription.id);
    if (!sub) return false;

    const configData = parseConfigData(sub.config_data) || {};
    const now = new Date();
    const pausedAt = now.toISOString();
    const deleteAfter = new Date(now.getTime() + DISABLED_RETENTION_MS).toISOString();

    await vpnProvisioning.disconnectSubscriptionResources(configData || sub, { mode: 'pause' }).catch((err) => {
      console.error('[Billing] VPN pause failed:', err.message);
    });

    configData.pausedAt = pausedAt;
    configData.deleteAfter = deleteAfter;
    configData.pauseReason = reason;
    configData.updatedAt = pausedAt;
    Subscription.update(sub.id, { config_data: configData });
    return true;
  }

  async cleanupExpiredDisabledUsers() {
    const list = this.getExpiredVpnSubscriptions();
    if (!list.length) return 0;

    const nowMs = Date.now();
    let deleted = 0;

    for (const sub of list) {
      const configData = parseConfigData(sub.config_data) || {};
      const deleteAfterRaw = String(configData.deleteAfter || '').trim();
      const deleteAfterMs = deleteAfterRaw ? Date.parse(deleteAfterRaw) : NaN;
      if (!Number.isFinite(deleteAfterMs) || deleteAfterMs > nowMs) continue;

      await this.disconnectExternalServices(sub, { mode: 'delete' });
      configData.deletedAt = new Date().toISOString();
      configData.updatedAt = configData.deletedAt;
      configData.resources = [];
      Subscription.update(sub.id, { config_data: configData });
      deleted++;
    }

    return deleted;
  }

  /**
   * Отключить внешние сервисы для подписки
   * Вызывается когда подписка истекла (expires_at <= now)
   */
  async disconnectExternalServices(subscription, { mode = 'delete' } = {}) {
    // Перечитываем подписку из базы (могли обновить expires_at)
    const sub = Subscription.getById(subscription.id);
    if (!sub) {
      console.log('[Billing] Подписка не найдена, пропускаем отключение');
      return false;
    }

    let configData = null;
    if (sub.config_data) {
      try {
        configData = JSON.parse(sub.config_data);
      } catch (e) {
        console.error('[Billing] config_data JSON:', e.message);
      }
    }
    const now = new Date();

    if (mode === 'delete') {
      const expiresAt = new Date(sub.expires_at);
      if (expiresAt > now) {
        console.log('[Billing] Подписка ещё действительна, удаление сервисов отложено');
        return false;
      }
    }

    console.log('[Billing] Операция с сервисами для подписки', sub.id, mode);

    if (sub.type === 'vpn') {
      await vpnProvisioning.disconnectSubscriptionResources(configData || sub, { mode }).catch((err) => {
        console.error('[Billing] VPN disconnect failed:', err.message);
      });
    }
    return true;
  }

  /**
   * Обработка одного пользователя
   */
  async processUserCharges(userId, user, subscriptions) {
    const uid = Number(userId);

    if (!user) {
      return {
        result: 'failed',
        log: {
          userId: uid,
          email: null,
          balance: 0,
          subscriptions: [],
          success: false,
          error: 'Пользователь не найден'
        }
      };
    }

    const logEntry = {
      userId: uid,
      email: user.email,
      balance: user.balance,
      subscriptions: [],
      success: true,
      error: null
    };

    if (user.unlimited_balance) {
      for (const sub of subscriptions) {
        Subscription.extendByDays(sub.id, 1);

        const baseTime = sub.next_charge_at ? new Date(sub.next_charge_at) : new Date();
        const nextChargeAt = new Date(baseTime.getTime() + 24 * 60 * 60 * 1000);
        Subscription.updateNextChargeAt(sub.id, nextChargeAt);

        const refreshed = Subscription.getById(sub.id);
        logEntry.subscriptions.push({
          subscriptionId: sub.id,
          type: sub.type,
          dailyRate: sub.daily_rate,
          action: 'charged_unlimited',
          newExpiresAt: refreshed?.expires_at,
          newNextChargeAt: nextChargeAt.toISOString()
        });
      }

      const updatedUser = User.getById(uid);
      logEntry.newBalance = updatedUser?.balance;
      return { result: 'success_unlimited', log: logEntry };
    }

    const totalDailyRate = subscriptions.reduce((sum, s) => sum + Number(s.daily_rate || 0), 0);

    if (user.balance >= totalDailyRate) {
      const deducted = User.deductBalance(uid, totalDailyRate);
      if (!deducted) {
        logEntry.error = `Не удалось списать ${totalDailyRate} ₽ — баланс изменился`;
        logEntry.newBalance = User.getById(uid)?.balance;
        return { result: 'failed', log: logEntry };
      }

      // Продлеваем каждую подписку на 1 день
      for (const sub of subscriptions) {
        Subscription.extendByDays(sub.id, 1);

        // Обновляем next_charge_at от текущего next_charge_at (или от now если его нет)
        const baseTime = sub.next_charge_at ? new Date(sub.next_charge_at) : new Date();
        const nextChargeAt = new Date(baseTime.getTime() + 24 * 60 * 60 * 1000);
        Subscription.updateNextChargeAt(sub.id, nextChargeAt);

        const refreshed = Subscription.getById(sub.id);
        logEntry.subscriptions.push({
          subscriptionId: sub.id,
          type: sub.type,
          dailyRate: sub.daily_rate,
          action: 'charged',
          newExpiresAt: refreshed?.expires_at,
          newNextChargeAt: nextChargeAt.toISOString()
        });
      }

      const updatedUser = User.getById(uid);
      logEntry.newBalance = updatedUser?.balance;

      // Проверяем, нужно ли отправить предупреждение
      if (updatedUser) {
        await this.checkLowBalanceWarning(uid, updatedUser);
      }

      return { result: 'success', log: logEntry };
    } else {
      // Недостаточно средств — переводим подписки в disabled и ставим retention 7 дней
      for (const sub of subscriptions) {
        Subscription.update(sub.id, { status: 'expired', expires_at: new Date().toISOString() });
        await this.pauseExternalServices(sub, 'insufficient_funds');

        logEntry.subscriptions.push({
          subscriptionId: sub.id,
          type: sub.type,
          dailyRate: sub.daily_rate,
          action: 'disabled',
          reason: 'insufficient_funds'
        });
      }

      logEntry.newBalance = user.balance;
      logEntry.error = `Недостаточно средств: требуется ${totalDailyRate} ₽, баланс ${user.balance} ₽`;

      // Отправляем push первым, email только как fallback
      const pushSent = await notifyService.sendFundsDepleted(uid, user.balance);
      if (!pushSent) {
        await this.emailService.sendInsufficientFundsWarning(user.email, user.balance, totalDailyRate);
      }

      return { result: 'suspended', log: logEntry };
    }
  }

  /**
   * Тестовый запуск биллинга — только проверка и списание, без продления дат
   */
  async processUserChargesDryRun(userId, user, subscriptions) {
    const uid = Number(userId);

    if (!user) {
      return {
        result: 'failed',
        log: {
          userId: uid,
          email: null,
          balance: 0,
          subscriptions: [],
          success: false,
          error: 'Пользователь не найден'
        }
      };
    }

    const logEntry = {
      userId: uid,
      email: user.email,
      balance: user.balance,
      subscriptions: [],
      success: true,
      error: null
    };

    // Считаем общую дневную ставку
    const totalDailyRate = subscriptions.reduce((sum, s) => sum + Number(s.daily_rate || 0), 0);

    // Проверяем баланс — НЕ списываем, НЕ продлеваем
    if (user.balance >= totalDailyRate) {
      for (const sub of subscriptions) {
        logEntry.subscriptions.push({
          subscriptionId: sub.id,
          type: sub.type,
          dailyRate: sub.daily_rate,
          action: 'would_charge',
          currentExpiresAt: sub.expires_at,
          currentNextChargeAt: sub.next_charge_at
        });
      }

      logEntry.newBalance = user.balance;
      return { result: 'success', log: logEntry };
    } else {
      for (const sub of subscriptions) {
        logEntry.subscriptions.push({
          subscriptionId: sub.id,
          type: sub.type,
          dailyRate: sub.daily_rate,
          action: 'would_suspend',
          reason: 'insufficient_funds'
        });
      }

      logEntry.newBalance = user.balance;
      logEntry.error = `Недостаточно средств: требуется ${totalDailyRate} ₽, баланс ${user.balance} ₽`;
      return { result: 'suspended', log: logEntry };
    }
  }

  /**
   * Обработка ежедневных списаний
   * Вызывается каждый час
   */
  async processDailyCharges() {
    try {
      // Сначала помечаем истёкшие подписки как expired
      Subscription.expireExpired();

      // Отключаем сервисы для истёкших cancelled подписок
      const cancelledExpired = this.getCancelledExpiredSubscriptions();
      for (const sub of cancelledExpired) {
        const ok = await this.pauseExternalServices(sub, 'cancelled');
        if (ok) {
          Subscription.update(sub.id, { status: 'expired' });
        }
      }

      await this.cleanupExpiredDisabledUsers();

      const subscriptions = Subscription.getForDailyCharge();

      if (subscriptions.length === 0) {
        const emptyLog = {
          timestamp: new Date().toISOString(),
          details: [],
          summary: { processed: 0, success: 0, failed: 0, suspended: 0 }
        };
        lastBillingLog = emptyLog;
        return { processed: 0, success: 0, failed: 0, suspended: 0 };
      }

      const result = {
        processed: 0,
        success: 0,
        failed: 0,
        suspended: 0
      };

      const logDetails = [];

      // Группируем подписки по user_id
      const userSubs = {};
      for (const sub of subscriptions) {
        if (!userSubs[sub.user_id]) {
          userSubs[sub.user_id] = [];
        }
        userSubs[sub.user_id].push(sub);
      }

      // Обрабатываем каждого пользователя
      for (const [userId, subs] of Object.entries(userSubs)) {
        result.processed += subs.length;

        const user = User.getById(Number(userId));
        
        try {
          const { result: userResult, log: logEntry } = await this.processUserCharges(userId, user, subs);
          logDetails.push(logEntry);

          if (userResult === 'success' || userResult === 'success_unlimited') {
            result.success += subs.length;
          } else if (userResult === 'suspended') {
            result.suspended += subs.length;
          } else {
            result.failed += subs.length;
          }
        } catch (userErr) {
          console.error(`[Billing] Error processing user ${userId}:`, userErr.message);
          result.failed += subs.length;
          logDetails.push({
            userId: Number(userId),
            email: user?.email || null,
            balance: user?.balance || 0,
            subscriptions: subs.map(s => ({ subscriptionId: s.id, type: s.type, dailyRate: s.daily_rate, action: 'error', error: userErr.message })),
            success: false,
            error: userErr.message,
            newBalance: user?.balance
          });
        }
      }

      // Сохраняем лог
      lastBillingLog = {
        timestamp: new Date().toISOString(),
        details: logDetails,
        summary: result
      };

      console.log('[Billing] Daily charges processed:', result);
      return result;
    } catch (error) {
      console.error('[Billing] Process daily charges error:', error);
      return { error: error.message };
    }
  }

  /**
   * Проверка баланса для предупреждения
   */
  async checkLowBalanceWarning(userId, user) {
    const daysRemaining = Subscription.calculateDaysRemaining(userId);

    if (daysRemaining > 0 && daysRemaining <= 3) {
      const totalDailyRate = Subscription.getTotalDailyRate(userId);
      const pushSent = await notifyService.sendLowBalance(userId, user.balance, daysRemaining);
      if (!pushSent) {
        await this.emailService.sendLowBalanceWarning(user.email, daysRemaining, user.balance, totalDailyRate);
      }
    }
  }
}

module.exports = new SubscriptionBillingService();
