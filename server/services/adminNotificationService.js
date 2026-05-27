const notifyService = require('./notifyService');
const PushService = require('./pushService');
const AppError = require('../utils/AppError');
const {
  createPopupMessage,
  getPopupStats
} = require('./adminPopupMessageService');

async function sendNotification({ title, body, targetType, userIds, expiresAt, priority, minReadTime }, adminId = null) {
  if (!String(body || '').trim()) {
    throw new AppError('Текст уведомления обязателен', 400);
  }

  const popup = createPopupMessage({ title, body, targetType, userIds, adminId, expiresAt, priority, minReadTime });

  let sent = 0;
  let failed = 0;
  if (popup.targetType === 'all') {
    const pushResult = await notifyService.send({ title, body, tag: 'system' });
    sent = pushResult ? 1 : 0;
    failed = pushResult ? 0 : 1;
  } else {
    for (const userId of popup.recipientUserIds) {
      const delivered = await notifyService.sendToUser(userId, { title, body, tag: 'system' });
      if (delivered) sent += 1;
      else failed += 1;
    }
  }

  const popupStats = getPopupStats();
  return {
    sent,
    failed,
    popupRecipients: popup.recipients,
    popupTargetType: popup.targetType,
    popupUnreadRecipients: popupStats.unreadRecipients
  };
}

function getNotificationStats() {
  try {
    const stats = PushService.getStats();
    const popupStats = getPopupStats();
    return {
      subscribers: Number(stats?.count || 0),
      popupMessages: popupStats.totalMessages,
      popupUnreadRecipients: popupStats.unreadRecipients
    };
  } catch (_) {
    const popupStats = getPopupStats();
    return {
      subscribers: 0,
      popupMessages: popupStats.totalMessages,
      popupUnreadRecipients: popupStats.unreadRecipients
    };
  }
}

module.exports = {
  sendNotification,
  getNotificationStats
};
