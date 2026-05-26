const express = require('express');
const router = express.Router();
const { createValidator } = require('../middleware/validate');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Setting = require('../models/Setting');
const ReferralReward = require('../models/ReferralReward');
const authMiddleware = require('../middleware/auth');
const PushService = require('../services/pushService');
const { getReferralSettings } = require('../services/promotions');
const { createTopupPayment, previewPromo, redeemInstantPromo } = require('../services/userPaymentsService');
const {
  extractReferralCodeFromInput,
  getPublicBaseUrl,
  safeParseJson,
  buildMePayload
} = require('../services/userAccountService');
const config = require('../config/env');
const { ok, fail } = require('../utils/httpResponse');
const AppError = require('../utils/AppError');
const {
  getPendingPopupForUser,
  acknowledgePopupForUser
} = require('../services/adminPopupMessageService');

const validateTopup = createValidator({
  amount: { required: true, type: 'number', min: 1 },
  promoCode: { required: false, type: 'string', minLength: 3, maxLength: 32 }
});

const validateBindReferral = createValidator({
  code: { required: false, type: 'string', minLength: 3, maxLength: 200 },
  link: { required: false, type: 'string', minLength: 8, maxLength: 2048 }
});

function getCurrentUserOrFail(req, res) {
  const user = User.getById(req.user.id);
  if (!user) {
    fail(res, 'Пользователь не найден', 404);
    return null;
  }
  return user;
}

const validatePromoPreview = createValidator({
  amount: { required: true, type: 'number', min: 1 },
  code: { required: true, type: 'string', minLength: 3, maxLength: 32 }
});

const validatePromoRedeem = createValidator({
  code: { required: true, type: 'string', minLength: 3, maxLength: 32 }
});

const validateConsentAccept = createValidator({
  accepted: { required: true, type: 'boolean', mustBeTrue: true }
});

// Все маршруты требуют авторизации
router.use(authMiddleware);

/**
 * GET /api/user/me
 * Данные текущего пользователя
 */
router.get('/me', async (req, res) => {
  try {
    const user = getCurrentUserOrFail(req, res);
    if (!user) return;
    const payload = await buildMePayload(user, req, config);
    return ok(res, payload);
  } catch (error) {
    console.error('Get user data error:', error);
    return fail(res, 'Ошибка получения данных', 500);
  }
});

/**
 * POST /api/user/consent/accept
 * Подтверждение пользовательских соглашений после первого входа
 */
router.post('/consent/accept', validateConsentAccept, async (req, res) => {
  try {
    const user = getCurrentUserOrFail(req, res);
    if (!user) return;

    if (!user.consent_accepted_at) {
      const consentIp = req.ip || req.connection.remoteAddress || null;
      const consentUserAgent = (req.headers['user-agent'] || '').slice(0, 512) || null;
      User.setConsent(user.id, {
        acceptedAt: new Date().toISOString(),
        ip: consentIp,
        userAgent: consentUserAgent,
        version: 'v1'
      });
    }

    return ok(res, { message: 'Согласие сохранено' });
  } catch (error) {
    console.error('Consent accept error:', error);
    return fail(res, 'Ошибка сохранения согласия', 500);
  }
});

/**
 * GET /api/user/popup/pending
 * Получение следующего обязательного popup-сообщения
 */
router.get('/popup/pending', async (req, res) => {
  try {
    const popup = getPendingPopupForUser(req.user.id);
    if (!popup) {
      return ok(res, { message: null });
    }

    return ok(res, {
      message: {
        id: popup.message_id,
        title: popup.title || 'Сообщение от администрации',
        body: popup.body,
        targetType: popup.target_type,
        priority: popup.priority || 'normal',
        expiresAt: popup.expires_at || null,
        createdAt: popup.created_at
      }
    });
  } catch (error) {
    return fail(res, 'Ошибка получения сообщения', 500);
  }
});

/**
 * POST /api/user/popup/:id/acknowledge
 * Подтверждение прочтения popup-сообщения
 */
router.post('/popup/:id/acknowledge', async (req, res) => {
  try {
    const user = getCurrentUserOrFail(req, res);
    if (!user) return;

    acknowledgePopupForUser({
      userId: user.id,
      messageId: req.params.id,
      ip: req.ip || req.connection.remoteAddress || null,
      userAgent: req.headers['user-agent'] || ''
    });

    return ok(res, { message: 'Подтверждение сохранено' });
  } catch (error) {
    if (error instanceof AppError) return fail(res, error.message, error.statusCode);
    return fail(res, 'Ошибка подтверждения сообщения', 500);
  }
});

