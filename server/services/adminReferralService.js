const Setting = require('../models/Setting');
const ReferralReward = require('../models/ReferralReward');

function getReferralSettingsForAdmin() {
  const settings = Setting.getReferralSettings();
  return {
    enabled: settings.enabled,
    minTopup: settings.minTopup,
    inviterBonus: Number(settings.inviter.rewardValue || 0),
    inviteeBonus: Number(settings.invitee.rewardValue || 0)
  };
}

function updateReferralSettings({ enabled, minTopup, inviterBonus, inviteeBonus }) {
  if (enabled !== undefined) Setting.set('referral_enabled', String(!!enabled));
  if (minTopup !== undefined) Setting.set('referral_min_topup', String(Number(minTopup || 0)));

  if (inviterBonus !== undefined) {
    Setting.set('referral_inviter_reward_type', 'fixed');
    Setting.set('referral_inviter_reward_value', String(Number(inviterBonus || 0)));
    Setting.set('referral_inviter_max_reward', '0');
  }

  if (inviteeBonus !== undefined) {
    Setting.set('referral_invitee_reward_type', 'fixed');
    Setting.set('referral_invitee_reward_value', String(Number(inviteeBonus || 0)));
    Setting.set('referral_invitee_max_reward', '0');
  }
}

function getReferralStats() {
  return ReferralReward.getStats();
}

function listReferralRewards(limit, offset) {
  return ReferralReward.getRecent(limit, offset);
}

function listTopInviters(limit) {
  return ReferralReward.getTopInviters(limit || 100);
}

module.exports = {
  getReferralSettingsForAdmin,
  updateReferralSettings,
  getReferralStats,
  listReferralRewards,
  listTopInviters
};
