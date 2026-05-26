const express = require('express');
const SupportTicket = require('../../models/SupportTicket');
const SupportMessage = require('../../models/SupportMessage');
const { scheduleUnreadReplyEmail } = require('../../services/supportEmailNotifications');
const { ok, fail } = require('../../utils/httpResponse');
const { serializeTicket, serializeMessage } = require('../support');

const router = express.Router();

router.get('/support/tickets', async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 300);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const tickets = SupportTicket.listAll({ status, limit, offset });
    return ok(res, { tickets: tickets.map(serializeTicket) });
  } catch (error) {
    return fail(res, 'Ошибка получения обращений', 500);
  }
});

router.get('/support/tickets/:uuid', async (req, res) => {
  try {
    const ticket = SupportTicket.getByUuid(req.params.uuid);
    if (!ticket) return fail(res, 'Обращение не найдено', 404);
    SupportTicket.markSeen(ticket.id, 'admin');
    const messages = SupportMessage.getByTicket(ticket.id);
    return ok(res, {
      ticket: serializeTicket(SupportTicket.getById(ticket.id)),
      messages: messages.map(serializeMessage)
    });
  } catch (error) {
    return fail(res, 'Ошибка загрузки обращения', 500);
  }
});

router.post('/support/tickets/:uuid/messages', async (req, res) => {
  try {
    const ticket = SupportTicket.getByUuid(req.params.uuid);
    if (!ticket) return fail(res, 'Обращение не найдено', 404);
    if (ticket.status === 'closed') return fail(res, 'Обращение закрыто. Новые сообщения недоступны', 403);
    const body = String(req.body.body || '').trim();
    if (body.length < 1 || body.length > 5000) return fail(res, 'Сообщение должно быть от 1 до 5000 символов', 400);

    const message = SupportMessage.create({ ticketId: ticket.id, senderType: 'admin', senderAdminId: req.admin.id, body });
    const updatedTicket = SupportTicket.touchAfterMessage(ticket.id, 'admin');
    SupportTicket.markSeen(ticket.id, 'admin');
    scheduleUnreadReplyEmail(ticket.id);

    req.app.get('io')?.to(`support:${ticket.ticket_uuid}`).emit('support:message', {
      ticket: serializeTicket(updatedTicket),
      message: serializeMessage(message)
    });

    return ok(res, { message: serializeMessage(message), ticket: serializeTicket(updatedTicket) }, 201);
  } catch (error) {
    return fail(res, 'Ошибка отправки сообщения', 500);
  }
});

router.put('/support/tickets/:uuid/status', async (req, res) => {
  try {
    const ticket = SupportTicket.getByUuid(req.params.uuid);
    if (!ticket) return fail(res, 'Обращение не найдено', 404);
    const status = String(req.body.status || '').trim();
    if (!['open', 'pending', 'closed'].includes(status)) return fail(res, 'Неверный статус', 400);
    if (ticket.status === 'closed') return fail(res, 'Закрытое обращение нельзя восстановить или изменить', 403);
    const updatedTicket = SupportTicket.setStatus(ticket.id, status);
    req.app.get('io')?.to(`support:${ticket.ticket_uuid}`).emit('support:status', {
      ticket: serializeTicket(updatedTicket)
    });
    return ok(res, { ticket: serializeTicket(updatedTicket) });
  } catch (error) {
    return fail(res, 'Ошибка смены статуса', 500);
  }
});

module.exports = router;
