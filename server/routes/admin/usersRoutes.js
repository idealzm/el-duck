const express = require('express');
const { createValidator } = require('../../middleware/validate');
const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const Payment = require('../../models/Payment');
const { db } = require('../../config/database');
const vpnProvisioning = require('../../services/vpnProvisioning');
const EmailService = require('../../services/email');
const PushService = require('../../services/pushService');
const { sendNotification } = require('../../services/adminNotificationService');
const {
  cancelSubscription,
  resumeSubscription,
  createDailySubscriptionForAdmin
} = require('../../services/adminSubscriptionService');
const { ok, fail } = require('../../utils/httpResponse');
const { getUserByPublicId, toPublicUser, parsePaging } = require('./_helpers');
const { auditLog } = require('../../utils/auditLog');

const router = express.Router();

const validateBalanceUpdate = createValidator({
  amount: { required: true, type: 'number', min: -100000, max: 100000 }
});

async function notifySubscriptionChange({ user, type = 'vpn', statusText, customMessage, adminId }) {
  const details = [
    `Администратор изменил статус вашей подписки (${type}).`,
    `Текущий статус: ${statusText}.`
  ];
  const extra = String(customMessage || '').trim();
  if (extra) {
    details.push('', `Комментарий: ${extra}`);
  }

  await sendNotification({
    title: 'Изменение подписки',
    body: details.join('\n'),
    targetType: 'selected',
    userIds: [user.user_uuid || User.ensureUuid(user.id)]
  }, adminId || null);
}

router.get('/stats', async (req, res) => {
  try {
    const totalUsers = User.getCount();
    const activeSubs = Subscription.getCount();
    const revenue = Payment.getTotalByPeriod(30);
    const totalBalance = User.getTotalBalance();
    const vpnSubs = Subscription.getVpnCount();
    return ok(res, { stats: { totalUsers, activeSubs, revenue, totalBalance, vpnSubs } });
  } catch (error) {
    return fail(res, 'Ошибка получения статистики', 500);
  }
});

router.get('/users', async (req, res) => {
  try {
    const { search, filter } = req.query;
    const limit = parsePaging(req.query.limit, 100);
    const offset = parsePaging(req.query.offset, 0);

    let users = search ? User.searchByEmail(search, limit) : User.getAll(limit, offset);

    if (filter === 'active') {
      users = users.filter((u) => Subscription.getActiveByUser(u.id).length > 0);
    } else if (filter === 'inactive') {
      users = users.filter((u) => Subscription.getActiveByUser(u.id).length === 0);
    }

    const now = new Date();
    const usersWithSubs = users.map((u) => {
      const validSubs = Subscription.getValidByUser(u.id).filter((s) => new Date(s.expires_at) > now);
      return {
        ...toPublicUser(u),
        subscriptions: validSubs.map((s) => ({
          type: s.type,
          status: s.status,
          expiresAt: s.expires_at,
          dailyRate: s.daily_rate || null,
          nextChargeAt: s.next_charge_at || null
        }))
      };
    });

    return ok(res, { users: usersWithSubs });
  } catch (error) {
    return fail(res, 'Ошибка получения пользователей', 500);
  }
});

