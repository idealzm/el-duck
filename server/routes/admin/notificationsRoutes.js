const express = require('express');
const { ok } = require('../../utils/httpResponse');
const { sendNotification, getNotificationStats } = require('../../services/adminNotificationService');
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

module.exports = router;
