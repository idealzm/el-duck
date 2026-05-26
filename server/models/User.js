const { db } = require('../config/database');
const crypto = require('crypto');

class User {
  static create(email) {
    const stmt = db.prepare('INSERT INTO users (email, user_uuid) VALUES (?, ?)');
    const result = stmt.run(email, crypto.randomUUID());
    return this.getById(result.lastInsertRowid);
  }

  static getById(id) {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }

  static getByEmail(email) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  }

  static getByUuid(uuid) {
    const normalized = String(uuid || '').trim();
    if (!normalized) return null;
    return db.prepare('SELECT * FROM users WHERE user_uuid = ?').get(normalized);
  }

  static getByPublicId(identifier) {
    const raw = String(identifier || '').trim();
    if (!raw) return null;
    const byUuid = this.getByUuid(raw);
    if (byUuid) return byUuid;
    if (/^\d+$/.test(raw)) {
      return this.getById(Number(raw));
    }
    return null;
  }

  static ensureUuid(userId) {
    const user = this.getById(userId);
    if (!user) return null;
    if (user.user_uuid) return user.user_uuid;
    const nextUuid = crypto.randomUUID();
    db.prepare('UPDATE users SET user_uuid = ? WHERE id = ?').run(nextUuid, userId);
    return nextUuid;
  }

  static updateBalance(id, amount) {
    const stmt = db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?');
    stmt.run(amount, id);
    return this.getById(id);
  }

  static setBalance(id, amount) {
    const stmt = db.prepare('UPDATE users SET balance = ? WHERE id = ?');
    stmt.run(amount, id);
    return this.getById(id);
  }

  static deductBalance(id, amount) {
    const stmt = db.prepare('UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?');
    const result = stmt.run(amount, id, amount);
    return result.changes > 0;
  }

  static getAll(limit = 100, offset = 0) {
    const stmt = db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?');
    return stmt.all(limit, offset);
  }

  static searchByEmail(query, limit = 50) {
    const escaped = String(query || '').replace(/[%_]/g, '\\$&');
    const stmt = db.prepare('SELECT * FROM users WHERE email LIKE ? ESCAPE ? ORDER BY created_at DESC LIMIT ?');
    return stmt.all(`%${escaped}%`, '\\', limit);
  }

  static getCount() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
    return stmt.get().count;
  }

  static getTotalBalance() {
    const stmt = db.prepare('SELECT COALESCE(SUM(balance), 0) as total FROM users');
    return stmt.get().total;
  }

  static getRecent(limit = 10) {
    const stmt = db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ?');
    return stmt.all(limit);
  }

  static delete(id) {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    return stmt.run(id);
  }

  static getGroups(userId) {
    const stmt = db.prepare(`
      SELECT g.id, g.name, g.color FROM user_groups g
      INNER JOIN user_group_members m ON g.id = m.group_id
      WHERE m.user_id = ?
    `);
    return stmt.all(userId);
  }

  static addToGroup(userId, groupId) {
    const stmt = db.prepare('INSERT OR IGNORE INTO user_group_members (user_id, group_id) VALUES (?, ?)');
    stmt.run(userId, groupId);
  }

  static removeFromGroup(userId, groupId) {
    const stmt = db.prepare('DELETE FROM user_group_members WHERE user_id = ? AND group_id = ?');
    stmt.run(userId, groupId);
  }

  static setAdmin(id, isAdmin) {
    const stmt = db.prepare('UPDATE users SET is_admin = ? WHERE id = ?');
    stmt.run(isAdmin ? 1 : 0, id);
    return this.getById(id);
  }

  static incrementTokenVersion(id) {
    const stmt = db.prepare('UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?');
    stmt.run(id);
    return this.getById(id);
  }

  static setConsent(id, { acceptedAt, ip, userAgent, version = 'v1' }) {
    const stmt = db.prepare(`
      UPDATE users
      SET consent_accepted_at = ?, consent_ip = ?, consent_user_agent = ?, consent_version = ?
      WHERE id = ?
    `);
    stmt.run(acceptedAt, ip, userAgent, version, id);
    return this.getById(id);
  }

  static generateReferralCode(length = 8) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i++) {
      out += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    return out;
  }

  static ensureReferralCode(userId) {
    const user = this.getById(userId);
    if (!user) return null;
    if (user.referral_code) return user.referral_code;

    for (let i = 0; i < 10; i++) {
      const code = this.generateReferralCode(8);
      try {
        db.prepare('UPDATE users SET referral_code = ? WHERE id = ?').run(code, userId);
        return code;
      } catch (_) {
        // retry on collision
      }
    }
    return null;
  }

  static getByReferralCode(code) {
    const normalized = String(code || '').trim().toUpperCase();
    return db.prepare('SELECT * FROM users WHERE referral_code = ?').get(normalized);
  }

  static bindReferral(userId, inviterUserId) {
    const stmt = db.prepare(`
      UPDATE users
      SET referred_by_user_id = ?, referred_at = datetime('now')
      WHERE id = ? AND referred_by_user_id IS NULL
    `);
    const result = stmt.run(inviterUserId, userId);
    return result.changes > 0;
  }

  static markReferralRewardGranted(userId) {
    db.prepare("UPDATE users SET referral_reward_granted_at = datetime('now') WHERE id = ?").run(userId);
    return this.getById(userId);
  }

  static setUnlimitedBalance(id, value) {
    const stmt = db.prepare('UPDATE users SET unlimited_balance = ? WHERE id = ?');
    stmt.run(value ? 1 : 0, id);
    return this.getById(id);
  }

  static isAdmin(id) {
    const stmt = db.prepare('SELECT is_admin FROM users WHERE id = ?');
    const user = stmt.get(id);
    return user ? !!user.is_admin : false;
  }
}

module.exports = User;