/**
 * GET /api/user/balance
 * Баланс пользователя
 */
router.get('/balance', async (req, res) => {
  try {
    const user = getCurrentUserOrFail(req, res);
    if (!user) return;
    const limits = Setting.getTopupLimits();

    return ok(res, {
      balance: user.balance,
      limits
    });
  } catch (error) {
    console.error('Get balance error:', error);
    return fail(res, 'Ошибка получения баланса', 500);
  }
});

/**
 * POST /api/user/topup
 * Создание платежа для пополнения баланса
 */
router.post('/topup', validateTopup, async (req, res) => {
  try {
    const payload = await createTopupPayment({
      userId: req.user.id,
      amount: req.body.amount,
      promoCode: req.body.promoCode
    });
    return ok(res, payload);
  } catch (error) {
    if (error instanceof AppError) return fail(res, error.message, error.statusCode);
    return fail(res, 'Ошибка пополнения баланса', 500);
  }
});

/**
 * POST /api/user/referral/bind
 * Привязка пользователя к рефереру
 */
router.post('/referral/bind', validateBindReferral, async (req, res) => {
  try {
    const { code, link } = req.body;
    const normalized = extractReferralCodeFromInput({ code, link });
    if (!/^[A-Z0-9_-]{3,32}$/.test(normalized)) {
      return fail(res, 'Неверная реферальная ссылка', 400);
    }
    const user = getCurrentUserOrFail(req, res);
    if (!user) return;
    User.ensureReferralCode(user.id);

    if (user.referred_by_user_id) {
      return fail(res, 'Реферальная ссылка уже привязана', 400);
    }

    if (user.referral_code && normalized === user.referral_code) {
      return fail(res, 'Нельзя использовать свою реферальную ссылку', 400);
    }

    const inviter = User.getByReferralCode(normalized);
    if (!inviter) {
      return fail(res, 'Реферальная ссылка недействительна', 404);
    }
    if (inviter.id === user.id) {
      return fail(res, 'Нельзя использовать свою реферальную ссылку', 400);
    }

    const linked = User.bindReferral(user.id, inviter.id);
    if (!linked) {
      return fail(res, 'Не удалось привязать реферальную ссылку', 400);
    }

    return ok(res, { message: 'Реферальная ссылка успешно привязана' });
  } catch (error) {
    console.error('Bind referral error:', error);
    return fail(res, 'Ошибка привязки реферальной ссылки', 500);
  }
});

/**
 * GET /api/user/referral
 * Информация о реферальной программе пользователя
 */
router.get('/referral', async (req, res) => {
  try {
    const user = getCurrentUserOrFail(req, res);
    if (!user) return;

    const referralCode = User.ensureReferralCode(user.id);
    const settings = getReferralSettings();
    const referralBaseUrl = getPublicBaseUrl(req, config);

    const stats = ReferralReward.getUserSummary(user.id);

    return ok(res, {
      referral: {
        code: referralCode,
        link: `${referralBaseUrl}/?ref=${encodeURIComponent(referralCode)}`,
        referredByUserId: user.referred_by_user_id || null,
        referredAt: user.referred_at || null,
        rewardGrantedAt: user.referral_reward_granted_at || null,
        settings,
        stats
      }
    });
  } catch (error) {
    console.error('Get referral error:', error);
    return fail(res, 'Ошибка получения реферальных данных', 500);
  }
});

/**
 * POST /api/user/promo/validate
 * Предпросмотр бонуса по промокоду
 */
router.post('/promo/validate', validatePromoPreview, async (req, res) => {
  try {
    return ok(res, { promo: previewPromo({ userId: req.user.id, amount: req.body.amount, code: req.body.code }) });
  } catch (error) {
    if (error instanceof AppError) return fail(res, error.message, error.statusCode, { success: false });
    return fail(res, 'Ошибка проверки промокода', 500);
  }
});

/**
 * POST /api/user/promo/redeem
 * Мгновенная активация промокода на баланс
 */
router.post('/promo/redeem', validatePromoRedeem, async (req, res) => {
  try {
    const result = redeemInstantPromo({ userId: req.user.id, code: req.body.code });
    return ok(res, {
      message: `Промокод активирован. Начислено ${Number(result.bonusAmount).toFixed(2)} ₽`,
      bonus: Number(result.bonusAmount),
      balance: Number(result.updatedUser.balance)
    });
  } catch (error) {
    if (error instanceof AppError) return fail(res, error.message, error.statusCode, { success: false });
    return fail(res, 'Ошибка активации промокода', 400, { success: false });
  }
});

