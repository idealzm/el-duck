const crypto = require('crypto');
const { db } = require('../config/database');
const config = require('../config/env');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function getCipherKey() {
  return crypto.createHash('sha256').update(String(config.support?.tokenEncryptionKey || config.jwtSecret || 'support-local-secret')).digest();
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptToken(packed) {
  try {
    const [ivRaw, tagRaw, encryptedRaw] = String(packed || '').split('.');
    if (!ivRaw || !tagRaw || !encryptedRaw) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getCipherKey(), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch (_) {
    return null;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

class SupportTicket {
  static create({ userId = null, email, subject, firstMessage, creatorIp = null }) {
    const ticketUuid = crypto.randomUUID();
    const accessToken = crypto.randomBytes(32).toString('base64url');
    const accessTokenHash = sha256(accessToken);
    const safeSubject = String(subject || '').trim().slice(0, 160) || 'Запрос в поддержку';
    const safeBody = String(firstMessage || '').trim().slice(0, 5000);

    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO support_tickets (ticket_uuid, access_token_hash, access_token_encrypted, user_id, email, subject, status, creator_ip, user_last_seen_at, last_message_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(ticketUuid, accessTokenHash, encryptToken(accessToken), userId, normalizeEmail(email), safeSubject, creatorIp || null);

      db.prepare(`
        INSERT INTO support_messages (ticket_id, sender_type, body)
        VALUES (?, 'user', ?)
      `).run(result.lastInsertRowid, safeBody);

      return this.getById(result.lastInsertRowid);
    });

    return { ticket: tx(), accessToken };
  }

  static findRecentDuplicate({ userId = null, email, subject, firstMessage, minutes = 5 }) {
    const safeSubject = String(subject || '').trim().slice(0, 160) || 'Запрос в поддержку';
    const safeBody = String(firstMessage || '').trim().slice(0, 5000);
    const normalizedEmail = normalizeEmail(email);
    const safeMinutes = Math.min(Math.max(Number(minutes) || 5, 1), 60);

    if (userId) {
      return db.prepare(`
        SELECT t.*
        FROM support_tickets t
        JOIN support_messages m ON m.ticket_id = t.id
        WHERE t.user_id = ?
          AND t.email = ?
          AND t.subject = ?
          AND t.status != 'closed'
          AND t.created_at >= datetime('now', ?)
          AND m.sender_type = 'user'
          AND m.body = ?
        ORDER BY t.id DESC
        LIMIT 1
      `).get(userId, normalizedEmail, safeSubject, `-${safeMinutes} minutes`, safeBody);
    }

    return db.prepare(`
      SELECT t.*
      FROM support_tickets t
      JOIN support_messages m ON m.ticket_id = t.id
      WHERE t.user_id IS NULL
        AND t.email = ?
        AND t.subject = ?
        AND t.status != 'closed'
        AND t.created_at >= datetime('now', ?)
        AND m.sender_type = 'user'
        AND m.body = ?
      ORDER BY t.id DESC
      LIMIT 1
    `).get(normalizedEmail, safeSubject, `-${safeMinutes} minutes`, safeBody);
  }

  static findActiveByUserId(userId) {
    if (!userId) return null;
    return db.prepare(`
      SELECT * FROM support_tickets
      WHERE user_id = ? AND status != 'closed'
      ORDER BY last_message_at DESC, id DESC
      LIMIT 1
    `).get(userId);
  }

  static findActiveByIp(ip) {
    if (!ip) return null;
    return db.prepare(`
      SELECT * FROM support_tickets
      WHERE creator_ip = ? AND user_id IS NULL AND status != 'closed'
      ORDER BY last_message_at DESC, id DESC
      LIMIT 1
    `).get(ip);
  }

  static getById(id) {
    return db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id);
  }

  static getByUuid(uuid) {
    return db.prepare('SELECT * FROM support_tickets WHERE ticket_uuid = ?').get(String(uuid || '').trim());
  }

  static verifyAccessToken(ticket, token) {
    if (!ticket || !token) return false;
    const provided = Buffer.from(sha256(token), 'hex');
    const expected = Buffer.from(String(ticket.access_token_hash || ''), 'hex');
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(provided, expected);
  }

  static getAccessToken(ticket) {
    return decryptToken(ticket?.access_token_encrypted);
  }

  static listAll({ status = null, limit = 100, offset = 0 } = {}) {
    if (status && ['open', 'pending', 'closed'].includes(status)) {
      return db.prepare(`
        SELECT t.*, u.user_uuid
        FROM support_tickets t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.status = ?
        ORDER BY datetime(t.last_message_at) DESC, t.id DESC
        LIMIT ? OFFSET ?
      `).all(status, limit, offset);
    }
    return db.prepare(`
      SELECT t.*, u.user_uuid
      FROM support_tickets t
      LEFT JOIN users u ON u.id = t.user_id
      ORDER BY datetime(t.last_message_at) DESC, t.id DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  }

  static setStatus(id, status) {
    const current = this.getById(id);
    if (!current || current.status === 'closed') return current;
    db.prepare('UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
    return this.getById(id);
  }

  static markSeen(id, viewer) {
    const column = viewer === 'admin' ? 'admin_last_seen_at' : 'user_last_seen_at';
    db.prepare(`UPDATE support_tickets SET ${column} = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    return this.getById(id);
  }

  static touchAfterMessage(id, senderType) {
    if (senderType === 'admin') {
      db.prepare(`
        UPDATE support_tickets
        SET status = 'pending',
            last_message_at = CURRENT_TIMESTAMP,
            last_admin_message_at = CURRENT_TIMESTAMP,
            unread_email_notified_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status != 'closed'
      `).run(id);
      return this.getById(id);
    }

    db.prepare(`
      UPDATE support_tickets
      SET status = status,
          last_message_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status != 'closed'
    `).run(id);
    return this.getById(id);
  }

  static markUnreadEmailNotified(id) {
    db.prepare('UPDATE support_tickets SET unread_email_notified_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    return this.getById(id);
  }

  static isAdminReplyUnread(ticket) {
    if (!ticket || !ticket.last_admin_message_at) return false;
    if (ticket.unread_email_notified_at && new Date(ticket.unread_email_notified_at) >= new Date(ticket.last_admin_message_at)) return false;
    if (!ticket.user_last_seen_at) return true;
    return new Date(ticket.user_last_seen_at) < new Date(ticket.last_admin_message_at);
  }
}

module.exports = SupportTicket;
