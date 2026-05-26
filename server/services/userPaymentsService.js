const User = require('../models/User');
const PromoCode = require('../models/PromoCode');
const Payment = require('../models/Payment');
const Setting = require('../models/Setting');
const { db } = require('../config/database');
const { getPaymentProvider } = require('./payment');
const { validatePromoForUser, validateInstantPromoForUser } = require('./promotions');
const AppError = require('../utils/AppError');
const config = require('../config/env');

async function createTopupPayment({ userId, amount, promoCode }) {
  if (!config.payment.topupEnabled) {
    throw new AppError('Пополнение через оплату временно отключено. Доступны только промокоды.', 503);
  }

  const limits = Setting.getTopupLimits();
  if (!amount || typeof amount !== 'number') {
    throw new AppError('Сумма обязательна', 400);
  }
  if (amount < limits.min || amount > limits.max) {
    throw new AppError(`Сумма должна быть от ${limits.min} до ${limits.max} ₽`, 400);
  }

  let promoSnapshot = null;
  if (promoCode) {
    const promoValidation = validatePromoForUser({ userId, amount, code: promoCode });
    if (!promoValidation.ok) {
      throw new AppError(promoValidation.error, 400);
    }
    promoSnapshot = promoValidation.snapshot;
  }

  const paymentProvider = getPaymentProvider();
  const result = await paymentProvider.createPayment(userId, amount, { promoSnapshot });
  if (!result.success) {
    throw new AppError(result.error || 'Ошибка создания платежа', 400);
  }

  return {
    paymentId: result.paymentId,
    url: result.url
  };
}

function previewPromo({ userId, amount, code }) {
  const result = validatePromoForUser({ userId, amount, code, allowInstant: true });
  if (!result.ok) {
    throw new AppError(result.error, 400);
  }

  return {
    code: result.promo.code,
    rewardType: result.promo.reward_type,
    rewardValue: Number(result.promo.reward_value),
    instantGrant: !!result.promo.instant_grant,
    bonus: result.bonus,
    minTopup: Number(result.promo.min_topup || 0)
  };
}

function redeemInstantPromo({ userId, code }) {
  const validation = validateInstantPromoForUser({ userId, code });
  if (!validation.ok) {
    throw new AppError(validation.error, 400);
  }

  const tx = db.transaction(() => {
    const promo = PromoCode.getById(validation.promo.id);
    if (!promo || !promo.is_active || !promo.instant_grant) {
      throw new AppError('Промокод недоступен', 400);
    }

    const usedByUser = PromoCode.getUserRedemptionsCount(promo.id, userId);
    if (promo.per_user_limit !== null && promo.per_user_limit !== undefined && usedByUser >= Number(promo.per_user_limit)) {
      throw new AppError('Вы уже использовали этот промокод максимальное число раз', 400);
    }

    if (promo.total_limit !== null && promo.total_limit !== undefined && Number(promo.used_count) >= Number(promo.total_limit)) {
      throw new AppError('Лимит использований промокода исчерпан', 400);
    }

    const bonusAmount = validation.bonus;
    PromoCode.createRedemption({
      promoCodeId: promo.id,
      userId,
      paymentId: null,
      amount: 0,
      bonusAmount
    });
    PromoCode.incrementUsedCount(promo.id);
    const updatedUser = User.updateBalance(userId, bonusAmount);
    Payment.logEvent(userId, bonusAmount, 'promo_bonus', {
      providerData: {
        promoCodeId: promo.id,
        promoCode: promo.code,
        instant: true
      }
    });
    return { bonusAmount, updatedUser };
  });

  return tx();
}

module.exports = {
  createTopupPayment,
  previewPromo,
  redeemInstantPromo
};
