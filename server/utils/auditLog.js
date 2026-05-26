const { db } = require('../config/database');

function auditLog({ actorType, actorId, action, targetType, targetId, details, ip }) {
  try {
    db.prepare(`
      INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      actorType,
      actorId || null,
      action,
      targetType || null,
      targetId || null,
      details ? JSON.stringify(details) : null,
      ip || null
    );
  } catch (err) {
    console.error('[AuditLog] Failed to write:', err.message);
  }
}

module.exports = { auditLog };