const { db } = require('../config/database');

class SupportMessage {
  static create({ ticketId, senderType, body, senderAdminId = null }) {
    const safeBody = String(body || '').trim().slice(0, 5000);
    const result = db.prepare(`
      INSERT INTO support_messages (ticket_id, sender_type, sender_admin_id, body)
      VALUES (?, ?, ?, ?)
    `).run(ticketId, senderType, senderAdminId, safeBody);
    return this.getById(result.lastInsertRowid);
  }

  static getById(id) {
    return db.prepare(`
      SELECT m.*, a.nickname as sender_admin_nickname, a.email as sender_admin_email
      FROM support_messages m
      LEFT JOIN admins a ON a.id = m.sender_admin_id
      WHERE m.id = ?
    `).get(id);
  }

  static getByTicket(ticketId, { afterId = 0, limit = 200 } = {}) {
    return db.prepare(`
      SELECT m.*, a.nickname as sender_admin_nickname, a.email as sender_admin_email
      FROM support_messages m
      LEFT JOIN admins a ON a.id = m.sender_admin_id
      WHERE m.ticket_id = ? AND m.id > ?
      ORDER BY m.id ASC
      LIMIT ?
    `).all(ticketId, Number(afterId || 0), Number(limit || 200));
  }
}

module.exports = SupportMessage;
