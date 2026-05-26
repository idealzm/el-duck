const config = require('../config/env');
const SupportTicket = require('../models/SupportTicket');
const emailService = require('./email');

const UNREAD_REPLY_DELAY_MS = 10 * 60 * 1000;
const timers = new Map();

function buildSupportUrl(ticket, accessToken) {
  const base = String(config.app?.url || 'http://localhost:3000').replace(/\/$/, '');
  const url = `${base}/support/${encodeURIComponent(ticket.ticket_uuid)}`;
  return accessToken ? `${url}?key=${encodeURIComponent(accessToken)}` : url;
}

function scheduleUnreadReplyEmail(ticketId) {
  if (timers.has(ticketId)) {
    clearTimeout(timers.get(ticketId));
  }

  const timer = setTimeout(async () => {
    timers.delete(ticketId);
    try {
      const ticket = SupportTicket.getById(ticketId);
      if (!SupportTicket.isAdminReplyUnread(ticket)) return;

      const result = await emailService.sendSupportUnreadReplyEmail(ticket.email, {
        ticket,
        chatUrl: buildSupportUrl(ticket, SupportTicket.getAccessToken(ticket))
      });
      if (result?.success) {
        SupportTicket.markUnreadEmailNotified(ticket.id);
      }
    } catch (error) {
      console.error('[Support] Delayed unread email error:', error.message);
    }
  }, UNREAD_REPLY_DELAY_MS);

  timers.set(ticketId, timer);
}

module.exports = {
  UNREAD_REPLY_DELAY_MS,
  buildSupportUrl,
  scheduleUnreadReplyEmail
};
