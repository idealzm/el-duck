const Setting = require('../models/Setting');
const PromoCode = require('../models/PromoCode');

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseBool(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function calculateReward(amount, rewardType, rewardValue, maxReward) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return 0;

  let reward = 0;
  if (rewardType === 'percent') {
    reward = amt * (Number(rewardValue) / 100);
  } else {
    reward = Number(rewardValue);
  }

  if (Number(maxReward) > 0) {
    reward = Math.min(reward, Number(maxReward));
  }

  return roundMoney(Math.max(0, reward));
}

function getReferralSettings() {
  return {
    enabled: parseBool(Setting.get('referral_enabled'), true),
    minTopup: parseNumber(Setting.get('referral_min_topup'), 100),
    inviter: {
      rewardType: Setting.get('referral_inviter_reward_type') || 'fixed',
      rewardValue: parseNumber(Setting.get('referral_inviter_reward_value'), 50),
      maxReward: parseNumber(Setting.get('referral_inviter_max_reward'), 0)
    },
    invitee: {
      rewardType: Setting.get('referral_invitee_reward_type') || 'fixed',
      rewardValue: parseNumber(Setting.get('referral_invitee_reward_value'), 30),
      maxReward: parseNumber(Setting.get('referral_invitee_max_reward'), 0)
    }
  };
}

function getPromoSettingsSnapshot(promo) {
  return {
    promoCodeId: promo.id,
    code: promo.code,
    minTopup: Number(promo.min_topup || 0),
    rewardType: promo.reward_type,
    rewardValue: Number(promo.reward_value || 0),
    instantGrant: !!promo.instant_grant,
    maxReward: promo.max_reward !== null && promo.max_reward !== undefined ? Number(promo.max_reward) : null,
    perUserLimit: Number(promo.per_user_limit || 1),
    totalLimit: promo.total_limit !== null && promo.total_limit !== undefined ? Number(promo.total_limit) : null
  };
}

function validatePromoForUser({ userId, amount, code, allowInstant = false }) {
  const normalizedCode = PromoCode.normalizeCode(code);
  if (!normalizedCode) {
    return { ok: false, error: 'Промокод не указан' };
  }
  if (!/^[A-Z0-9_-]{3,32}$/.test(normalizedCode)) {
    return { ok: false, error: 'Неверный формат промокода' };
  }

  const promo = PromoCode.getByCode(normalizedCode);
  if (!promo || !promo.is_active) {
    return { ok: false, error: 'Промокод не найден или неактивен' };
  }

  const now = new Date();
  if (promo.starts_at && new Date(promo.starts_at) > now) {
    return { ok: false, error: 'Промокод ещё не активен' };
  }
  if (promo.ends_at && new Date(promo.ends_at) < now) {
    return { ok: false, error: 'Срок действия промокода истёк' };
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { ok: false, error: 'Некорректная сумма' };
  }

  if (promo.instant_grant && !allowInstant) {
    return { ok: false, error: 'Этот промокод активируется отдельно и не применяется к пополнению' };
  }

  if (promo.instant_grant && allowInstant) {
    const bonusInstant = calculateReward(1, 'fixed', promo.reward_value, promo.max_reward);
    return {
      ok: true,
      promo,
      bonus: bonusInstant,
      snapshot: getPromoSettingsSnapshot(promo)
    };
  }

  if (numericAmount < Number(promo.min_topup || 0)) {
    return { ok: false, error: `Минимальная сумма для промокода: ${promo.min_topup} ₽` };
  }

  if (promo.total_limit !== null && promo.total_limit !== undefined && Number(promo.used_count) >= Number(promo.total_limit)) {
    return { ok: false, error: 'Лимит использований промокода исчерпан' };
  }

  const usedByUser = PromoCode.getUserRedemptionsCount(promo.id, userId);
  if (promo.per_user_limit !== null && promo.per_user_limit !== undefined && usedByUser >= Number(promo.per_user_limit)) {
    return { ok: false, error: 'Вы уже использовали этот промокод максимальное число раз' };
  }

  const bonus = calculateReward(numericAmount, promo.reward_type, promo.reward_value, promo.max_reward);
  return {
    ok: true,
    promo,
    bonus,
    snapshot: getPromoSettingsSnapshot(promo)
  };
}

function validateInstantPromoForUser({ userId, code }) {
  const normalizedCode = PromoCode.normalizeCode(code);
  if (!normalizedCode) {
    return { ok: false, error: 'Промокод не указан' };
  }
  if (!/^[A-Z0-9_-]{3,32}$/.test(normalizedCode)) {
    return { ok: false, error: 'Неверный формат промокода' };
  }

  const promo = PromoCode.getByCode(normalizedCode);
  if (!promo || !promo.is_active) {
    return { ok: false, error: 'Промокод не найден или неактивен' };
  }
  if (!promo.instant_grant) {
    return { ok: false, error: 'Этот промокод применяется только к пополнению' };
  }
  if (promo.reward_type !== 'fixed') {
    return { ok: false, error: 'Неверная конфигурация промокода' };
  }

  const now = new Date();
  if (promo.starts_at && new Date(promo.starts_at) > now) {
    return { ok: false, error: 'Промокод ещё не активен' };
  }
  if (promo.ends_at && new Date(promo.ends_at) < now) {
    return { ok: false, error: 'Срок действия промокода истёк' };
  }

  if (promo.total_limit !== null && promo.total_limit !== undefined && Number(promo.used_count) >= Number(promo.total_limit)) {
    return { ok: false, error: 'Лимит использований промокода исчерпан' };
  }

  const usedByUser = PromoCode.getUserRedemptionsCount(promo.id, userId);
  if (promo.per_user_limit !== null && promo.per_user_limit !== undefined && usedByUser >= Number(promo.per_user_limit)) {
    return { ok: false, error: 'Вы уже использовали этот промокод максимальное число раз' };
  }

  const bonus = calculateReward(1, 'fixed', promo.reward_value, promo.max_reward);
  return { ok: true, promo, bonus };
}

module.exports = {
  roundMoney,
  calculateReward,
  getReferralSettings,
  validatePromoForUser,
  validateInstantPromoForUser
};