router.put('/users/:id/balance', validateBalanceUpdate, async (req, res) => {
  try {
    const { id: publicId } = req.params;
    const { amount, message } = req.body;
    if (!amount || typeof amount !== 'number') return fail(res, 'Сумма обязательна', 400);

    const user = getUserByPublicId(publicId);
    if (!user) return fail(res, 'Пользователь не найден', 404);

    const newUser = User.updateBalance(user.id, amount);
    if (amount > 0) {
      Payment.completeByAdmin(user.id, amount, req.admin.id);
    }

    auditLog({
      actorType: 'admin',
      actorId: req.admin?.id || null,
      action: 'balance_change',
      targetType: 'user',
      targetId: user.id,
      details: { amount, newBalance: newUser.balance, adminMessage: String(message || '').trim() },
      ip: req.ip || null
    });

    const amountAbs = Math.abs(Number(amount || 0)).toFixed(2);
    const amountLabel = Number(amount) >= 0 ? `+${amountAbs}` : `-${amountAbs}`;
    const customMessage = String(message || '').trim();
    const bodyLines = [
      `Администратор изменил ваш баланс на ${amountLabel} ₽.`,
      `Текущий баланс: ${Number(newUser.balance || 0).toFixed(2)} ₽.`
    ];
    if (customMessage) {
      bodyLines.push('', `Комментарий: ${customMessage}`);
    }

    await sendNotification({
      title: 'Изменение баланса',
      body: bodyLines.join('\n'),
      targetType: 'selected',
      userIds: [newUser.user_uuid || User.ensureUuid(newUser.id)]
    }, req.admin?.id || null);

    return ok(res, {
      message: `Баланс изменён на ${amount} ₽`,
      user: {
        id: newUser.user_uuid || User.ensureUuid(newUser.id),
        email: newUser.email,
        balance: newUser.balance
      }
    });
  } catch (error) {
    return fail(res, 'Ошибка изменения баланса', 500);
  }
});

router.put('/users/:id/unlimited-balance', async (req, res) => {
  try {
    const { id: publicId } = req.params;
    const { unlimitedBalance } = req.body;
    const user = getUserByPublicId(publicId);
    if (!user) return fail(res, 'Пользователь не найден', 404);

    const updated = User.setUnlimitedBalance(user.id, !!unlimitedBalance);
    return ok(res, {
      message: unlimitedBalance ? 'Безлимитный баланс включён' : 'Безлимитный баланс отключён',
      user: toPublicUser(updated)
    });
  } catch (error) {
    return fail(res, 'Ошибка изменения безлимитного баланса', 500);
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { id: publicId } = req.params;
    const user = getUserByPublicId(publicId);
    if (!user) return fail(res, 'Пользователь не найден', 404);

    const subscriptions = Subscription.getByUser(user.id);
    for (const sub of subscriptions) {
      await vpnProvisioning.disconnectSubscriptionResources(sub, { mode: 'delete' }).catch(() => {});
    }

    const changes = db.transaction(() => {
      db.prepare('UPDATE users SET referred_by_user_id = NULL WHERE referred_by_user_id = ?').run(user.id);
      db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM payments WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM promo_redemptions WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM referral_rewards WHERE inviter_user_id = ? OR invitee_user_id = ?').run(user.id, user.id);
      db.prepare('DELETE FROM auth_codes WHERE email = ?').run(user.email);
      return User.delete(user.id).changes;
    })();

    if (!changes) return fail(res, 'Пользователь не найден', 404);
    return ok(res, { message: `Пользователь ${user.email} удалён` });
  } catch (error) {
    return fail(res, 'Ошибка удаления пользователя', 500);
  }
});

