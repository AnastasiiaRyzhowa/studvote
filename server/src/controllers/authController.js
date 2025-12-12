const jwt = require('jsonwebtoken');
const User = require('../models/User');
const redis = require('../config/redis');
const { sendVerificationCode } = require('../services/emailService');
const { 
  EMAIL_PATTERNS, 
  USER_ROLES, 
  CODE_EXPIRATION,
  JWT_EXPIRATION,
  FACULTIES,
  COURSES,
  GROUPS,
  DEPARTMENTS
} = require('../config/constants');

/**
 * Определяет роль пользователя по email
 */
const determineRole = (email) => {
  if (email === EMAIL_PATTERNS.ADMIN) {
    return USER_ROLES.ADMIN;
  }
  if (EMAIL_PATTERNS.STUDENT.test(email)) {
    return USER_ROLES.STUDENT;
  }
  if (EMAIL_PATTERNS.TEACHER.test(email)) {
    return USER_ROLES.TEACHER;
  }
  return null;
};

/**
 * Извлекает student_id из email студента
 */
const extractStudentId = (email) => {
  const match = email.match(/^(\d{6})@edu\.fa\.ru$/);
  return match ? match[1] : null;
};

/**
 * Генерирует случайный 6-значный код
 */
const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Генерирует JWT токен
 */
const generateToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRATION || JWT_EXPIRATION }
  );
};

/**
 * ЭТАП 1: Запрос кода подтверждения
 * POST /api/auth/request-code
 */
exports.requestCode = async (req, res) => {
  try {
    const { email } = req.body;

    // Валидация
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email обязателен' 
      });
    }

    // Определение роли
    const role = determineRole(email.toLowerCase());
    if (!role) {
      return res.status(400).json({ 
        success: false, 
        message: 'Недопустимый email домен. Используйте @edu.fa.ru, @fa.ru или admin@fa.ru' 
      });
    }

    // Генерация кода
    const code = generateCode();

    // Сохранение в Redis с TTL 5 минут
    const redisKey = `auth:code:${email.toLowerCase()}`;
    await redis.setex(redisKey, CODE_EXPIRATION, JSON.stringify({
      code,
      role,
      timestamp: Date.now()
    }));

    // Отправка кода на email (mock)
    await sendVerificationCode(email, code);

    res.json({ 
      success: true, 
      message: 'Код отправлен на email',
      expiresIn: CODE_EXPIRATION 
    });

  } catch (error) {
    console.error('Ошибка в requestCode:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера при отправке кода' 
    });
  }
};

/**
 * ЭТАП 2: Проверка кода подтверждения
 * POST /api/auth/verify-code
 */
exports.verifyCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    // Валидация
    if (!email || !code) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email и код обязательны' 
      });
    }

    // Проверка кода в Redis
    const redisKey = `auth:code:${email.toLowerCase()}`;
    const storedData = await redis.get(redisKey);

    if (!storedData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Код истек или не существует. Запросите новый код' 
      });
    }

    const { code: storedCode, role } = JSON.parse(storedData);

    if (code !== storedCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'Неверный код подтверждения' 
      });
    }

    // Удаляем код из Redis (одноразовое использование)
    await redis.del(redisKey);

    // Поиск пользователя в MongoDB
    const user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      // Пользователь существует - генерируем токен и входим
      const token = generateToken(user._id, user.role);
      
      return res.json({
        success: true,
        token,
        user: user.toPublicJSON(),
        message: 'Вход выполнен успешно'
      });
    } else {
      // Новый пользователь - требуется регистрация
      // Создаем временный токен для регистрации
      const tempToken = jwt.sign(
        { email: email.toLowerCase(), role, temp: true },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      return res.json({
        success: true,
        needsRegistration: true,
        role,
        tempToken,
        studentId: role === USER_ROLES.STUDENT ? extractStudentId(email.toLowerCase()) : null,
        message: 'Требуется регистрация'
      });
    }

  } catch (error) {
    console.error('Ошибка в verifyCode:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера при проверке кода' 
    });
  }
};

/**
 * ЭТАП 3: Регистрация нового пользователя
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { tempToken, full_name, faculty, course, group, department } = req.body;

    // Валидация tempToken
    if (!tempToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Токен регистрации отсутствует' 
      });
    }

    // Проверка tempToken
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
      if (!decoded.temp) {
        throw new Error('Неверный токен');
      }
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        message: 'Недействительный или истекший токен регистрации' 
      });
    }

    const { email, role } = decoded;

    // Валидация общих полей
    if (!full_name || full_name.trim().length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'ФИО обязательно и должно содержать минимум 2 символа' 
      });
    }

    // Проверка существования пользователя
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Пользователь с таким email уже существует' 
      });
    }

    // Подготовка данных пользователя
    const userData = {
      email,
      full_name: full_name.trim(),
      role
    };

    // Валидация специфичных для роли полей
    if (role === USER_ROLES.STUDENT) {
      // Студент
      if (!faculty || !FACULTIES.includes(faculty)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Выберите корректный факультет' 
        });
      }
      if (!course || !COURSES.includes(parseInt(course))) {
        return res.status(400).json({ 
          success: false, 
          message: 'Выберите корректный курс (1-5)' 
        });
      }
      if (!group || !GROUPS.includes(group)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Выберите корректную группу' 
        });
      }

      userData.student_id = extractStudentId(email);
      userData.faculty = faculty;
      userData.course = parseInt(course);
      userData.group = group;

    } else if (role === USER_ROLES.TEACHER) {
      // Преподаватель
      if (!department || !DEPARTMENTS.includes(department)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Выберите корректную кафедру' 
        });
      }

      userData.department = department;
      userData.subjects = [];

    } else if (role === USER_ROLES.ADMIN) {
      // Администратор - только ФИО
      // Никаких дополнительных полей не требуется
    }

    // Создание пользователя
    const user = await User.create(userData);

    // Генерация постоянного JWT токена
    const token = generateToken(user._id, user.role);

    res.status(201).json({
      success: true,
      token,
      user: user.toPublicJSON(),
      message: 'Регистрация успешна'
    });

  } catch (error) {
    console.error('Ошибка в register:', error);
    
    // Обработка ошибок валидации Mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        message: messages.join(', ') 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера при регистрации' 
    });
  }
};

/**
 * Получить данные текущего пользователя
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    res.json({
      success: true,
      user: user.toPublicJSON()
    });

  } catch (error) {
    console.error('Ошибка в getMe:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
};

/**
 * Получить константы для форм (факультеты, кафедры и т.д.)
 * GET /api/auth/constants
 */
exports.getConstants = async (req, res) => {
  try {
    res.json({
      success: true,
      constants: {
        faculties: FACULTIES,
        courses: COURSES,
        groups: GROUPS,
        departments: DEPARTMENTS,
        roles: Object.values(USER_ROLES)
      }
    });
  } catch (error) {
    console.error('Ошибка в getConstants:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
};

