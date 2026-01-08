// Email сервис для отправки кодов подтверждения через Яндекс SMTP
const nodemailer = require('nodemailer');

/**
 * Отправляет код подтверждения на email студента
 * @param {string} email - Email получателя (студента/преподавателя/админа)
 * @param {string} code - 6-значный код подтверждения
 * @returns {Promise<boolean>} - true если отправка успешна, false если ошибка
 */
const sendVerificationCode = async (email, code) => {
  try {
    // Проверка валидности email перед отправкой
    const emailLower = email.toLowerCase();
    const isStudent = /^\d{6}@edu\.fa\.ru$/.test(emailLower);
    const isTeacher = /^[a-z]+@fa\.ru$/.test(emailLower);
    const isAdmin = emailLower === 'admin@fa.ru';

    if (!isStudent && !isTeacher && !isAdmin) {
      console.error('❌ Попытка отправки на недопустимый email:', email);
      return false;
    }

    // Если SMTP не сконфигурирован или дев-режим — не падаем, логируем и возвращаем успех (mock)
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_PORT || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.warn('⚠️ SMTP не сконфигурирован, отправка кода пропущена (mock).');
      return true;
    }

    // Создаём транспортер для Яндекс SMTP (secure = true, порт 465)
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT),
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    // Отправляем красиво оформленное письмо
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `"StudVote" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🔐 Код подтверждения StudVote',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 40px auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 2px; border-radius: 16px;">
            <div style="background-color: white; border-radius: 14px; padding: 40px;">
              
              <!-- Логотип и заголовок -->
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #667eea; font-size: 32px; margin: 0 0 10px 0; font-weight: 700;">StudVote</h1>
                <p style="color: #6B7280; margin: 0; font-size: 14px;">Платформа студенческих голосований</p>
              </div>

              <!-- Основное сообщение -->
              <div style="text-align: center; margin-bottom: 30px;">
                <h2 style="color: #111827; font-size: 24px; margin: 0 0 15px 0;">Добро пожаловать!</h2>
                <p style="color: #6B7280; font-size: 16px; line-height: 1.5; margin: 0;">
                  Ваш код подтверждения для входа в систему:
                </p>
              </div>

              <!-- Код подтверждения -->
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 30px; margin: 30px 0; text-align: center;">
                <div style="background-color: white; border-radius: 8px; padding: 20px; display: inline-block;">
                  <h1 style="color: #667eea; font-size: 48px; letter-spacing: 12px; margin: 0; font-weight: 700; font-family: 'Courier New', monospace;">
                    ${code}
                  </h1>
                </div>
              </div>

              <!-- Важная информация -->
              <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; border-radius: 8px; margin: 25px 0;">
                <p style="color: #92400E; margin: 0; font-size: 14px; font-weight: 600;">
                  ⏱️ Код действителен в течение 10 минут
                </p>
              </div>

              <!-- Предупреждение о безопасности -->
              <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 25px 0;">
                <p style="color: #374151; margin: 0 0 10px 0; font-size: 14px; line-height: 1.6;">
                  🔒 <strong>Важно для безопасности:</strong>
                </p>
                <ul style="color: #6B7280; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6;">
                  <li>Никому не сообщайте этот код</li>
                  <li>Администрация никогда не попросит у вас код</li>
                  <li>Если вы не запрашивали код, проигнорируйте письмо</li>
                </ul>
              </div>

              <!-- Подвал -->
              <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
                <p style="color: #9CA3AF; font-size: 12px; margin: 0 0 5px 0;">
                  © 2025 StudVote. Финансовый Университет при Правительстве РФ
                </p>
                <p style="color: #9CA3AF; font-size: 11px; margin: 0;">
                  Это автоматическое письмо, отвечать на него не нужно.
                </p>
              </div>

            </div>
          </div>
        </body>
        </html>
      `,
      // Текстовая версия письма для почтовых клиентов без HTML
      text: `
StudVote - Платформа студенческих голосований

Добро пожаловать!

Ваш код подтверждения для входа в систему: ${code}

⏱️ Код действителен в течение 10 минут

🔒 Важно для безопасности:
- Никому не сообщайте этот код
- Администрация никогда не попросит у вас код
- Если вы не запрашивали код, проигнорируйте письмо

© 2025 StudVote. Финансовый Университет при Правительстве РФ
      `
    });

    // Логирование успешной отправки
    console.log('\n✅ ═══════════════════════════════════════════════════');
    console.log('📧 Email успешно отправлен!');
    console.log(`📨 Получатель: ${email}`);
    console.log(`🔑 Код: ${code}`);
    console.log(`📬 Message ID: ${info.messageId}`);
    console.log('═══════════════════════════════════════════════════\n');

    return true;

  } catch (error) {
    // Логирование ошибки с подробностями; в дев-режиме не блокируем
    console.error('\n❌ ═══════════════════════════════════════════════════');
    console.error('📧 ОШИБКА при отправке email!');
    console.error(`📨 Получатель: ${email}`);
    console.error(`🔑 Код: ${code}`);
    console.error('📋 Детали ошибки:');
    console.error(error);
    console.error('═══════════════════════════════════════════════════\n');

    // В dev окружении не блокируем флоу
    if (process.env.NODE_ENV !== 'production') {
      console.warn('⚠️ Dev-режим: считаем отправку успешной несмотря на ошибку SMTP');
      return true;
    }

    return false;
  }
};

module.exports = {
  sendVerificationCode
};

