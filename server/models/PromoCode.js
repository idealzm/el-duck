const { db } = require('../config/database');

class PromoCode {
  static normalizeCode(code) {
    return String(code || '').trim().toUpperCase();
  }

  static create(data) {
    const stmt = db.prepare(`
      INSERT INTO promo_codes (
        code, description, is_active, starts_at, ends_at, min_topup,
        reward_type, reward_value, instant_grant, max_reward, total_limit, per_user_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      this.normalizeCode(data.code),
      data.description || null,
      data.isActive ? 1 : 0,
      data.startsAt || null,
      data.endsAt || null,
      Number(data.minTopup || 0),
      data.rewardType,
      Number(data.rewardValue || 0),
      data.instantGrant ? 1 : 0,
      data.maxReward !== undefined && data.maxReward !== null ? Number(data.maxReward) : null,
      data.totalLimit !== undefined && data.totalLimit !== null ? Number(data.totalLimit) : null,
      data.perUserLimit !== undefined && data.perUserLimit !== null ? Number(data.perUserLimit) : 1
    );
    return this.getById(result.lastInsertRowid);
  }

  static update(id, data) {
    const fields = [];
    const values = [];

    if (data.code !== undefined) {
      fields.push('code = ?');
      values.push(this.normalizeCode(data.code));
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description || null);
    }
    if (data.isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(data.isActive ? 1 : 0);
    }
    if (data.startsAt !== undefined) {
      fields.push('starts_at = ?');
      values.push(data.startsAt || null);
    }
    if (data.endsAt !== undefined) {
      fields.push('ends_at = ?');
      values.push(data.endsAt || null);
    }
    if (data.minTopup !== undefined) {
      fields.push('min_topup = ?');
      values.push(Number(data.minTopup || 0));
    }
    if (data.rewardType !== undefined) {
      fields.push('reward_type = ?');
      values.push(data.rewardType);
    }
    if (data.rewardValue !== undefined) {
      fields.push('reward_value = ?');
      values.push(Number(data.rewardValue || 0));
    }
    if (data.instantGrant !== undefined) {
      fields.push('instant_grant = ?');
      values.push(data.instantGrant ? 1 : 0);
    }
    if (data.maxReward !== undefined) {
      fields.push('max_reward = ?');
      values.push(data.maxReward !== null ? Number(data.maxReward) : null);
    }
    if (data.totalLimit !== undefined) {
      fields.push('total_limit = ?');
      values.push(data.totalLimit !== null ? Number(data.totalLimit) : null);
    }
    if (data.perUserLimit !== undefined) {
      fields.push('per_user_limit = ?');
      values.push(data.perUserLimit !== null ? Number(data.perUserLimit) : 1);
    }

    if (fields.length === 0) return this.getById(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE promo_codes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  static getById(id) {
    return db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(id);
  }

  static getByCode(code) {
    return db.prepare('SELECT * FROM promo_codes WHERE code = ?').get(this.normalizeCode(code));
  }

  static getAll(limit = 100, offset = 0) {
    return db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  }

  static delete(id) {
    return db.prepare('DELETE FROM promo_codes WHERE id = ?').run(id);
  }

  static incrementUsedCount(id) {
    db.prepare('UPDATE promo_codes SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }

  static getUserRedemptionsCount(promoCodeId, userId) {
    return db.prepare('SELECT COUNT(*) as count FROM promo_redemptions WHERE promo_code_id = ? AND user_id = ?').get(promoCodeId, userId).count;
  }

  static getRedemptionsByPromo(promoCodeId, limit = 200, offset = 0) {
    return db.prepare(`
      SELECT r.*, u.email
      FROM promo_redemptions r
      JOIN users u ON u.id = r.user_id
      WHERE r.promo_code_id = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(promoCodeId, limit, offset);
  }

  static createRedemption({ promoCodeId, userId, paymentId = null, amount, bonusAmount }) {
    return db.prepare(`
      INSERT INTO promo_redemptions (promo_code_id, user_id, payment_id, amount, bonus_amount)
      VALUES (?, ?, ?, ?, ?)
    `).run(promoCodeId, userId, paymentId, amount, bonusAmount);
  }
}

module.exports = PromoCode;
