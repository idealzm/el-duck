const { db } = require('../config/database');
const Payment = require('../models/Payment');
const User = require('../models/User');
const PromoCode = require('../models/PromoCode');
const ReferralReward = require('../models/ReferralReward');
const { calculateReward, getReferralSettings } = require('./promotions');

function parseProviderData(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function finalizePayment(paymentId) {
  const payment = Payment.getByPaymentId(paymentId) || Payment.getById(paymentId);
  if (!payment) return { success: false, error: 'Платёж не найден' };
  if (payment.status === 'completed') return { success: true, alreadyCompleted: true };

  const providerData = parseProviderData(payment.provider_data) || {};
  const promoSnapshot = providerData.promoSnapshot || null;

  const tx = db.transaction(() => {
    const freshPayment = Payment.getById(payment.id);
    if (!freshPayment) {
      return { success: false, error: 'Платёж не найден' };
    }
    if (freshPayment.status === 'completed') {
      return { success: true, alreadyCompleted: true };
    }

    Payment.complete(freshPayment.id);
    User.updateBalance(freshPayment.user_id, freshPayment.amount);

    let promoBonus = 0;
    if (promoSnapshot && promoSnapshot.promoCodeId && promoSnapshot.code) {
      const promo = PromoCode.getById(promoSnapshot.promoCodeId);
      if (promo && promo.is_active) {
        const perUserUsed = PromoCode.getUserRedemptionsCount(promo.id, freshPayment.user_id);
        const totalLimitOk = promo.total_limit === null || Number(promo.used_count) < Number(promo.total_limit);
        const perUserLimitOk = promo.per_user_limit === null || perUserUsed < Number(promo.per_user_limit);

        if (totalLimitOk && perUserLimitOk && Number(freshPayment.amount) >= Number(promoSnapshot.minTopup || 0)) {
          promoBonus = calculateReward(
            Number(freshPayment.amount),
            promoSnapshot.rewardType,
            Number(promoSnapshot.rewardValue || 0),
            promoSnapshot.maxReward
          );

          if (promoBonus > 0) {
            PromoCode.createRedemption({
              promoCodeId: promo.id,
              userId: freshPayment.user_id,
              paymentId: freshPayment.id,
              amount: Number(freshPayment.amount),
              bonusAmount: promoBonus
            });
            PromoCode.incrementUsedCount(promo.id);
            User.updateBalance(freshPayment.user_id, promoBonus);
            Payment.logEvent(freshPayment.user_id, promoBonus, 'promo_bonus', {
              providerData: {
                promoCodeId: promo.id,
                promoCode: promo.code,
                sourcePaymentId: freshPayment.id
              }
            });
          }
        }
      }
    }

    let referralInviterBonus = 0;
    let referralInviteeBonus = 0;
    const invitee = User.getById(freshPayment.user_id);
    const referralSettings = getReferralSettings();
    const minTopup = Number(referralSettings.minTopup || 0);

    if (
      invitee &&
      referralSettings.enabled &&
      invitee.referred_by_user_id &&
      !invitee.referral_reward_granted_at &&
      Number(freshPayment.amount) >= minTopup
    ) {
      const inviter = User.getById(invitee.referred_by_user_id);
      if (inviter && inviter.id !== invitee.id) {
        referralInviterBonus = calculateReward(
          Number(freshPayment.amount),
          referralSettings.inviter.rewardType,
          referralSettings.inviter.rewardValue,
          referralSettings.inviter.maxReward
        );
        referralInviteeBonus = calculateReward(
          Number(freshPayment.amount),
          referralSettings.invitee.rewardType,
          referralSettings.invitee.rewardValue,
          referralSettings.invitee.maxReward
        );

        if (referralInviterBonus > 0) {
          User.updateBalance(inviter.id, referralInviterBonus);
          Payment.logEvent(inviter.id, referralInviterBonus, 'referral_bonus', {
            providerData: {
              role: 'inviter',
              inviteeUserId: invitee.id,
              sourcePaymentId: freshPayment.id
            }
          });
          ReferralReward.create({
            inviterUserId: inviter.id,
            inviteeUserId: invitee.id,
            paymentId: freshPayment.id,
            rewardFor: 'inviter',
            rewardType: referralSettings.inviter.rewardType,
            rewardValue: referralSettings.inviter.rewardValue,
            bonusAmount: referralInviterBonus
          });
        }

        if (referralInviteeBonus > 0) {
          User.updateBalance(invitee.id, referralInviteeBonus);
          Payment.logEvent(invitee.id, referralInviteeBonus, 'referral_bonus', {
            providerData: {
              role: 'invitee',
              inviterUserId: inviter.id,
              sourcePaymentId: freshPayment.id
            }
          });
          ReferralReward.create({
            inviterUserId: inviter.id,
            inviteeUserId: invitee.id,
            paymentId: freshPayment.id,
            rewardFor: 'invitee',
            rewardType: referralSettings.invitee.rewardType,
            rewardValue: referralSettings.invitee.rewardValue,
            bonusAmount: referralInviteeBonus
          });
        }

        User.markReferralRewardGranted(invitee.id);
      }
    }

    return {
      success: true,
      paymentId: freshPayment.id,
      baseAmount: Number(freshPayment.amount),
      promoBonus,
      referralInviterBonus,
      referralInviteeBonus
    };
  });

  try {
    return tx();
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE constraint failed: promo_redemptions.payment_id')) {
      return { success: true, alreadyCompleted: true };
    }
    return { success: false, error: error.message || 'Ошибка финализации платежа' };
  }
}

module.exports = {
  finalizePayment
};
