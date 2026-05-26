const { db } = require('../config/database');
const User = require('../models/User');
const AppError = require('../utils/AppError');

function normalizeTargetType(value) {
  return String(value || '').trim().toLowerCase() === 'selected' ? 'selected' : 'all';
}

function resolveRecipientUsers(userIds) {
  const raw = Array.isArray(userIds) ? userIds : [];
  const uniqueIds = Array.from(new Set(raw.map((id) => String(id || '').trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    throw new AppError('Нужно выбрать хотя бы одного пользователя', 400);
  }

  const users = uniqueIds.map((publicId) => User.getByPublicId(publicId)).filter(Boolean);
  if (users.length === 0) {
    throw new AppError('Выбранные пользователи не найдены', 404);
  }

  return users;
}

function createPopupMessage({ title, body, targetType, userIds, adminId }) {
  const normalizedBody = String(body || '').trim();
  if (!normalizedBody) {
    throw new AppError('Текст сообщения обязателен', 400);
  }

  const normalizedTitle = String(title || '').trim() || null;
  const normalizedTargetType = normalizeTargetType(targetType);
  const recipientUsers = normalizedTargetType === 'selected' ? resolveRecipientUsers(userIds) : [];

  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO admin_popup_messages (sender_admin_id, title, body, target_type)
      VALUES (?, ?, ?, ?)
    `).run(adminId || null, normalizedTitle, normalizedBody, normalizedTargetType);

    const messageId = Number(result.lastInsertRowid);
    let recipients = 0;
    const recipientUserIds = [];

    if (normalizedTargetType === 'all') {
      const bulkResult = db.prepare(`
        INSERT INTO admin_popup_message_recipients (message_id, user_id)
        SELECT ?, id FROM users
      `).run(messageId);
      recipients = Number(bulkResult.changes || 0);
      const rows = db.prepare('SELECT id FROM users').all();
      for (const row of rows) recipientUserIds.push(row.id);
    } else {
      const insertRecipient = db.prepare(`
        INSERT OR IGNORE INTO admin_popup_message_recipients (message_id, user_id)
        VALUES (?, ?)
      `);
      for (const user of recipientUsers) {
        insertRecipient.run(messageId, user.id);
        recipientUserIds.push(user.id);
      }
      recipients = recipientUsers.length;
    }

    return { messageId, recipients, targetType: normalizedTargetType, recipientUserIds };
  });

  return tx();
}

function getPendingPopupForUser(userId) {
  return db.prepare(`
    SELECT
      r.id AS recipient_id,
      r.message_id,
      m.title,
      m.body,
      m.target_type,
      m.created_at
    FROM admin_popup_message_recipients r
    JOIN admin_popup_messages m ON m.id = r.message_id
    WHERE r.user_id = ? AND r.acknowledged_at IS NULL
    ORDER BY m.created_at ASC, r.id ASC
    LIMIT 1
  `).get(userId);
}

function acknowledgePopupForUser({ userId, messageId, ip, userAgent }) {
  const parsedMessageId = Number.parseInt(messageId, 10);
  if (!Number.isFinite(parsedMessageId) || parsedMessageId <= 0) {
    throw new AppError('Некорректный ID сообщения', 400);
  }

  const result = db.prepare(`
    UPDATE admin_popup_message_recipients
    SET
      acknowledged_at = datetime('now'),
      acknowledged_ip = ?,
      acknowledged_user_agent = ?
    WHERE user_id = ? AND message_id = ? AND acknowledged_at IS NULL
  `).run(ip || null, String(userAgent || '').slice(0, 512) || null, userId, parsedMessageId);

  if (!result.changes) {
    throw new AppError('Сообщение не найдено или уже подтверждено', 404);
  }
}

function getPopupStats() {
  const totalMessages = db.prepare('SELECT COUNT(*) AS count FROM admin_popup_messages').get()?.count || 0;
  const unread = db.prepare('SELECT COUNT(*) AS count FROM admin_popup_message_recipients WHERE acknowledged_at IS NULL').get()?.count || 0;
  return {
    totalMessages: Number(totalMessages),
    unreadRecipients: Number(unread)
  };
}

module.exports = {
  createPopupMessage,
  getPendingPopupForUser,
  acknowledgePopupForUser,
  getPopupStats
};
