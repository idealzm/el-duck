const Subscription = require('../models/Subscription');
const Setting = require('../models/Setting');
const { db } = require('../config/database');
const { updateReferralSettings } = require('./adminReferralService');

function getAdminSettings() {
  const settings = Setting.getAll();
  const templateRaw = String(settings.pasarguard_default_template_id || '').trim();
  const templateId = Number(templateRaw);
  return {
    vpnPrice: parseFloat(settings.vpn_price) || 299,
    minTopup: parseFloat(settings.min_topup) || 50,
    maxTopup: parseFloat(settings.max_topup) || 500,
    defaultUserTemplateId: Number.isInteger(templateId) && templateId > 0 ? templateId : null,
    referral: Setting.getReferralSettings()
  };
}

function updateAdminSettings(payload = {}) {
  const {
    vpnPrice,
    minTopup,
    maxTopup,
    defaultUserTemplateId,
    referral
  } = payload;

  const oldPrice = parseFloat(Setting.get('vpn_price')) || 299;
  const oldMinTopup = parseFloat(Setting.get('min_topup')) || 50;
  const oldMaxTopup = parseFloat(Setting.get('max_topup')) || 500;

  const nextPrice = Number.isFinite(Number(vpnPrice)) ? Number(vpnPrice) : oldPrice;
  const nextMinTopup = Number.isFinite(Number(minTopup)) ? Number(minTopup) : oldMinTopup;
  const nextMaxTopup = Number.isFinite(Number(maxTopup)) ? Number(maxTopup) : oldMaxTopup;

  if (nextPrice <= 0 || nextPrice > 100000) {
    throw new Error('Некорректная цена VPN');
  }
  if (nextMinTopup < 0 || nextMinTopup > 1000000) {
    throw new Error('Некорректный минимум пополнения');
  }
  if (nextMaxTopup <= 0 || nextMaxTopup > 1000000 || nextMaxTopup < nextMinTopup) {
    throw new Error('Некорректный максимум пополнения');
  }

  Setting.set('vpn_price', String(nextPrice));
  Setting.set('min_topup', String(nextMinTopup));
  Setting.set('max_topup', String(nextMaxTopup));

  if (defaultUserTemplateId === null || defaultUserTemplateId === undefined || defaultUserTemplateId === '') {
    Setting.set('pasarguard_default_template_id', '');
  } else if (Number.isInteger(Number(defaultUserTemplateId)) && Number(defaultUserTemplateId) > 0) {
    Setting.set('pasarguard_default_template_id', String(Number(defaultUserTemplateId)));
  }

  if (referral && typeof referral === 'object') {
    updateReferralSettings(referral);
  }

  if (oldPrice !== nextPrice) {
    const activeVpnSubs = db.prepare(`
      SELECT id FROM subscriptions WHERE type = 'vpn' AND status = 'active' AND daily_rate IS NOT NULL
    `).all();

    for (const sub of activeVpnSubs) {
      Subscription.update(sub.id, { daily_rate: nextPrice });
    }
  }
}

module.exports = {
  getAdminSettings,
  updateAdminSettings
};
