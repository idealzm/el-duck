const { db } = require('../config/database');
const crypto = require('crypto');

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

class AuthCode {
  static create(email, code, expiresInMinutes = 10) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const codeHash = hashCode(code);
    const tx = db.transaction(() => {
      db.prepare('UPDATE auth_codes SET used = 1 WHERE email = ? AND used = 0').run(normalizedEmail);
      const stmt = db.prepare(`
        INSERT INTO auth_codes (email, code, expires_at)
        VALUES (?, ?, datetime('now', '+' || ? || ' minutes'))
      `);
      const result = stmt.run(normalizedEmail, codeHash, expiresInMinutes);
      return result.lastInsertRowid;
    });
    return tx();
  }

  static getByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const stmt = db.prepare(`
      SELECT * FROM auth_codes 
      WHERE email = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY id DESC
    `);
    return stmt.get(normalizedEmail);
  }

  static markAsUsed(id) {
    const stmt = db.prepare('UPDATE auth_codes SET used = 1 WHERE id = ?');
    stmt.run(id);
  }

  static invalidateAllForEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    db.prepare('UPDATE auth_codes SET used = 1 WHERE email = ? AND used = 0').run(normalizedEmail);
  }

  static cleanup() {
    const stmt = db.prepare(`
      DELETE FROM auth_codes 
      WHERE expires_at < CURRENT_TIMESTAMP OR used = 1
    `);
    stmt.run();
  }

  static verify(email, code) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const record = this.getByEmail(normalizedEmail);
    if (!record) {
      return false;
    }

    const incomingHash = hashCode(code);
    const isHashed = typeof record.code === 'string' && /^[a-f0-9]{64}$/i.test(record.code);
    const isValid = isHashed
      ? safeEqual(record.code.toLowerCase(), incomingHash)
      : safeEqual(String(record.code), String(code));

    if (!isValid) {
      return false;
    }

    this.markAsUsed(record.id);
    return true;
  }
}

module.exports = AuthCode;
