const { db } = require('../config/database');

class Subscription {
  static create(userId, type, expiresAt, configData = null) {
    const stmt = db.prepare(`
      INSERT INTO subscriptions (user_id, type, status, config_data, expires_at)
      VALUES (?, ?, 'active', ?, ?)
    `);
    const result = stmt.run(userId, type, configData ? JSON.stringify(configData) : null, expiresAt);
    return this.getById(result.lastInsertRowid);
  }

  static getById(id) {
    const stmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
    return stmt.get(id);
  }

  static getActiveByUser(userId, type = null) {
    let query = `
      SELECT * FROM subscriptions
      WHERE user_id = ? AND status = 'active' AND expires_at > CURRENT_TIMESTAMP
    `;
    const params = [userId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Получить только active подписки (для cancel — чтобы нельзя было отменить уже отменённую)
   */
  static getActiveOnlyByUser(userId, type = null) {
    let query = `
      SELECT * FROM subscriptions
      WHERE user_id = ? AND status = 'active'
    `;
    const params = [userId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Получить активные или cancelled (но ещё действующие) подписки
   */
  static getValidByUser(userId, type = null) {
    let query = `
      SELECT * FROM subscriptions
      WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP
      AND (status = 'active' OR status = 'cancelled')
    `;
    const params = [userId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Получить cancelled подписку пользователя (для resume)
   */
  static getCancelledByUser(userId, type = null) {
    let query = `
      SELECT * FROM subscriptions
      WHERE user_id = ? AND status = 'cancelled' AND expires_at > CURRENT_TIMESTAMP
    `;
    const params = [userId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static getByUser(userId) {
    const stmt = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC');
    return stmt.all(userId);
  }

  static update(id, data) {
    const fields = [];
    const values = [];
    
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.config_data !== undefined) {
      fields.push('config_data = ?');
      values.push(JSON.stringify(data.config_data));
    }
    if (data.expires_at !== undefined) {
      fields.push('expires_at = ?');
      values.push(data.expires_at);
    }
    if (data.daily_rate !== undefined) {
      fields.push('daily_rate = ?');
      values.push(data.daily_rate);
    }
    if (data.next_charge_at !== undefined) {
      fields.push('next_charge_at = ?');
      values.push(data.next_charge_at);
    }
    if (data.first_charge_at !== undefined) {
      fields.push('first_charge_at = ?');
      values.push(data.first_charge_at);
    }
    if (data.last_charge_at !== undefined) {
      fields.push('last_charge_at = ?');
      values.push(data.last_charge_at);
    }
    
    if (fields.length === 0) return this.getById(id);
    
    values.push(id);
    const stmt = db.prepare(`UPDATE subscriptions SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.getById(id);
  }

  /**
   * Реактивация (resume) отменённой подписки
   */
  static resume(id) {
    const sub = this.getById(id);
    if (!sub) return null;

    const now = new Date();
    const currentExpires = sub.expires_at ? new Date(sub.expires_at) : null;
    const currentNextCharge = sub.next_charge_at ? new Date(sub.next_charge_at) : null;

    const baseExpires = (currentExpires && currentExpires > now) ? currentExpires : new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const baseNextCharge = (currentNextCharge && currentNextCharge > now) ? currentNextCharge : new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const stmt = db.prepare(`
      UPDATE subscriptions
      SET status = 'active',
          expires_at = ?,
          next_charge_at = ?,
          last_charge_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(baseExpires.toISOString(), baseNextCharge.toISOString(), id);

    return this.getById(id);
  }

  static cancelByUser(userId, type) {
    const stmt = db.prepare(`
      UPDATE subscriptions 
      SET status = 'cancelled' 
      WHERE user_id = ? AND type = ? AND status = 'active'
    `);
    stmt.run(userId, type);
  }

  /**
   * Expire subscriptions whose expires_at has passed
   */
  static expireExpired() {
    const nowISO = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE subscriptions
      SET status = 'expired'
      WHERE expires_at <= ?
        AND status = 'active'
        AND (daily_rate IS NULL OR daily_rate = 0)
    `);
    return stmt.run(nowISO);
  }

  static getCount() {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM subscriptions 
      WHERE status = 'active' AND expires_at > CURRENT_TIMESTAMP
    `);
    return stmt.get().count;
  }

  static getVpnCount() {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM subscriptions
      WHERE type = 'vpn' AND status = 'active' AND expires_at > CURRENT_TIMESTAMP
    `);
    return stmt.get().count;
  }

  /**
   * Получить дневную ставку подписки по типу
   */
  static getDailyRate(type) {
    const Setting = require('./Setting');
    const prices = Setting.getPrices();
    return type === 'vpn' ? prices.vpn : null;
  }

  /**
   * Рассчитать количество дней, на которое хватит баланса
   */
  static calculateDaysRemaining(userId) {
    const User = require('./User');
    const user = User.getById(userId);
    if (!user) return 0;

    const activeSubs = this.getActiveByUser(userId);
    const dailySubs = activeSubs.filter(s => s.daily_rate && s.status === 'active');

    if (dailySubs.length === 0) return 0;

    const totalDailyRate = dailySubs.reduce((sum, s) => sum + Number(s.daily_rate || 0), 0);
    if (totalDailyRate <= 0) return 0;
    return Math.floor(user.balance / totalDailyRate);
  }

  /**
   * Получить общую дневную ставку пользователя
   */
  static getTotalDailyRate(userId) {
    const activeSubs = this.getActiveByUser(userId);
    const dailySubs = activeSubs.filter(s => s.daily_rate && s.status === 'active');
    return dailySubs.reduce((sum, s) => sum + Number(s.daily_rate || 0), 0);
  }

  /**
   * Продлить подписку на N дней
   */
  static extendByDays(id, days) {
    const sub = this.getById(id);
    if (!sub) return null;

    const now = new Date();
    const currentExpires = new Date(sub.expires_at);
    const base = currentExpires > now ? currentExpires : now;
    const newExpiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    const stmt = db.prepare(`
      UPDATE subscriptions
      SET expires_at = ?, last_charge_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(newExpiresAt.toISOString(), id);

    return this.getById(id);
  }

  /**
   * Обновить next_charge_at
   */
  static updateNextChargeAt(id, nextChargeAt) {
    const stmt = db.prepare(`
      UPDATE subscriptions
      SET next_charge_at = ?
      WHERE id = ?
    `);
    stmt.run(nextChargeAt.toISOString(), id);
    return this.getById(id);
  }

  /**
   * Получить подписки для ежедневного списания
   */
  static getForDailyCharge() {
    const nowIso = new Date().toISOString();
    const stmt = db.prepare(`
      SELECT * FROM subscriptions
      WHERE status = 'active'
        AND daily_rate IS NOT NULL
        AND next_charge_at IS NOT NULL
        AND next_charge_at <= ?
    `);
    return stmt.all(nowIso);
  }

  /**
   * Создать подписку с ежедневным биллингом
   */
  static createDaily(userId, type, dailyRate) {
    const now = new Date();
    const firstChargeAt = now.toISOString();
    const nextChargeAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const stmt = db.prepare(`
      INSERT INTO subscriptions (user_id, type, status, config_data, expires_at, daily_rate, first_charge_at, next_charge_at, last_charge_at)
      VALUES (?, ?, 'active', NULL, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(userId, type, expiresAt.toISOString(), dailyRate, firstChargeAt, nextChargeAt.toISOString());
    return this.getById(result.lastInsertRowid);
  }
}

module.exports = Subscription;
