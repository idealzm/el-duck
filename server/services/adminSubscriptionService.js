const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { db } = require('../config/database');
const vpnProvisioning = require('./vpnProvisioning');

function safeParseJson(raw, fallback = null) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
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

async function cancelSubscription(subscription, type) {
  let expiresAt;
  if (subscription.daily_rate && subscription.next_charge_at) {
    expiresAt = new Date(subscription.next_charge_at);
  } else {
    expiresAt = new Date(subscription.expires_at);
  }

  const expiresAtISO = expiresAt.toISOString();
  Subscription.update(subscription.id, { status: 'cancelled', expires_at: expiresAtISO });

  return expiresAtISO;
}

async function resumeSubscription(subscription, type) {
  Subscription.resume(subscription.id);

  if (type === 'vpn') {
    const user = User.getById(subscription.user_id);
    if (user) {
      await vpnProvisioning.ensureProvisionedForSubscription(subscription, user).catch(() => {});
    }
  }
}

async function createDailySubscriptionForAdmin(user, type) {
  const dailyRate = Number(Subscription.getDailyRate(type) || 0);
  if (!dailyRate) {
    throw new Error('DAILY_RATE_NOT_FOUND');
  }

  const provisioned = await vpnProvisioning.provisionForUser(user);

  try {
    const tx = db.transaction(() => {
      const created = Subscription.createDaily(user.id, type, dailyRate);
      Subscription.update(created.id, { config_data: provisioned.configData });
      return Subscription.getById(created.id);
    });

    const subscription = tx();
    return { subscription, protocols: provisioned.protocols };
  } catch (error) {
    await cleanupProvisionedResources(provisioned.createdResources);
    throw error;
  }
}

module.exports = {
  cancelSubscription,
  resumeSubscription,
  createDailySubscriptionForAdmin
};
