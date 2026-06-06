const crypto = require('crypto');
const { db } = require('../config/database');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, packedHash) {
  const raw = String(packedHash || '');
  const [salt, hash] = raw.split(':');
  if (!salt || !hash) return false;
  const provided = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

class UserPassword {
  static set(userId, plainPassword) {
    const passwordHash = hashPassword(plainPassword);
    const existing = db.prepare('SELECT id FROM user_passwords WHERE user_id = ?').get(userId);
    if (existing) {
      db.prepare('UPDATE user_passwords SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(passwordHash, userId);
    } else {
      db.prepare('INSERT INTO user_passwords (user_id, password_hash) VALUES (?, ?)').run(userId, passwordHash);
    }
    return true;
  }

  static verify(userId, plainPassword) {
    const row = db.prepare('SELECT password_hash FROM user_passwords WHERE user_id = ?').get(userId);
    if (!row) return false;
    return verifyPassword(plainPassword, row.password_hash);
  }

  static exists(userId) {
    const row = db.prepare('SELECT 1 FROM user_passwords WHERE user_id = ?').get(userId);
    return !!row;
  }

  static hasPassword(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const row = db.prepare(`
      SELECT 1 FROM user_passwords up
      INNER JOIN users u ON u.id = up.user_id
      WHERE u.email = ?
    `).get(normalizedEmail);
    return !!row;
  }

  static delete(userId) {
    db.prepare('DELETE FROM user_passwords WHERE user_id = ?').run(userId);
  }

  static setHash(userId, passwordHash) {
    const existing = db.prepare('SELECT id FROM user_passwords WHERE user_id = ?').get(userId);
    if (existing) {
      db.prepare('UPDATE user_passwords SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(passwordHash, userId);
    } else {
      db.prepare('INSERT INTO user_passwords (user_id, password_hash) VALUES (?, ?)').run(userId, passwordHash);
    }
    return true;
  }
}

module.exports = { UserPassword, hashPassword, verifyPassword };