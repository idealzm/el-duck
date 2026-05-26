const express = require('express');
const rateLimit = require('express-rate-limit');
const { validateEmail } = require('../middleware/validate');
const config = require('../config/env');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');
const SupportMessage = require('../models/SupportMessage');
const emailService = require('../services/email');
const { buildSupportUrl } = require('../services/supportEmailNotifications');
const { getTokenFromRequest, verifyToken } = require('../utils/sessionToken');
const { ok, fail } = require('../utils/httpResponse');

const router = express.Router();

const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: 'Слишком много запросов в поддержку. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false
});

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Слишком много сообщений. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false
});

function getOptionalUser(req) {
  const token = getTokenFromRequest(req, config.auth.userCookieName);
  if (!token) return null;
  try {
    const decoded = verifyToken(token);
    const user = User.getById(decoded.userId);
    if (!user) return null;
    if (Number(user.token_version || 0) !== Number(decoded.tokenVersion || 0)) return null;
    return user;
  } catch (_) {
    return null;
  }
}

function getAccessKey(req) {
  return String(req.headers['x-support-key'] || req.body?.key || '').trim();
}

function canAccessTicket(req, ticket) {
  const user = getOptionalUser(req);
  if (user && ticket.user_id && Number(ticket.user_id) === Number(user.id)) {
    req.supportUser = user;
    return true;
  }
  return SupportTicket.verifyAccessToken(ticket, getAccessKey(req));
}

function serializeTicket(ticket, { includeKey = null } = {}) {
  return {
    id: ticket.ticket_uuid,
    uuid: ticket.ticket_uuid,
    email: ticket.email,
    subject: ticket.subject,
    status: ticket.status,
    userLinked: !!ticket.user_id,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    lastMessageAt: ticket.last_message_at,
    chatUrl: buildSupportUrl(ticket, includeKey)
  };
}

function serializeMessage(message) {
  return {
    id: message.id,
    senderType: message.sender_type,
    senderAdminName: message.sender_type === 'admin' ? 'support' : null,
    body: message.body,
    createdAt: message.created_at
  };
}

function getIp(req) {
  return req.ip || req.socket?.remoteAddress || '';
}

router.post('/tickets', createLimiter, async (req, res) => {
  try {
    const user = getOptionalUser(req);
    const creatorIp = getIp(req);

    if (user) {
      const activeTicket = SupportTicket.findActiveByUserId(user.id);
      if (activeTicket) {
        const existingAccessToken = SupportTicket.getAccessToken(activeTicket);
        return ok(res, {
          ticket: serializeTicket(activeTicket, { includeKey: existingAccessToken }),
          accessKey: existingAccessToken || '',
          active: true
        }, 200);
      }
    } else if (creatorIp) {
      const activeTicket = SupportTicket.findActiveByIp(creatorIp);
      if (activeTicket) {
        const existingAccessToken = SupportTicket.getAccessToken(activeTicket);
        return ok(res, {
          ticket: serializeTicket(activeTicket, { includeKey: existingAccessToken }),
          accessKey: existingAccessToken || '',
          active: true
        }, 200);
      }
    }

    const email = user ? user.email : String(req.body.email || '').trim().toLowerCase();
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();

    if (!validateEmail(email)) return fail(res, 'Введите корректный email', 400);
    if (subject.length < 3 || subject.length > 160) return fail(res, 'Тема должна быть от 3 до 160 символов', 400);
    if (message.length < 3 || message.length > 5000) return fail(res, 'Сообщение должно быть от 3 до 5000 символов', 400);

    const duplicate = SupportTicket.findRecentDuplicate({
      userId: user?.id || null,
      email,
      subject,
      firstMessage: message,
      minutes: 5
    });

    if (duplicate) {
      const existingAccessToken = SupportTicket.getAccessToken(duplicate);
      return ok(res, {
        ticket: serializeTicket(duplicate, { includeKey: existingAccessToken }),
        accessKey: existingAccessToken || '',
        duplicate: true
      }, 200);
    }

    const { ticket, accessToken } = SupportTicket.create({
      userId: user?.id || null,
      email,
      subject,
      firstMessage: message,
      creatorIp
    });

    const chatUrl = buildSupportUrl(ticket, accessToken);
    setImmediate(async () => {
      const emailResult = await emailService.sendSupportTicketCreatedEmail(email, { ticket, chatUrl });
      if (!emailResult?.success) {
        console.error(`[Support] Не удалось отправить письмо по тикету ${ticket.ticket_uuid}:`, emailResult?.error);
      }
    });

    return ok(res, { ticket: serializeTicket(ticket, { includeKey: accessToken }), accessKey: accessToken }, 201);
  } catch (error) {
    console.error('Support ticket create error:', error);
    return fail(res, 'Ошибка создания обращения', 500);
  }
});

router.get('/my-ticket', async (req, res) => {
  try {
    const user = getOptionalUser(req);
    if (!user) return fail(res, 'Требуется авторизация', 401);

    const ticket = SupportTicket.findActiveByUserId(user.id);
    if (!ticket) return ok(res, { ticket: null }, 200);

    const accessToken = SupportTicket.getAccessToken(ticket);
    return ok(res, {
      ticket: serializeTicket(ticket, { includeKey: accessToken }),
      accessKey: accessToken || ''
    }, 200);
  } catch (error) {
    return fail(res, 'Ошибка получение обращения', 500);
  }
});

router.get('/tickets/:uuid', async (req, res) => {
  try {
    const ticket = SupportTicket.getByUuid(req.params.uuid);
    if (!ticket) return fail(res, 'Обращение не найдено', 404);
    if (!canAccessTicket(req, ticket)) return fail(res, 'Доступ запрещён', 403);

    SupportTicket.markSeen(ticket.id, 'user');
    const messages = SupportMessage.getByTicket(ticket.id);
    return ok(res, {
      ticket: serializeTicket(SupportTicket.getById(ticket.id)),
      messages: messages.map(serializeMessage)
    });
  } catch (error) {
    return fail(res, 'Ошибка загрузки обращения', 500);
  }
});

router.post('/tickets/:uuid/messages', messageLimiter, async (req, res) => {
  try {
    const ticket = SupportTicket.getByUuid(req.params.uuid);
    if (!ticket) return fail(res, 'Обращение не найдено', 404);
    if (!canAccessTicket(req, ticket)) return fail(res, 'Доступ запрещён', 403);
    if (ticket.status === 'closed') return fail(res, 'Обращение закрыто. Новые сообщения недоступны', 403);

    const body = String(req.body.body || '').trim();
    if (body.length < 1 || body.length > 5000) return fail(res, 'Сообщение должно быть от 1 до 5000 символов', 400);

    const message = SupportMessage.create({ ticketId: ticket.id, senderType: 'user', body });
    const updatedTicket = SupportTicket.touchAfterMessage(ticket.id, 'user');
    SupportTicket.markSeen(ticket.id, 'user');

    req.app.get('io')?.to(`support:${ticket.ticket_uuid}`).emit('support:message', {
      ticket: serializeTicket(updatedTicket),
      message: serializeMessage(message)
    });

    return ok(res, { message: serializeMessage(message), ticket: serializeTicket(updatedTicket) }, 201);
  } catch (error) {
    return fail(res, 'Ошибка отправки сообщения', 500);
  }
});

module.exports = {
  router,
  serializeTicket,
  serializeMessage,
  getOptionalUser
};
