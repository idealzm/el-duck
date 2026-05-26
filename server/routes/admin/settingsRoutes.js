const express = require('express');
const { ok, fail } = require('../../utils/httpResponse');
const { getAdminSettings, updateAdminSettings } = require('../../services/adminSettingsService');
const {
  getReferralSettingsForAdmin,
  updateReferralSettings,
  getReferralStats,
  listReferralRewards,
  listTopInviters
} = require('../../services/adminReferralService');
const pasarguardService = require('../../services/pasarguardService');
const { parsePaging } = require('./_helpers');

const router = express.Router();

router.get('/settings', async (req, res) => {
  try {
    return ok(res, { settings: getAdminSettings() });
  } catch (error) {
    return fail(res, 'Ошибка получения настроек', 500);
  }
});

router.put('/settings', async (req, res) => {
  try {
    updateAdminSettings(req.body || {});
    return ok(res, { message: 'Настройки сохранены' });
  } catch (error) {
    return fail(res, 'Ошибка сохранения настроек', 500);
  }
});

router.get('/pasarguard/templates', async (req, res) => {
  try {
    const templates = await pasarguardService.listUserTemplatesSimple();
    const normalized = templates
      .map((item) => ({
        id: Number(item?.id),
        name: String(item?.name || item?.title || `Template #${item?.id || ''}`).trim()
      }))
      .filter((item) => Number.isInteger(item.id) && item.id > 0)
      .sort((a, b) => a.id - b.id);
    return ok(res, { templates: normalized });
  } catch (error) {
    return fail(res, `Ошибка загрузки шаблонов PasarGuard: ${error.message}`, 500);
  }
});

router.get('/referrals/settings', async (req, res) => {
  try {
    return ok(res, { settings: getReferralSettingsForAdmin() });
  } catch (error) {
    return fail(res, 'Ошибка получения реферальных настроек', 500);
  }
});

router.put('/referrals/settings', async (req, res) => {
  try {
    updateReferralSettings(req.body || {});
    return ok(res, { message: 'Реферальные настройки сохранены' });
  } catch (error) {
    return fail(res, 'Ошибка сохранения реферальных настроек', 500);
  }
});

router.get('/referrals/stats', async (req, res) => {
  try {
    return ok(res, { stats: getReferralStats() });
  } catch (error) {
    return fail(res, 'Ошибка получения статистики рефералов', 500);
  }
});

router.get('/referrals/list', async (req, res) => {
  try {
    return ok(res, {
      rewards: listReferralRewards(parsePaging(req.query.limit, 200), parsePaging(req.query.offset, 0))
    });
  } catch (error) {
    return fail(res, 'Ошибка получения реферальных начислений', 500);
  }
});

router.get('/referrals/inviters', async (req, res) => {
  try {
    const limit = parsePaging(req.query.limit, 100);
    return ok(res, { inviters: listTopInviters(limit) });
  } catch (error) {
    return fail(res, 'Ошибка получения списка рефереров', 500);
  }
});

module.exports = router;
