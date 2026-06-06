const { db } = require('../config/database');
const crypto = require('crypto');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) {
    const maxLen = Math.max(aBuf.length, bBuf.length, 32);
    crypto.timingSafeEqual(Buffer.alloc(maxLen), Buffer.alloc(maxLen));
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

class MagicLink {
  static create(email, type, { expiresInMinutes = 10, payload = null } = {}) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const rawToken = crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const payloadJson = payload ? JSON.stringify(payload) : null;

    const tx = db.transaction(() => {
      db.prepare(
        'UPDATE magic_links SET used = 1 WHERE email = ? AND type = ? AND used = 0'
      ).run(normalizedEmail, type);

      const stmt = db.prepare(`
        INSERT INTO magic_links (email, token, type, payload, expires_at)
        VALUES (?, ?, ?, ?, datetime('now', '+' || ? || ' minutes'))
      `);
      stmt.run(normalizedEmail, tokenHash, type, payloadJson, expiresInMinutes);
      return rawToken;
    });
    return tx();
  }

  static verify(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') return null;

    const tokenHash = hashToken(rawToken);

    const result = db.transaction(() => {
      const selectStmt = db.prepare(`
        SELECT id, email, type, payload
        FROM magic_links
        WHERE token = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP
        ORDER BY id DESC
        LIMIT 1
      `);

      const row = selectStmt.get(tokenHash);
      if (!row) return null;

      db.prepare(`
        UPDATE magic_links
        SET used = 1, payload = NULL
        WHERE id = ?
      `).run(row.id);

      let payload = null;
      if (row.payload) {
        try { payload = JSON.parse(row.payload); } catch (_) { payload = null; }
      }

      return {
        id: row.id,
        email: row.email,
        type: row.type,
        payload
      };
    })();

    return result;
  }

  static invalidateAllForEmail(email, type = null) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (type) {
      db.prepare(
        'UPDATE magic_links SET used = 1 WHERE email = ? AND type = ? AND used = 0'
      ).run(normalizedEmail, type);
    } else {
      db.prepare(
        'UPDATE magic_links SET used = 1 WHERE email = ? AND used = 0'
      ).run(normalizedEmail);
    }
  }

  static cleanup() {
    db.prepare(`
      DELETE FROM magic_links
      WHERE expires_at < CURRENT_TIMESTAMP OR used = 1
    `).run();
  }

  static lookupValidToken(tokenHash) {
    return db.prepare(`
      SELECT id, email, type, payload
      FROM magic_links
      WHERE token = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY id DESC
      LIMIT 1
    `).get(tokenHash);
  }
}

module.exports = MagicLink;