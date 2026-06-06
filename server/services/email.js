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
  return 'data:image/png;base64,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';
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
 * @deprecated Используйте sendRegistrationMagicLink или sendPasswordResetMagicLink
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
 * Отправляет magic link для подтверждения регистрации
 */
async function sendRegistrationMagicLink(email, link) {
  const subject = 'Подтверждение регистрации EL-DUCK VPN';
  const html = renderEmailLayout({
    title: 'Подтверждение email',
    subtitle: 'Нажмите кнопку ниже, чтобы завершить регистрацию.',
    bodyHtml: `
      <div style="text-align:center;margin:8px 0 16px;">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#ffffff;color:#000000;text-decoration:none;font-weight:700;padding:14px 28px;font-size:16px;border-radius:0;">Подтвердить регистрацию</a>
      </div>
      <p style="margin:12px 0 0;color:#9e9e9e;font-size:13px;line-height:1.5;">Ссылка действительна 10 минут. Если вы не регистрировались, просто проигнорируйте это письмо.</p>
      <p style="margin:8px 0 0;color:#666666;font-size:12px;line-height:1.4;">Если кнопка не работает, скопируйте ссылку: ${escapeHtml(link)}</p>
    `
  });

  console.log(`Отправка magic link регистрации на ${email}`);
  const result = await sendEmail(email, subject, html);
  if (!result.success) {
    console.error(`[Email] Ошибка отправки magic link через ${result.provider}: ${result.error}`);
  }
  return result;
}

/**
 * Отправляет magic link для сброса пароля
 */
async function sendPasswordResetMagicLink(email, link) {
  const subject = 'Сброс пароля EL-DUCK VPN';
  const html = renderEmailLayout({
    title: 'Сброс пароля',
    subtitle: 'Нажмите кнопку ниже, чтобы задать новый пароль.',
    bodyHtml: `
      <div style="text-align:center;margin:8px 0 16px;">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#ffffff;color:#000000;text-decoration:none;font-weight:700;padding:14px 28px;font-size:16px;border-radius:0;">Сбросить пароль</a>
      </div>
      <p style="margin:12px 0 0;color:#9e9e9e;font-size:13px;line-height:1.5;">Ссылка действительна 10 минут. Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.</p>
      <p style="margin:8px 0 0;color:#666666;font-size:12px;line-height:1.4;">Если кнопка не работает, скопируйте ссылку: ${escapeHtml(link)}</p>
    `
  });

  console.log(`Отправка magic link сброса пароля на ${email}`);
  const result = await sendEmail(email, subject, html);
  if (!result.success) {
    console.error(`[Email] Ошибка отправки magic link сброса через ${result.provider}: ${result.error}`);
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
      <a href="${escapeHtml(chatUrl)}" style="display:inline-block;background:#ffffff;color:#000000;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:0;">Открыть чат</a>
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
      <a href="${escapeHtml(chatUrl)}" style="display:inline-block;background:#ffffff;color:#000000;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:0;">Прочитать ответ</a>
    `
  });

  return sendEmail(email, subject, html);
}

async function sendPasswordConfirmationCode(email, code) {
  const subject = 'Подтверждение регистрации EL-DUCK VPN';
  const html = renderEmailLayout({
    title: 'Подтверждение email',
    subtitle: 'Введите этот код в приложении, чтобы завершить регистрацию.',
    bodyHtml: `
      <div style="background:#0b0b0b;border:1px solid #333333;padding:18px;text-align:center;font-size:28px;font-weight:700;letter-spacing:6px;">
        ${escapeHtml(code)}
      </div>
      <p style="margin:12px 0 0;color:#9e9e9e;font-size:13px;line-height:1.5;">Код действителен 10 минут. Если вы не регистрировались, просто проигнорируйте это письмо.</p>
    `
  });

  console.log(`Отправка кода подтверждения пароля на ${email}`);
  const result = await sendEmail(email, subject, html);
  if (!result.success) {
    console.error(`[Email] Ошибка отправки кода подтверждения через ${result.provider}: ${result.error}`);
  }
  return result;
}

async function sendPasswordResetCode(email, code) {
  const subject = 'Сброс пароля EL-DUCK VPN';
  const html = renderEmailLayout({
    title: 'Сброс пароля',
    subtitle: 'Введите этот код в приложении, чтобы задать новый пароль.',
    bodyHtml: `
      <div style="background:#0b0b0b;border:1px solid #333333;padding:18px;text-align:center;font-size:28px;font-weight:700;letter-spacing:6px;">
        ${escapeHtml(code)}
      </div>
      <p style="margin:12px 0 0;color:#9e9e9e;font-size:13px;line-height:1.5;">Код действителен 10 минут. Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.</p>
    `
  });

  console.log(`Отправка кода сброса пароля на ${email}`);
  const result = await sendEmail(email, subject, html);
  if (!result.success) {
    console.error(`[Email] Ошибка отправки кода сброса через ${result.provider}: ${result.error}`);
  }
  return result;
}

module.exports = {
  sendVerificationCode,
  sendRegistrationMagicLink,
  sendPasswordResetMagicLink,
  sendLowBalanceWarning,
  sendInsufficientFundsWarning,
  sendSupportTicketCreatedEmail,
  sendSupportUnreadReplyEmail,
  sendPasswordConfirmationCode,
  sendPasswordResetCode,
  emailTransport
};