router.put('/users/:id/subscription', async (req, res) => {
  try {
    const { id: publicId } = req.params;
    const { type, status, action, message } = req.body;

    const validTypes = ['vpn', 'none'];
    if (type && !validTypes.includes(type)) return fail(res, 'Неверный тип подписки', 400);

    const user = getUserByPublicId(publicId);
    if (!user) return fail(res, 'Пользователь не найден', 404);
    const userId = user.id;

    if (action === 'resume' && type && type !== 'none') {
      const cancelledSubs = Subscription.getCancelledByUser(userId, type);
      if (cancelledSubs.length === 0) return fail(res, 'Отменённая подписка не найдена', 404);
      if (Subscription.getActiveByUser(userId, type).length > 0) return fail(res, 'У пользователя уже есть активная подписка', 400);

      const sub = cancelledSubs[0];
      await resumeSubscription(sub, type);
      await notifySubscriptionChange({
        user,
        type,
        statusText: 'active',
        customMessage: message,
        adminId: req.admin?.id
      });
      return ok(res, { message: 'Подписка возобновлена', subscription: { id: sub.id, type: sub.type, status: 'active' } });
    }

    if (!type || type === 'none') {
      const allActiveSubs = Subscription.getActiveByUser(userId);
      for (const sub of allActiveSubs) await cancelSubscription(sub, sub.type);
      if (allActiveSubs.length > 0) {
        await notifySubscriptionChange({
          user,
          type: 'vpn',
          statusText: 'cancelled',
          customMessage: message,
          adminId: req.admin?.id
        });
      }
      return ok(res, { message: 'Все подписки отменены', cancelled: allActiveSubs.length });
    }

    const existingSubs = Subscription.getActiveByUser(userId, type);
    if (existingSubs.length > 0) {
      const sub = existingSubs[0];
      const newStatus = status || sub.status;

      if (newStatus === 'cancelled') {
        await cancelSubscription(sub, type);
        await notifySubscriptionChange({
          user,
          type,
          statusText: 'cancelled',
          customMessage: message,
          adminId: req.admin?.id
        });
        return ok(res, { message: 'Подписка отменена', subscription: { id: sub.id, type: sub.type, status: 'cancelled' } });
      }

      let updatedSub = sub;
      if (newStatus === 'active') {
        const dailyRate = Number(Subscription.getDailyRate(type) || 0);
        if (!dailyRate) return fail(res, 'Не задан дневной тариф подписки', 400);
        const now = new Date();
        const nextChargeAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        updatedSub = Subscription.update(sub.id, {
          status: 'active',
          daily_rate: dailyRate,
          expires_at: nextChargeAt,
          next_charge_at: nextChargeAt,
          first_charge_at: sub.first_charge_at || now.toISOString(),
          last_charge_at: now.toISOString()
        });
        if (type === 'vpn') {
          await vpnProvisioning.ensureProvisionedForSubscription(updatedSub, user).catch(() => {});
        }
      } else {
        updatedSub = Subscription.update(sub.id, { status: newStatus });
      }

      await notifySubscriptionChange({
        user,
        type,
        statusText: updatedSub.status || newStatus,
        customMessage: message,
        adminId: req.admin?.id
      });

      return ok(res, {
        message: newStatus === 'active' ? 'Подписка обновлена' : 'Подписка отменена',
        subscription: {
          id: updatedSub.id,
          type: updatedSub.type,
          status: updatedSub.status,
          dailyRate: updatedSub.daily_rate || null,
          nextChargeAt: updatedSub.next_charge_at || null,
          expiresAt: updatedSub.expires_at
        }
      });
    }

    if (status === 'active') {
      const { subscription, protocols } = await createDailySubscriptionForAdmin(user, type);
      await notifySubscriptionChange({
        user,
        type,
        statusText: 'active',
        customMessage: message,
        adminId: req.admin?.id
      });
      return ok(res, {
        message: 'Подписка создана',
        subscription: {
          id: subscription.id,
          type: subscription.type,
          status: subscription.status,
          dailyRate: subscription.daily_rate || null,
          nextChargeAt: subscription.next_charge_at || null,
          expiresAt: subscription.expires_at
        },
        protocols
      });
    }

    return fail(res, 'Активная подписка не найдена', 404);
  } catch (error) {
    return fail(res, 'Ошибка управления подпиской', 500);
  }
});

router.get('/users/:id/subscription-state', async (req, res) => {
  try {
    const { id: publicId } = req.params;
    const user = getUserByPublicId(publicId);
    if (!user) return fail(res, 'Пользователь не найден', 404);

    const allSubs = Subscription.getByUser(user.id);

    return ok(res, {
      user: { id: user.user_uuid || User.ensureUuid(user.id), email: user.email, balance: user.balance },
      subscriptions: allSubs.map(s => ({
        id: s.id,
        type: s.type,
        status: s.status,
        dailyRate: s.daily_rate || null,
        expiresAt: s.expires_at,
        nextChargeAt: s.next_charge_at || null,
        configData: vpnProvisioning.parseConfigData(s.config_data)
      }))
    });
  } catch (error) {
    return fail(res, 'Ошибка получения состояния подписки', 500);
  }
});

