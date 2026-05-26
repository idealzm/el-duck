const express = require('express');
const { createValidator } = require('../../middleware/validate');
const { ok, fail } = require('../../utils/httpResponse');
const {
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  getPromoCodeRedemptions
} = require('../../services/adminPromoService');
const { parsePaging, failFromError } = require('./_helpers');

const router = express.Router();

const validatePromoCode = createValidator({
  code: { required: true, type: 'string', minLength: 3, maxLength: 32 },
  rewardType: { required: false, enum: ['fixed', 'percent'] },
  rewardValue: { required: true, type: 'number', min: 0.01 },
  instantGrant: { required: false, type: 'boolean' },
  minTopup: { required: false, type: 'number', min: 0 },
  maxReward: { required: false, type: 'number', min: 0 },
  totalLimit: { required: false, type: 'number', min: 1 },
  perUserLimit: { required: false, type: 'number', min: 1 }
});

router.get('/promocodes', async (req, res) => {
  try {
    return ok(res, {
      promoCodes: listPromoCodes(parsePaging(req.query.limit, 200), parsePaging(req.query.offset, 0))
    });
  } catch (_) {
    return fail(res, 'Ошибка получения промокодов', 500);
  }
});

router.post('/promocodes', validatePromoCode, async (req, res) => {
  try {
    return ok(res, { promoCode: createPromoCode(req.body) });
  } catch (error) {
    return failFromError(res, error, 'Ошибка создания промокода');
  }
});

router.put('/promocodes/:id', async (req, res) => {
  try {
    return ok(res, { promoCode: updatePromoCode(req.params.id, req.body) });
  } catch (error) {
    return failFromError(res, error, 'Ошибка обновления промокода');
  }
});

router.delete('/promocodes/:id', async (req, res) => {
  try {
    deletePromoCode(req.params.id);
    return ok(res, { message: 'Промокод удалён' });
  } catch (error) {
    return failFromError(res, error, 'Ошибка удаления промокода');
  }
});

router.get('/promocodes/:id/redemptions', async (req, res) => {
  try {
    return ok(res, {
      redemptions: getPromoCodeRedemptions(req.params.id, parsePaging(req.query.limit, 200), parsePaging(req.query.offset, 0))
    });
  } catch (_) {
    return fail(res, 'Ошибка получения использований промокода', 500);
  }
});

module.exports = router;
