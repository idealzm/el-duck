const config = require('../config/env');
const Admin = require('../models/Admin');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');
const SupportMessage = require('../models/SupportMessage');
const { scheduleUnreadReplyEmail } = require('../services/supportEmailNotifications');
const { getTokenFromRequest, verifyToken } = require('../utils/sessionToken');
const { serializeTicket, serializeMessage } = require('../routes/support');

function requestFromSocket(socket) {
  return { headers: { cookie: socket.handshake.headers.cookie || '' } };
}

function getSocketAdmin(socket) {
  const token = getTokenFromRequest(requestFromSocket(socket), config.auth.adminCookieName);
  if (!token) return null;
  try {
    const decoded = verifyToken(token);
    if (decoded.type !== 'admin') return null;
    const admin = Admin.getById(decoded.adminId);
    if (!admin || !admin.is_active) return null;
    if (Number(admin.token_version || 0) !== Number(decoded.tokenVersion || 0)) return null;
    return admin;
  } catch (_) {
    return null;
  }
}

function getSocketUser(socket) {
  const token = getTokenFromRequest(requestFromSocket(socket), config.auth.userCookieName);
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

function canJoinAsUser(socket, ticket) {
  const user = getSocketUser(socket);
  if (user && ticket.user_id && Number(ticket.user_id) === Number(user.id)) return true;
  return SupportTicket.verifyAccessToken(ticket, socket.handshake.auth?.key || socket.handshake.query?.key);
}

const rateLimit = require('express-rate-limit');

const socketMessageLimiter = new Map();
const SOCKET_MESSAGE_LIMIT = 30;
const SOCKET_MESSAGE_WINDOW_MS = 60 * 1000;

function checkSocketRate(socketId) {
  const now = Date.now();
  let entry = socketMessageLimiter.get(socketId);
  if (!entry || now - entry.windowStart > SOCKET_MESSAGE_WINDOW_MS) {
    entry = { count: 1, windowStart: now };
    socketMessageLimiter.set(socketId, entry);
    return true;
  }
  entry.count++;
  if (entry.count > SOCKET_MESSAGE_LIMIT) return false;
  return true;
}

function cleanupSocketRate(socketId) {
  socketMessageLimiter.delete(socketId);
}

function registerSupportSocket(io) {
  io.on('connection', (socket) => {
    socket.on('support:join', (payload = {}, ack) => {
      try {
        const ticket = SupportTicket.getByUuid(payload.ticketUuid || payload.uuid);
        if (!ticket) throw new Error('Обращение не найдено');

        const role = payload.role === 'admin' ? 'admin' : 'user';
        const admin = role === 'admin' ? getSocketAdmin(socket) : null;
        if (role === 'admin' && !admin) throw new Error('Доступ запрещён');
        if (role === 'user' && !canJoinAsUser(socket, ticket)) throw new Error('Доступ запрещён');

        socket.data.support = { ticketId: ticket.id, ticketUuid: ticket.ticket_uuid, role, adminId: admin?.id || null };
        socket.join(`support:${ticket.ticket_uuid}`);
        SupportTicket.markSeen(ticket.id, role);
        if (ack) ack({ success: true, ticket: serializeTicket(SupportTicket.getById(ticket.id)) });
      } catch (error) {
        if (ack) ack({ success: false, error: error.message });
      }
    });

    socket.on('support:message', (payload = {}, ack) => {
      try {
        if (!checkSocketRate(socket.id)) {
          if (ack) ack({ success: false, error: 'Слишком много сообщений. Подождите.' });
          return;
        }

        const joined = socket.data.support;
        if (!joined) throw new Error('Чат не подключён');
        const body = String(payload.body || '').trim();
        if (body.length < 1 || body.length > 5000) throw new Error('Сообщение должно быть от 1 до 5000 символов');

        const ticket = SupportTicket.getById(joined.ticketId);
        if (!ticket) throw new Error('Обращение не найдено');
        if (ticket.status === 'closed') throw new Error('Обращение закрыто. Новые сообщения недоступны');

        const message = SupportMessage.create({
          ticketId: ticket.id,
          senderType: joined.role,
          senderAdminId: joined.role === 'admin' ? joined.adminId : null,
          body
        });
        const updatedTicket = SupportTicket.touchAfterMessage(ticket.id, joined.role);
        SupportTicket.markSeen(ticket.id, joined.role);
        if (joined.role === 'admin') scheduleUnreadReplyEmail(ticket.id);

        const event = { ticket: serializeTicket(updatedTicket), message: serializeMessage(message) };
        io.to(`support:${ticket.ticket_uuid}`).emit('support:message', event);
        if (ack) ack({ success: true, ...event });
      } catch (error) {
        if (ack) ack({ success: false, error: error.message });
      }
    });

    socket.on('support:read', (payload = {}, ack) => {
      try {
        const joined = socket.data.support;
        if (!joined) throw new Error('Чат не подключён');
        const ticket = SupportTicket.markSeen(joined.ticketId, joined.role);
        io.to(`support:${ticket.ticket_uuid}`).emit('support:read', { role: joined.role, ticket: serializeTicket(ticket) });
        if (ack) ack({ success: true });
      } catch (error) {
        if (ack) ack({ success: false, error: error.message });
      }
    });

    socket.on('support:typing', (payload = {}) => {
      const joined = socket.data.support;
      if (!joined) return;
      socket.to(`support:${joined.ticketUuid}`).emit('support:typing', {
        role: joined.role,
        typing: !!payload.typing
      });
    });

    socket.on('disconnect', () => {
      cleanupSocketRate(socket.id);
    });
  });
}

module.exports = registerSupportSocket;