/**
 * GET /api/user/subscriptions
 * Список подписок пользователя
 */
router.get('/subscriptions', async (req, res) => {
  try {
    const subscriptions = Subscription.getByUser(req.user.id);

    return ok(res, {
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        type: sub.type,
        status: sub.status,
        expiresAt: sub.expires_at,
        createdAt: sub.created_at,
        configData: safeParseJson(sub.config_data, null)
      }))
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    return fail(res, 'Ошибка получения подписок', 500);
  }
});

/**
 * GET /api/user/config/:type
 * Получение конфигурации для подписки
 */
router.get('/config/:type', async (req, res) => {
  try {
    const { type } = req.params;

    if (type !== 'vpn') {
      return fail(res, 'Неверный тип подписки', 400);
    }

    const subscriptions = Subscription.getValidByUser(req.user.id, type);

    if (subscriptions.length === 0) {
      return fail(res, 'Активная подписка не найдена', 404);
    }

    subscriptions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const subscription = subscriptions[0];
    const configData = safeParseJson(subscription.config_data, null);

    return ok(res, {
      type,
      config: configData,
      expiresAt: subscription.expires_at
    });
  } catch (error) {
    console.error('Get config error:', error);
    return fail(res, 'Ошибка получения конфигурации', 500);
  }
});

/**
 * GET /api/user/payments
 * История платежей
 */
router.get('/payments', async (req, res) => {
  try {
    const payments = Payment.getByUser(req.user.id);

    return ok(res, {
      payments: payments.map(p => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        createdAt: p.created_at
      }))
    });
  } catch (error) {
    console.error('Get payments error:', error);
    return fail(res, 'Ошибка получения истории платежей', 500);
  }
});

/**
 * PUT /api/user/subscriptions/:type/cancel
 * Отмена подписки (доступ до следующего списания)
 */
router.put('/subscriptions/:type/cancel', async (req, res) => {
  try {
    const { type } = req.params;

    if (type !== 'vpn') {
      return fail(res, 'Неверный тип подписки', 400);
    }

    // Находим только активную подписку пользователя
    const subscriptions = Subscription.getActiveOnlyByUser(req.user.id, type);

    if (subscriptions.length === 0) {
      return fail(res, 'Активная подписка не найдена', 404);
    }

    const subscription = subscriptions[0];

    // Определяем дату окончания доступа
    let expiresAt;
    let message;

    if (subscription.next_charge_at) {
      // Daily billing: доступ до следующего списания
      expiresAt = new Date(subscription.next_charge_at);
      message = 'Подписка отменена. Доступ сохранится до следующего списания.';
    } else {
      // Monthly: доступ до конца текущего периода
      expiresAt = new Date(subscription.expires_at);
      message = 'Подписка отменена. Доступ сохранится до конца оплаченного периода.';
    }

    const expiresAtISO = expiresAt.toISOString();

    // Обновляем статус и дату окончания
    Subscription.update(subscription.id, { status: 'cancelled', expires_at: expiresAtISO });

    // НЕ отключаем внешние сервисы — доступ сохраняется до expires_at!
    // Отключение произойдёт в биллинге когда expires_at <= now
    console.log('[Cancel VPN] Подписка отменена, доступ сохранится до', expiresAtISO);

    return ok(res, {
      message,
      expiresAt: expiresAtISO
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return fail(res, error.message || 'Ошибка отмены подписки', 500);
  }
});

/**
 * GET /api/user/push/public-key
 */
router.get('/push/public-key', (req, res) => {
  return ok(res, { publicKey: PushService.getVapidPublicKey() });
});

/**
 * POST /api/user/push/subscribe
 */
router.post('/push/subscribe', async (req, res) => {
  try {
    const { endpoint, p256dh, auth } = req.body;
    if (!endpoint || !p256dh || !auth) {
      return fail(res, 'Missing subscription data', 400);
    }
    await PushService.subscribe(req.user.id, endpoint, p256dh, auth);
    return ok(res);
  } catch (error) {
    return fail(res, 'Subscribe error', 500);
  }
});

/**
 * POST /api/user/push/unsubscribe
 */
router.post('/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) await PushService.unsubscribe(req.user.id, endpoint);
    return ok(res);
  } catch (error) {
    return fail(res, 'Unsubscribe error', 500);
  }
});

module.exports = router;
