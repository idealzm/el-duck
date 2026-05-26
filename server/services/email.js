const nodemailer = require('nodemailer');
const config = require('../config/env');

const emailTransport = (config.email?.transport || 'smtp').toLowerCase();

function getMailFrom() {
  return config.smtp.from || 'System Reminder <noreply@el-duck.com>';
}

/**
 * Отправка через sendmail (Postfix)
 */
async function sendViaSendmail(to, subject, html) {
  try {
    const transporter = nodemailer.createTransport({
      sendmail: true,
      newline: 'unix',
      path: config.email?.sendmailPath || '/usr/sbin/sendmail'
    });

    await transporter.sendMail({
      from: getMailFrom(),
      to,
      subject,
      html
    });

    return { success: true, provider: 'sendmail', message: 'Письмо отправлено через sendmail' };
  } catch (error) {
    console.error('Sendmail error:', error);
    return { success: false, provider: 'sendmail', error: error.message };
  }
}

/**
 * Отправка через SMTP
 */
async function sendViaSmtp(to, subject, html) {
  if (!config.smtp.host) {
    return { success: false, provider: 'smtp', error: 'SMTP_HOST не задан' };
  }

  if (!config.smtp.user || !config.smtp.pass) {
    return { success: false, provider: 'smtp', error: 'SMTP_USER или SMTP_PASS не задан' };
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: Number(config.smtp.port) || 587,
    secure: Number(config.smtp.port) === 465,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass
    }
  });

  try {
    await transporter.sendMail({
      from: getMailFrom(),
      to,
      subject,
      html
    });
    return { success: true, provider: 'smtp', message: 'Письмо отправлено через SMTP' };
  } catch (error) {
    console.error('SMTP error:', error);
    return { success: false, provider: 'smtp', error: error.message };
  }
}