router.post('/users/:id/subscription-test', async (req, res) => {
  try {
    const { id: publicId } = req.params;
    const { action } = req.body;

    const validActions = [
      'pause',
      'unpause',
      'delete-vpn',
      'cancel',
      'resume',
      'activate',
      'email-code',
      'email-low-balance',
      'email-insufficient-funds',
      'push-low-balance',
      'push-funds-depleted'
    ];
    if (!validActions.includes(action)) return fail(res, `Неверное действие. Доступные: ${validActions.join(', ')}`, 400);

    const user = getUserByPublicId(publicId);
    if (!user) return fail(res, 'Пользователь не найден', 404);

    const allSubs = Subscription.getByUser(user.id);
    const vpnSubs = allSubs.filter(s => s.type === 'vpn');

    const formatSub = (s) => ({
      id: s.id,
      type: s.type,
      status: s.status,
      dailyRate: s.daily_rate || null,
      expiresAt: s.expires_at,
      nextChargeAt: s.next_charge_at || null,
      configData: vpnProvisioning.parseConfigData(s.config_data)
    });

    const currentBalance = user.balance;

    if (action === 'email-code') {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const result = await EmailService.sendVerificationCode(user.email, code);
      if (!result.success) {
        return fail(res, `Не удалось отправить email-код: ${result.error || 'unknown error'}`, 500);
      }
      return ok(res, {
        message: `Тестовый код входа отправлен на ${user.email}`,
        channel: 'email'
      });
    }

    if (action === 'email-low-balance') {
      const totalDailyRate = Number(Subscription.getTotalDailyRate(user.id) || 15);
      const daysRemaining = Math.max(1, Number(Subscription.calculateDaysRemaining(user.id) || 3));
      const result = await EmailService.sendLowBalanceWarning(user.email, daysRemaining, Number(user.balance || 0), totalDailyRate);
      if (!result.success) {
        return fail(res, `Не удалось отправить email о низком балансе: ${result.error || 'unknown error'}`, 500);
      }
      return ok(res, {
        message: `Email «низкий баланс» отправлен на ${user.email}`,
        channel: 'email'
      });
    }

    if (action === 'email-insufficient-funds') {
      const totalDailyRate = Number(Subscription.getTotalDailyRate(user.id) || 15);
      const result = await EmailService.sendInsufficientFundsWarning(user.email, Number(user.balance || 0), totalDailyRate);
      if (!result.success) {
        return fail(res, `Не удалось отправить email о недостатке средств: ${result.error || 'unknown error'}`, 500);
      }
      return ok(res, {
        message: `Email «недостаточно средств» отправлен на ${user.email}`,
        channel: 'email'
      });
    }

    if (action === 'push-low-balance') {
      const result = await PushService.sendToUser(user.id, {
        title: '⚠️ Баланс заканчивается',
        body: `Тест: баланс ${Number(user.balance || 0).toFixed(0)} ₽. Проверьте push-уведомления.`,
        tag: 'admin_test_low_balance'
      });
      return ok(res, {
        message: `Push low-balance: доставлено ${result.sent}, ошибок ${result.failed}`,
        channel: 'push',
        sent: result.sent,
        failed: result.failed
      });
    }

    if (action === 'push-funds-depleted') {
      const result = await PushService.sendToUser(user.id, {
        title: '🔴 Средства закончились',
        body: 'Тест: подписка приостановлена из-за нехватки средств. Проверьте push-уведомления.',
        tag: 'admin_test_depleted'
      });
      return ok(res, {
        message: `Push insufficient-funds: доставлено ${result.sent}, ошибок ${result.failed}`,
        channel: 'push',
        sent: result.sent,
        failed: result.failed
      });
    }

    if (action === 'pause') {
      if (vpnSubs.length === 0) return fail(res, 'Нет VPN подписок', 400);
      const sub = vpnSubs[0];
      if (sub.status !== 'active') return fail(res, 'Подписка не активна', 400);
      await vpnProvisioning.disconnectSubscriptionResources(sub, { mode: 'pause' });
      return ok(res, { message: 'VPN поставлен на паузу (enable=false)', balance: currentBalance, subscription: formatSub(sub) });
    }

    if (action === 'unpause') {
      if (vpnSubs.length === 0) return fail(res, 'Нет VPN подписок', 400);
      const sub = vpnSubs[0];
      if (sub.status !== 'active') return fail(res, 'Подписка не активна', 400);
      await vpnProvisioning.unpauseSubscriptionResources(sub);
      return ok(res, { message: 'VPN снят с паузы (enable=true)', balance: currentBalance, subscription: formatSub(sub) });
    }

    if (action === 'delete-vpn') {
      if (vpnSubs.length === 0) return fail(res, 'Нет VPN подписок', 400);
      const sub = vpnSubs[0];
      if (sub.status !== 'active') return fail(res, 'Подписка не активна', 400);
      await vpnProvisioning.disconnectSubscriptionResources(sub, { mode: 'delete' });
      return ok(res, { message: 'VPN конфиги удалены из PasarGuard', balance: currentBalance, subscription: formatSub(sub) });
    }

    if (action === 'cancel') {
      const activeSubs = allSubs.filter(s => s.status === 'active');
      if (activeSubs.length === 0) return fail(res, 'Нет активных подписок', 400);
      for (const sub of activeSubs) {
        await cancelSubscription(sub, sub.type);
      }
      const updated = Subscription.getByUser(user.id);
      return ok(res, {
        message: `Отменено подписок: ${activeSubs.length}. Доступ сохранится до конца оплаченного периода.`,
        balance: currentBalance,
        subscriptions: updated.filter(s => s.type === 'vpn').map(formatSub)
      });
    }

    if (action === 'resume') {
      const cancelledSubs = Subscription.getCancelledByUser(user.id, 'vpn');
      if (cancelledSubs.length === 0) return fail(res, 'Нет отменённых VPN подписок для возобновления', 404);
      const sub = cancelledSubs[0];
      await resumeSubscription(sub, 'vpn');
      const updated = Subscription.getByUser(user.id);
      return ok(res, {
        message: 'Подписка возобновлена, VPN пере-провижинен',
        balance: currentBalance,
        subscriptions: updated.filter(s => s.type === 'vpn').map(formatSub)
      });
    }

    if (action === 'activate') {
      const activeSubs = allSubs.filter(s => s.status === 'active');
      if (activeSubs.length > 0) return fail(res, 'Уже есть активная подписка', 400);
      const { subscription, protocols } = await createDailySubscriptionForAdmin(user, 'vpn');
      return ok(res, {
        message: 'Подписка создана, VPN провижинен',
        balance: currentBalance,
        subscription: formatSub(subscription),
        protocols
      });
    }

    return fail(res, 'Неизвестное действие', 400);
  } catch (error) {
    return fail(res, 'Ошибка тестирования подписки: ' + error.message, 500);
  }
});

router.get('/recent-users', async (req, res) => {
  try {
    const users = User.getRecent(parsePaging(req.query.limit, 10));
    const usersWithSubs = users.map((u) => {
      const subs = Subscription.getActiveByUser(u.id);
      return { ...toPublicUser(u), subscriptions: subs.map((s) => s.type) };
    });
    return ok(res, { users: usersWithSubs });
  } catch (error) {
    return fail(res, 'Ошибка получения пользователей', 500);
  }
});

module.exports = router;
