const { db } = require('../config/database');

class Payment {
  static create(userId, amount, paymentId = null, status = 'pending', providerData = null) {
    const stmt = db.prepare(`
      INSERT INTO payments (user_id, amount, status, payment_id, provider_data, payment_kind)
      VALUES (?, ?, ?, ?, ?, 'topup')
    `);
    const result = stmt.run(
      userId,
      amount,
      status,
      paymentId,
      providerData ? JSON.stringify(providerData) : null
    );
    return this.getById(result.lastInsertRowid);
  }

  static completeByAdmin(userId, amount, adminActorId = null) {
    const stmt = db.prepare(`
      INSERT INTO payments (user_id, amount, payment_id, status, is_admin, payment_kind, admin_actor_id)
      VALUES (?, ?, ?, 'completed', 1, 'admin_adjustment', ?)
    `);
    const result = stmt.run(userId, amount, `admin_${Date.now()}`, adminActorId);
    return this.getById(result.lastInsertRowid);
  }

  static logEvent(userId, amount, paymentKind, options = {}) {
    const stmt = db.prepare(`
      INSERT INTO payments (user_id, amount, payment_id, status, is_admin, payment_kind, provider_data, admin_actor_id)
      VALUES (?, ?, ?, 'completed', ?, ?, ?, ?)
    `);
    const result = stmt.run(
      userId,
      amount,
      options.paymentId || `${paymentKind}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      options.isAdmin ? 1 : 0,
      paymentKind,
      options.providerData ? JSON.stringify(options.providerData) : null,
      options.adminActorId || null
    );
    return this.getById(result.lastInsertRowid);
  }

  static getById(id) {
    const stmt = db.prepare('SELECT * FROM payments WHERE id = ?');
    return stmt.get(id);
  }

  static getByPaymentId(paymentId) {
    const stmt = db.prepare('SELECT * FROM payments WHERE payment_id = ?');
    return stmt.get(paymentId);
  }

  static update(id, data) {
    const fields = [];
    const values = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.payment_id !== undefined) {
      fields.push('payment_id = ?');
      values.push(data.payment_id);
    }
    if (data.provider_data !== undefined) {
      fields.push('provider_data = ?');
      values.push(JSON.stringify(data.provider_data));
    }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    const stmt = db.prepare(`UPDATE payments SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.getById(id);
  }

  static complete(id) {
    const stmt = db.prepare(`UPDATE payments SET status = 'completed' WHERE id = ? AND status = 'pending'`);
    const result = stmt.run(id);
    if (result.changes === 0) {
      return this.getById(id);
    }
    return this.getById(id);
  }

  static fail(id) {
    const stmt = db.prepare(`UPDATE payments SET status = 'failed' WHERE id = ? AND status IN ('pending')`);
    const result = stmt.run(id);
    if (result.changes === 0) {
      return this.getById(id);
    }
    return this.getById(id);
  }

  static getByUser(userId, limit = 50) {
    const stmt = db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT ?');
    return stmt.all(userId, limit);
  }

  static getAll(limit = 100, offset = 0) {
    const stmt = db.prepare(`
      SELECT p.*, u.email, a.nickname as actor_admin_nickname, a.email as actor_admin_email
      FROM payments p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN admins a ON a.id = p.admin_actor_id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  }

  static getTotalByPeriod(days = 30) {
    const stmt = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE status = 'completed'
      AND is_admin = 0
      AND COALESCE(payment_kind, 'topup') = 'topup'
      AND created_at >= datetime('now', '-' || ? || ' days')
    `);
    return stmt.get(days).total;
  }

  static getCount() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM payments');
    return stmt.get().count;
  }
}

module.exports = Payment;