async function sendEmail(to, subject, html) {
  if (emailTransport === 'sendmail') {
    return sendViaSendmail(to, subject, html);
  }

  if (emailTransport === 'smtp') {
    return sendViaSmtp(to, subject, html);
  }

  const smtpResult = await sendViaSmtp(to, subject, html);
  if (smtpResult.success) return smtpResult;

  const sendmailResult = await sendViaSendmail(to, subject, html);
  if (sendmailResult.success) return sendmailResult;

  return {
    success: false,
    provider: 'auto',
    error: `SMTP: ${smtpResult.error}; sendmail: ${sendmailResult.error}`
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  return `${Number(value || 0).toFixed(2)} ₽`;
}

function getEmailLogoUrl() {
  const base = String(config.app?.url || '').trim().replace(/\/$/, '');
  const safeBase = base || 'https://el-duck.com';
  return `${safeBase}/assets/brand/logo.svg`;
}

function renderEmailLayout({ title, subtitle, bodyHtml }) {

  return `
    <!doctype html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="color-scheme" content="dark" />
      <meta name="supported-color-schemes" content="dark" />
      <title>${escapeHtml(title)}</title>
    </head>
    <body style="margin:0;padding:0;background:#000000;color:#ffffff;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#000000" style="background:#000000;">
        <tr>
          <td align="center" style="padding:24px 12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="width:100%;max-width:520px;background:#070707;border:1px solid #333333;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <tr>
                <td style="padding:18px 20px;border-bottom:1px solid #333333;background:#000000;">
                  <span style="display:inline-block;background:#000000;border:1px solid #333333;padding:8px;line-height:0;">
                    <img src="${escapeHtml(getEmailLogoUrl())}" width="96" height="51" alt="EL-DUCK" style="display:block;border:0;outline:none;text-decoration:none;" />
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding:20px;">
                  <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;line-height:1.3;color:#ffffff;">${escapeHtml(title)}</h2>
                  <p style="margin:0 0 14px;color:#b3b3b3;font-size:14px;line-height:1.6;">${escapeHtml(subtitle)}</p>
                  ${bodyHtml}
                </td>
              </tr>
              <tr>
                <td style="padding:12px 20px;border-top:1px solid #333333;font-size:12px;color:#7a7a7a;line-height:1.5;">
                  Это автоматическое письмо. Если вы не запрашивали действие, просто проигнорируйте его.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Отправляет код подтверждения на email
 */
async function sendVerificationCode(email, code) {
  const subject = 'Код подтверждения EL-DUCK VPN';
  const html = renderEmailLayout({
    title: 'Подтверждение входа',
    subtitle: 'Введите код в приложении, чтобы завершить вход.',
    bodyHtml: `
      <div style="background:#0b0b0b;border:1px solid #333333;padding:18px;text-align:center;font-size:28px;font-weight:700;letter-spacing:6px;">
        ${escapeHtml(code)}
      </div>
      <p style="margin:12px 0 0;color:#9e9e9e;font-size:13px;line-height:1.5;">Код действителен 10 минут. Никому его не сообщайте.</p>
    `
  });

  console.log(`Отправка кода на ${email}`);

  const result = await sendEmail(email, subject, html);
  if (!result.success) {
    console.error(`[Email] Ошибка отправки кода через ${result.provider}: ${result.error}`);
  }
  return result;
}

/**
 * Отправляет предупреждение о низком балансе
 */
async function sendLowBalanceWarning(email, daysRemaining, balance, dailyRate) {
  const subject = '⚠️ Низкий баланс подписки El-Duck VPN';
  const html = renderEmailLayout({
    title: 'Низкий баланс',
    subtitle: 'Подписка продолжает работать, но средств осталось мало.',
    bodyHtml: `
      <div style="border:1px solid #333333;background:#0b0b0b;padding:12px 14px;margin-bottom:12px;">
        <p style="margin:0;color:#d5d5d5;">Баланс: <strong style="color:#ffffff;">${escapeHtml(formatCurrency(balance))}</strong></p>
        <p style="margin:8px 0 0;color:#d5d5d5;">Расход: <strong style="color:#ffffff;">${escapeHtml(formatCurrency(dailyRate))}/день</strong></p>
        <p style="margin:8px 0 0;color:#d5d5d5;">Хватит примерно на: <strong style="color:#ffffff;">${escapeHtml(daysRemaining)} дн.</strong></p>
      </div>
      <div style="border:1px solid #333333;background:rgba(255,255,255,0.06);padding:12px;color:#ededed;font-weight:600;">
        Рекомендуем пополнить баланс, чтобы избежать отключения подписки.
      </div>
    `
  });

  console.log(`Отправка предупреждения о низком балансе на ${email}`);

  return sendEmail(email, subject, html);
}

/**
 * Отправляет уведомление о недостатке средств
 */
async function sendInsufficientFundsWarning(email, balance, dailyRate) {
  const subject = '❌ Подписка приостановлена — недостаточно средств';
  const html = renderEmailLayout({
    title: 'Подписка приостановлена',
    subtitle: 'На балансе недостаточно средств для следующего продления.',
    bodyHtml: `
      <div style="border:1px solid #333333;background:#0b0b0b;padding:12px;margin-bottom:12px;">
        <p style="margin:0;color:#d5d5d5;">Баланс: <strong style="color:#ffffff;">${escapeHtml(formatCurrency(balance))}</strong></p>
        <p style="margin:8px 0 0;color:#d5d5d5;">Нужно для продления: <strong style="color:#ffffff;">${escapeHtml(formatCurrency(dailyRate))}</strong></p>
      </div>
      <p style="margin:0;color:#e4e4e4;font-weight:600;line-height:1.5;">Пополните баланс, затем возобновите подписку в личном кабинете.</p>
    `
  });

  console.log(`Отправка уведомления о недостатке средств на ${email}`);

  return sendEmail(email, subject, html);
}

async function sendSupportTicketCreatedEmail(email, { ticket, chatUrl }) {
  const subject = `Запрос в поддержку EL-DUCK #${ticket.ticket_uuid.slice(0, 8)}`;
  const html = renderEmailLayout({
    title: 'Запрос в поддержку создан',
    subtitle: `Статус: ${ticket.status}. Мы ответим в этом чате.`,
    bodyHtml: `
      <div style="border:1px solid #333333;background:#0b0b0b;padding:12px 14px;margin-bottom:12px;">
        <p style="margin:0;color:#d5d5d5;">Тема: <strong style="color:#ffffff;">${escapeHtml(ticket.subject)}</strong></p>
        <p style="margin:8px 0 0;color:#d5d5d5;">Номер: <strong style="color:#ffffff;">${escapeHtml(ticket.ticket_uuid)}</strong></p>
      </div>
      <a href="${escapeHtml(chatUrl)}" style="display:inline-block;background:#ffffff;color:#000000;text-decoration:none;font-weight:700;padding:12px 16px;">Открыть чат</a>
      <p style="margin:12px 0 0;color:#9e9e9e;font-size:13px;line-height:1.5;">Ссылка защищена уникальным ключом доступа. Не пересылайте ее посторонним.</p>
    `
  });

  return sendEmail(email, subject, html);
}

async function sendSupportUnreadReplyEmail(email, { ticket, chatUrl }) {
  const subject = `Новый ответ поддержки EL-DUCK #${ticket.ticket_uuid.slice(0, 8)}`;
  const html = renderEmailLayout({
    title: 'Поддержка ответила',
    subtitle: 'Вы давно не открывали чат, поэтому мы отправили уведомление на email.',
    bodyHtml: `
      <div style="border:1px solid #333333;background:#0b0b0b;padding:12px 14px;margin-bottom:12px;">
        <p style="margin:0;color:#d5d5d5;">Тема: <strong style="color:#ffffff;">${escapeHtml(ticket.subject)}</strong></p>
        <p style="margin:8px 0 0;color:#d5d5d5;">Статус: <strong style="color:#ffffff;">${escapeHtml(ticket.status)}</strong></p>
      </div>
      <a href="${escapeHtml(chatUrl)}" style="display:inline-block;background:#ffffff;color:#000000;text-decoration:none;font-weight:700;padding:12px 16px;">Прочитать ответ</a>
    `
  });

  return sendEmail(email, subject, html);
}

module.exports = {
  sendVerificationCode,
  sendLowBalanceWarning,
  sendInsufficientFundsWarning,
  sendSupportTicketCreatedEmail,
  sendSupportUnreadReplyEmail,
  emailTransport
};
