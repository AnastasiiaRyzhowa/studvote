const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware для проверки JWT токена
 * Добавляет информацию о пользователе в req.user
 */
exports.authenticate = async (req, res, next) => {
  try {
    // Получение токена из заголовка Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Токен не предоставлен' 
      });
    }

    const token = authHeader.substring(7); // Убираем 'Bearer '

    // Проверка токена
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false, 
          message: 'Токен истек' 
        });
      }
      return res.status(401).json({ 
        success: false, 
        message: 'Недействительный токен' 
      });
    }

    // Проверяем, что это не временный токен для регистрации
    if (decoded.temp) {
      return res.status(401).json({ 
        success: false, 
        message: 'Временный токен не может использоваться для доступа' 
      });
    }

    // Проверка существования пользователя
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    // Проверка блокировки пользователя
    // undefined считаем активным (для старых данных)
    if (user.is_active === false) {
      return res.status(403).json({
        success: false,
        message: 'Пользователь заблокирован'
      });
    }

    // Добавление информации о пользователе в запрос
    req.user = {
      userId: user._id,
      email: user.email,
      role: user.role
    };

    next();

  } catch (error) {
    console.error('Ошибка в authenticate middleware:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка аутентификации' 
    });
  }
};

/**
 * Middleware для проверки роли пользователя
 * @param {string[]} allowedRoles - Массив разрешенных ролей
 * @returns {Function} Express middleware
 * 
 * Использование:
 * router.get('/admin-only', authenticate, authorize(['admin']), controller)
 */
exports.authorize = (...allowedRoles) => {
  return (req, res, next) => {
    // Проверяем, что пользователь аутентифицирован
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Аутентификация требуется' 
      });
    }

    // Проверяем роль пользователя
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Недостаточно прав доступа',
        requiredRoles: allowedRoles,
        userRole: req.user.role
      });
    }

    next();
  };
};

/**
 * Опциональная аутентификация
 * Если токен предоставлен - проверяет и добавляет req.user
 * Если токен не предоставлен - пропускает дальше без ошибки
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Нет токена - продолжаем без аутентификации
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded.temp) {
        const user = await User.findById(decoded.userId);
        if (user) {
          req.user = {
            userId: user._id,
            email: user.email,
            role: user.role
          };
        }
      }
    } catch (error) {
      // Игнорируем ошибки токена для опциональной аутентификации
    }

    next();

  } catch (error) {
    console.error('Ошибка в optionalAuth middleware:', error);
    next(); // Продолжаем даже в случае ошибки
  }
};

