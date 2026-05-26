const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Setting = require('../models/Setting');
const vpnProvisioning = require('./vpnProvisioning');

function extractReferralCodeFromInput({ code, link }) {
  const directCode = String(code || '').trim().toUpperCase();
  if (directCode) return directCode;

  const linkValue = String(link || '').trim();
  if (!linkValue) return '';

  try {
    const parsed = new URL(linkValue);
    return String(parsed.searchParams.get('ref') || '').trim().toUpperCase();
  } catch (_) {
    return '';
  }
}

function getPublicBaseUrl(req, appConfig) {
  const configured = String(appConfig.app.url || '').trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      const host = String(parsed.hostname || '').toLowerCase();
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';

      if (!isLocal) {
        return configured.replace(/\/$/, '');
      }
    } catch (_) {
      return configured.replace(/\/$/, '');
    }
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(req.get('host') || '').trim();
  const proto = forwardedProto || req.protocol || 'https';

  if (host) {
    return `${proto}://${host}`.replace(/\/$/, '');
  }

  return 'http://localhost:3000';
}

function safeParseJson(raw, fallback = null) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function mapProtocolsFromConfig(configData) {
  const resources = Array.isArray(configData?.resources) ? configData.resources : [];
  return resources.map((item) => ({
    key: item.key,
    serverKey: item.serverKey || 'default',
    serverName: item.serverName || item.serverKey || 'default',
    inboundId: item.inboundId,
    protocol: item.protocol,
    title: item.title,
    description: item.description,
    subscriptionLink: item.subscriptionLink
  }));
}

function pickPrimarySubscriptionLink(configData, protocols) {
  const fromConfig = String(configData?.subscriptionLink || '').trim();
  if (fromConfig) return fromConfig;
  const list = Array.isArray(protocols) ? protocols : [];
  for (const item of list) {
    const link = String(item?.subscriptionLink || '').trim();
    if (link) return link;
  }
  return null;
}

async function normalizeSubscriptions(subscriptions, user) {
  const normalizedSubscriptions = [];

  for (const sub of subscriptions) {
    let configData = safeParseJson(sub.config_data, null);
    let protocols = mapProtocolsFromConfig(configData);

    if (sub.type === 'vpn' && sub.status === 'active') {
      try {
        const provisioned = await vpnProvisioning.getUserProtocols(sub, user);
        configData = provisioned.configData;
        protocols = provisioned.protocols;
      } catch (vpnError) {
        console.error('[User/me] VPN sync error:', vpnError.message);
      }
    }

    normalizedSubscriptions.push({
      id: sub.id,
      type: sub.type,
      status: sub.status,
      expiresAt: sub.expires_at,
      createdAt: sub.created_at,
      dailyRate: sub.daily_rate || null,
      nextChargeAt: sub.next_charge_at || null,
      configData,
      protocols,
      subscriptionLink: pickPrimarySubscriptionLink(configData, protocols)
    });
  }

  return normalizedSubscriptions;
}

async function buildMePayload(user, req, appConfig) {
  const subscriptions = Subscription.getValidByUser(user.id);
  const userUuid = User.ensureUuid(user.id);
  const referralCode = User.ensureReferralCode(user.id);
  const referralSettings = Setting.getReferralSettings();
  const referralBaseUrl = getPublicBaseUrl(req, appConfig);

  const prices = Setting.getPrices();
  const limits = Setting.getTopupLimits();

  const dailySubs = subscriptions.filter((s) => s.daily_rate && s.status === 'active');
  const totalDailyRate = dailySubs.reduce((sum, s) => sum + Number(s.daily_rate || 0), 0);
  const daysRemaining = totalDailyRate > 0 ? Math.floor(user.balance / totalDailyRate) : 0;

  let nextChargeAt = null;
  if (dailySubs.length > 0) {
    const nextChargeDates = dailySubs.map((s) => new Date(s.next_charge_at));
    nextChargeAt = new Date(Math.min(...nextChargeDates));
  }

  const normalizedSubscriptions = await normalizeSubscriptions(subscriptions, user);

  return {
    user: {
      id: userUuid,
      uuid: userUuid,
      email: user.email,
      balance: user.balance,
      unlimitedBalance: !!user.unlimited_balance,
      createdAt: user.created_at,
      referralCode,
      referralLink: `${referralBaseUrl}/?ref=${encodeURIComponent(referralCode)}`,
      referralEnabled: !!referralSettings.enabled,
      referredByUserId: user.referred_by_user_id || null,
      consentAccepted: !!user.consent_accepted_at,
      consentAcceptedAt: user.consent_accepted_at || null
    },
    subscriptions: normalizedSubscriptions,
    dailyRate: totalDailyRate,
    daysRemaining,
    nextChargeAt: nextChargeAt ? nextChargeAt.toISOString() : null,
    prices,
    limits
  };
}

module.exports = {
  extractReferralCodeFromInput,
  getPublicBaseUrl,
  safeParseJson,
  mapProtocolsFromConfig,
  buildMePayload
};
