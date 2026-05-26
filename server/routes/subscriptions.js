const express = require('express');
const router = express.Router();
const { createValidator } = require('../middleware/validate');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { db } = require('../config/database');
const vpnProvisioning = require('../services/vpnProvisioning');
const { ok, fail } = require('../utils/httpResponse');

const validateCreateSubscription = createValidator({
  type: { required: true, enum: ['vpn'] }
});

router.use(authMiddleware);

function ensureVpnType(type, res) {
  if (type !== 'vpn') {
    fail(res, 'Неверный тип подписки', 400);
    return false;
  }
  return true;
}

function pickLatestSubscription(items) {
  const list = Array.isArray(items) ? items.slice() : [];
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return list[0] || null;
}

async function cleanupProvisionedResources(resources) {
  for (const item of resources || []) {
    if (!item.inboundId && !item.email && !item.username) continue;
    await vpnProvisioning.disconnectSubscriptionResources({
      provider: 'pasarguard',
      resources: [item]
    }, { mode: 'delete' }).catch(() => {});
  }
}

router.post('/create', validateCreateSubscription, async (req, res) => {
  try {
    const { type } = req.body;
    if (!ensureVpnType(type, res)) return;

    const dailyRate = Subscription.getDailyRate(type);
    if (!dailyRate) {
      return fail(res, 'Тариф не найден', 400);
    }

    const user = User.getById(req.user.id);
    if (!user) {
      return fail(res, 'Пользователь не найден', 404);
    }

    if (Number(user.balance) < Number(dailyRate)) {
      return fail(res, `Недостаточно средств. Требуется минимум ${dailyRate} ₽ на первый день, у вас ${user.balance} ₽`, 400);
    }

    const existingSubs = Subscription.getActiveByUser(req.user.id, type);
    if (existingSubs.length > 0) {
      return fail(res, 'У вас уже есть активная подписка VPN', 400);
    }

    const cancelledSubs = Subscription.getCancelledByUser(req.user.id, type);
    const now = new Date();
    const validCancelled = cancelledSubs.filter((item) => new Date(item.expires_at) > now);
    if (validCancelled.length > 0) {
      return fail(res, 'У вас есть отменённая подписка VPN. Возобновите её вместо создания новой.', 400, {
        hasCancelled: true,
        subscriptionId: validCancelled[0].id
      });
    }

    const provisioned = await vpnProvisioning.provisionForUser(user);

    let subscription;
    try {
      const tx = db.transaction(() => {
        const ok = User.deductBalance(req.user.id, dailyRate);
        if (!ok) {
          throw new Error('INSUFFICIENT_FUNDS');
        }

        const created = Subscription.createDaily(req.user.id, type, dailyRate);
        Subscription.update(created.id, { config_data: provisioned.configData });
        return created;
      });
      subscription = tx();
    } catch (error) {
      await cleanupProvisionedResources(provisioned.createdResources);
      if (error.message === 'INSUFFICIENT_FUNDS') {
        return fail(res, 'Недостаточно средств. Баланс изменился.', 400);
      }
      throw error;
    }

    return ok(res, {
      message: 'VPN подписка оформлена',
      subscription: {
        id: subscription.id,
        type: subscription.type,
        dailyRate: subscription.daily_rate,
        expiresAt: subscription.expires_at,
        nextChargeAt: subscription.next_charge_at
      },
      protocols: provisioned.protocols
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    return fail(res, `Ошибка оформления подписки: ${error.message}`, 500);
  }
});

router.put('/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    const subscription = Subscription.getById(id);
    if (!subscription || subscription.user_id !== req.user.id) {
      return fail(res, 'Подписка не найдена', 404);
    }
    if (subscription.status !== 'cancelled') {
      return fail(res, 'Подписка не отменена', 400);
    }

    const expiresAt = new Date(subscription.expires_at);
    if (expiresAt <= new Date()) {
      return fail(res, 'Срок действия подписки истёк', 400);
    }

    const existingActive = Subscription.getActiveByUser(req.user.id, subscription.type);
    if (existingActive.length > 0) {
      return fail(res, 'У вас уже есть активная подписка этого типа', 400);
    }

    const user = User.getById(req.user.id);
    if (!user) {
      return fail(res, 'Пользователь не найден', 404);
    }

    const provisioned = await vpnProvisioning.provisionForUser(user, subscription.config_data);

    let resumed;
    try {
      const updated = Subscription.resume(id);
      if (!updated) {
        await cleanupProvisionedResources(provisioned.createdResources);
        return fail(res, 'Подписка не найдена', 404);
      }

      Subscription.update(id, { config_data: provisioned.configData });
      resumed = Subscription.getById(id);
    } catch (error) {
      await cleanupProvisionedResources(provisioned.createdResources);
      throw error;
    }

    return ok(res, {
      message: 'Подписка возобновлена',
      subscription: {
        id: resumed.id,
        type: resumed.type,
        status: resumed.status,
        expiresAt: resumed.expires_at,
        nextChargeAt: resumed.next_charge_at
      },
      protocols: provisioned.protocols
    });
  } catch (error) {
    console.error('Resume subscription error:', error);
    return fail(res, `Ошибка возобновления подписки: ${error.message}`, 500);
  }
});

router.get('/config/:type', async (req, res) => {
  try {
    const { type } = req.params;
    if (!ensureVpnType(type, res)) return;

    const subscriptions = Subscription.getValidByUser(req.user.id, type);
    if (subscriptions.length === 0) {
      return fail(res, 'Активная подписка не найдена', 404);
    }

    const subscription = pickLatestSubscription(subscriptions);

    const now = new Date();
    const expiresAt = new Date(subscription.expires_at);
    if (expiresAt <= now) {
      await vpnProvisioning.disconnectSubscriptionResources(subscription, { mode: 'pause' }).catch(() => {});
      return fail(res, 'Подписка истекла', 403, { expiredAt: subscription.expires_at });
    }

    const user = User.getById(req.user.id);
    if (!user) {
      return fail(res, 'Пользователь не найден', 404);
    }

    const payload = await vpnProvisioning.getUserProtocols(subscription, user);
    const firstVless = payload.protocols.find((item) => item.protocol === 'vless');

    return ok(res, {
      type: 'vpn',
      expiresAt: subscription.expires_at,
      config: payload.configData,
      subscriptionLink: payload.subscriptionLink,
      protocols: payload.protocols,
      vless: firstVless ? {
        email: (payload.configData.resources.find((i) => i.key === firstVless.key) || {}).email || null,
        subscriptionLink: payload.subscriptionLink || firstVless.subscriptionLink
      } : null
    });
  } catch (error) {
    console.error('Get config error:', error);
    return fail(res, 'Ошибка получения конфигурации', 500);
  }
});

module.exports = router;
