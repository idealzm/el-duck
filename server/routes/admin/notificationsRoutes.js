const express = require('express');
const { ok } = require('../../utils/httpResponse');
const { sendNotification, getNotificationStats } = require('../../services/adminNotificationService');
const { getPopupStats, cleanupExpiredPopups, getAllPopups, deletePopup } = require('../../services/adminPopupMessageService');
const { failFromError } = require('./_helpers');

const router = express.Router();

router.post('/notifications/send', async (req, res) => {
  try {
    return ok(res, await sendNotification(req.body || {}, req.admin?.id || null));
  } catch (error) {
    return failFromError(res, error, 'Ошибка отправки уведомления');
  }
});

router.get('/notifications/stats', async (req, res) => {
  return ok(res, getNotificationStats());
});

router.get('/notifications/popups', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    return ok(res, { popups: getAllPopups(limit, offset) });
  } catch (error) {
    return failFromError(res, error, 'Ошибка получения popup-уведомлений');
  }
});

router.post('/notifications/cleanup-expired', async (req, res) => {
  try {
    return ok(res, cleanupExpiredPopups());
  } catch (error) {
    return failFromError(res, error, 'Ошибка очистки истёкших уведомлений');
  }
});

router.delete('/notifications/popups/:id', async (req, res) => {
  try {
    const result = deletePopup(req.params.id);
    return ok(res, result);
  } catch (error) {
    if (error.statusCode) return failFromError(res, error, error.message);
    return failFromError(res, error, 'Ошибка удаления уведомления');
  }
});

module.exports = router;