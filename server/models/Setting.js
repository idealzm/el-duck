const { db } = require('../config/database');

class Setting {
  static get(key) {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key);
    return row ? row.value : null;
  }

  static set(key, value) {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run(key, value);
    return value;
  }

  static getAll() {
    const stmt = db.prepare('SELECT * FROM settings');
    const rows = stmt.all();
    const result = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  static getPrices() {
    return {
      vpn: parseFloat(this.get('vpn_price')) || 299
    };
  }

  static getTopupLimits() {
    return {
      min: parseFloat(this.get('min_topup')) || 50,
      max: parseFloat(this.get('max_topup')) || 500
    };
  }

  static getReferralSettings() {
    const toBool = (v, d = false) => {
      if (v === null || v === undefined || v === '') return d;
      return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
    };
    const toNum = (v, d = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : d;
    };

    return {
      enabled: toBool(this.get('referral_enabled'), true),
      minTopup: toNum(this.get('referral_min_topup'), 100),
      inviter: {
        rewardType: this.get('referral_inviter_reward_type') || 'fixed',
        rewardValue: toNum(this.get('referral_inviter_reward_value'), 50),
        maxReward: toNum(this.get('referral_inviter_max_reward'), 0)
      },
      invitee: {
        rewardType: this.get('referral_invitee_reward_type') || 'fixed',
        rewardValue: toNum(this.get('referral_invitee_reward_value'), 30),
        maxReward: toNum(this.get('referral_invitee_max_reward'), 0)
      }
    };
  }

}

module.exports = Setting;
