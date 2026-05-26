const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const Payment = require('../models/Payment');
const { getPaymentProvider } = require('../services/payment');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { finalizePayment } = require('../services/paymentFinalizer');

function safeHexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aNorm = a.trim().toLowerCase();
  const bNorm = b.trim().toLowerCase();
  const aBuf = Buffer.from(aNorm);
  const bBuf = Buffer.from(bNorm);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Слишком много запросов' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress
});

function verifyWebhookSignature(req, providerInstance) {
  const provider = config.payment.provider;
  const secret = config.payment.secret;

  if (provider === 'severpay') {
    if (!providerInstance || typeof providerInstance.verifyWebhookSign !== 'function') return false;
    return providerInstance.verifyWebhookSign(req.body);
  }

  if (provider === 'yookassa') {
    const signature = req.headers['content-signature-sha256'] || req.headers['x-content-signature-sha256'];
    if (!signature || !secret) return false;

    const body = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return safeHexEqual(signature, expected);
  }

  const authHeader = req.headers['x-webhook-signature'] || req.headers['x-signature'];
  if (authHeader && secret) {
    const body = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return safeHexEqual(authHeader, expected);
  }

  return false;
}

/**
 * Подтверждение платежа и зачисление на баланс
 */
async function confirmPaymentAndResumeProxy(paymentId) {
  const result = finalizePayment(paymentId);
  return !!result.success;
}

/**
 * POST /api/payments/webhook
 * Webhook для платёжных систем
 */
router.post('/webhook', webhookLimiter, async (req, res) => {
  try {
    const paymentProvider = getPaymentProvider();
    const provider = config.payment.provider;

    if (provider !== 'stub') {
      if (!verifyWebhookSignature(req, paymentProvider)) {
        console.warn('Webhook signature verification failed');
        return res.status(401).json({ error: 'Неверная подпись' });
      }
    }

    if (paymentProvider.handleWebhook) {
      const result = await paymentProvider.handleWebhook(req, res);
      if (result) return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Ошибка обработки webhook' });
  }
});

/**
 * GET /api/payments/stub-success
 * Страница успешного платежа (return URL)
 * Требует авторизацию пользователя во избежание несанкционированного пополнения.
 */
router.get('/stub-success', authMiddleware, async (req, res) => {
  const { payment_id } = req.query;

  if (!payment_id) {
    return res.status(400).json({ error: 'Payment ID обязателен' });
  }

  const paymentProvider = getPaymentProvider();
  const provider = config.payment.provider;

  if (provider === 'stub') {
    if (!config.payment.allowStubConfirmation) {
      return res.status(403).json({ success: false, error: 'Stub-подтверждение платежей отключено' });
    }

    const payment = Payment.getByPaymentId(payment_id);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Платёж не найден' });
    }

    if (Number(payment.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, error: 'Нет доступа к этому платежу' });
    }

    await confirmPaymentAndResumeProxy(payment_id);
    return res.json({
      success: true,
      message: 'Платёж успешно обработан. Баланс зачислен.'
    });
  }

  if (paymentProvider.confirmPayment) {
    const result = await paymentProvider.confirmPayment(payment_id);
    return res.json({
      success: result.success,
      message: result.success ? 'Платёж подтверждён. Баланс зачислен.' : 'Платёж ещё не оплачен',
      provider
    });
  }

  return res.status(400).json({ success: false, error: `Подтверждение для провайдера ${provider} не поддерживается` });
});

/**
 * GET /api/payments/history
 * История платежей пользователя
 */
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const payments = Payment.getByUser(req.user.id);
    
    res.json({
      success: true,
      payments: payments.map(p => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        paymentKind: p.payment_kind || 'topup',
        paymentId: p.payment_id,
        createdAt: p.created_at
      }))
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ error: 'Ошибка получения истории платежей' });
  }
});

/**
 * GET /api/payments/admin/all
 * Все платежи (только админ)
 */
router.get('/admin/all', adminMiddleware, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const payments = Payment.getAll(parseInt(limit), parseInt(offset));
    
    res.json({
      success: true,
      payments: payments.map(p => ({
        id: p.id,
        email: p.email,
        amount: p.amount,
        status: p.status,
        paymentKind: p.payment_kind || 'topup',
        paymentId: p.payment_id,
        is_admin: p.is_admin,
        actorAdminNickname: p.actor_admin_nickname || null,
        actorAdminEmail: p.actor_admin_email || null,
        createdAt: p.created_at
      }))
    });
  } catch (error) {
    console.error('Get all payments error:', error);
    res.status(500).json({ error: 'Ошибка получения платежей' });
  }
});

module.exports = router;
