const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');

// Публичные роуты (без аутентификации)

/**
 * @route   POST /api/auth/request-code
 * @desc    Запрос кода подтверждения
 * @access  Public
 */
router.post('/request-code', authController.requestCode);

/**
 * @route   POST /api/auth/verify-code
 * @desc    Проверка кода подтверждения
 * @access  Public
 */
router.post('/verify-code', authController.verifyCode);

/**
 * @route   POST /api/auth/register
 * @desc    Регистрация нового пользователя
 * @access  Public (требует tempToken)
 */
router.post('/register', authController.register);

/**
 * @route   GET /api/auth/constants
 * @desc    Получить константы (факультеты, кафедры, группы)
 * @access  Public
 */
router.get('/constants', authController.getConstants);

// Защищенные роуты (требуют аутентификации)

/**
 * @route   GET /api/auth/me
 * @desc    Получить данные текущего пользователя
 * @access  Private
 */
router.get('/me', authenticate, authController.getMe);

module.exports = router;

