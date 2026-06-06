const crypto = require('crypto');
const { db } = require('../config/database');

function hashDeviceToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

class TrustedDevice {
  static create(userId, { userAgent, ip, expiresDays = 365 } = {}) {
    const deviceToken = crypto.randomUUID();
    const tokenHash = hashDeviceToken(deviceToken);
    const stmt = db.prepare(`
      INSERT INTO trusted_devices (user_id, device_token, user_agent, ip, expires_at)
      VALUES (?, ?, ?, ?, datetime('now', '+' || ? || ' days'))
    `);
    stmt.run(userId, tokenHash, userAgent || null, ip || null, expiresDays);
    return deviceToken;
  }

  static verify(deviceToken) {
    if (!deviceToken) return null;
    const tokenHash = hashDeviceToken(deviceToken);
    const row = db.prepare(`
      SELECT td.*, u.id as user_id, u.email, u.user_uuid, u.balance, u.token_version, u.consent_accepted_at, u.unlimited_balance
      FROM trusted_devices td
      INNER JOIN users u ON u.id = td.user_id
      WHERE td.device_token = ? AND td.expires_at > CURRENT_TIMESTAMP
    `).get(tokenHash);
    if (!row) return null;
    db.prepare('UPDATE trusted_devices SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
    return {
      id: row.id,
      userId: row.user_id,
      email: row.email,
      userUuid: row.user_uuid,
      balance: row.balance,
      tokenVersion: row.token_version,
      consentAccepted: !!row.consent_accepted_at,
      unlimitedBalance: !!row.unlimited_balance
    };
  }

  static deleteByToken(deviceToken) {
    const tokenHash = hashDeviceToken(deviceToken);
    db.prepare('DELETE FROM trusted_devices WHERE device_token = ?').run(tokenHash);
  }

  static deleteByUser(userId) {
    db.prepare('DELETE FROM trusted_devices WHERE user_id = ?').run(userId);
  }

  static listByUser(userId) {
    return db.prepare('SELECT id, device_token, user_agent, ip, created_at, last_used_at, expires_at FROM trusted_devices WHERE user_id = ? ORDER BY last_used_at DESC').all(userId);
  }

  static cleanup() {
    db.prepare("DELETE FROM trusted_devices WHERE expires_at < CURRENT_TIMESTAMP").run();
  }

  static limitDevices(userId, maxDevices = 10) {
    const devices = db.prepare('SELECT id FROM trusted_devices WHERE user_id = ? ORDER BY last_used_at DESC').all(userId);
    if (devices.length > maxDevices) {
      const toDelete = devices.slice(maxDevices);
      const stmt = db.prepare('DELETE FROM trusted_devices WHERE id = ?');
      for (const d of toDelete) {
        stmt.run(d.id);
      }
    }
  }
}

module.exports = TrustedDevice;