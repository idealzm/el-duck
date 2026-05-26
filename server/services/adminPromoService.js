const PromoCode = require('../models/PromoCode');
const AppError = require('../utils/AppError');

function ensureInstantGrantCompatible(rewardType, instantGrant) {
  if (instantGrant && rewardType !== 'fixed') {
    throw new AppError('Для мгновенного начисления поддерживается только fixed-бонус', 400);
  }
}

function listPromoCodes(limit, offset) {
  return PromoCode.getAll(limit, offset);
}

function createPromoCode(payload) {
  const normalized = {
    ...payload,
    rewardType: payload.rewardType || 'fixed'
  };

  ensureInstantGrantCompatible(normalized.rewardType, !!normalized.instantGrant);
  return PromoCode.create(normalized);
}

function updatePromoCode(id, patch) {
  const promo = PromoCode.getById(id);
  if (!promo) {
    throw new AppError('Промокод не найден', 404);
  }

  const resultingType = patch.rewardType || promo.reward_type;
  const resultingInstantGrant = patch.instantGrant !== undefined ? !!patch.instantGrant : !!promo.instant_grant;
  ensureInstantGrantCompatible(resultingType, resultingInstantGrant);

  return PromoCode.update(id, patch);
}

function deletePromoCode(id) {
  const promo = PromoCode.getById(id);
  if (!promo) {
    throw new AppError('Промокод не найден', 404);
  }

  PromoCode.delete(id);
}

function getPromoCodeRedemptions(id, limit, offset) {
  return PromoCode.getRedemptionsByPromo(id, limit, offset);
}

module.exports = {
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  getPromoCodeRedemptions
};
