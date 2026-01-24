// backend/src/routes/pollRoutes.js
// ОБНОВЛЕНИЕ РОУТОВ - добавляем унифицированный endpoint для голосования

const express = require('express');
const router = express.Router();
const pollController = require('../controllers/pollController');
const { authenticate } = require('../middleware/auth');

// ==================== ПУБЛИЧНЫЕ РОУТЫ ====================

// Получить список опросов с фильтрацией
router.get('/', authenticate, pollController.getPolls);

// Получить счётчики опросов
router.get('/counts', authenticate, pollController.getPollsCounts);

// ==================== СОЗДАНИЕ ОПРОСОВ ====================

// Быстрое создание опроса по паре
router.post('/quick-lesson-poll', authenticate, pollController.createQuickLessonPoll);

// Создать кастомный опрос (старая система)
router.post('/', authenticate, pollController.createPoll);

// Создать новый опрос (lesson_review или custom)
router.post('/new', authenticate, pollController.createNewPoll);

// ==================== МОИ ОПРОСЫ ====================
// ВАЖНО: специфичные роуты должны быть ПЕРЕД /:id и /:pollId

// Получить опросы созданные текущим пользователем
router.get('/my/created', authenticate, pollController.getMyPolls);

// ==================== ГОЛОСОВАНИЕ ====================

// Получить историю голосований
router.get('/votes/my', authenticate, pollController.getMyVotes);

// Старый endpoint для обратной совместимости
router.post('/votes', authenticate, pollController.vote);

// ==================== AI ГЕНЕРАЦИЯ ====================

// Генерация опроса с AI
router.post('/generate-ai', authenticate, pollController.generateWithAI);

// Генерация анкеты с AI
router.post('/generate-form-ai', authenticate, pollController.generateFormWithAI);

// ==================== ГОЛОСОВАНИЕ В ОПРОСЕ ====================
// Эти роуты должны быть ПЕРЕД /:id и /:pollId

// НОВЫЙ УНИФИЦИРОВАННЫЙ ENDPOINT (основной)
// Обрабатывает:
// - lesson_review с Q1-Q5
// - custom опросы
// - обычные опросы
router.post('/:pollId/vote', authenticate, pollController.submitVote);

// Алиас для совместимости (используется компонентом NewPollVote)
router.post('/:id/vote-new', authenticate, pollController.submitVote);

// ==================== АНАЛИТИКА ====================

// Персональная аналитика после голосования
router.get('/:pollId/my-feedback-summary', authenticate, pollController.getMyFeedbackSummary);

// Получить аналитику опроса
router.get('/:pollId/analytics', authenticate, pollController.getPollAnalytics);

// Анализ с помощью AI
router.get('/:id/analyze', authenticate, pollController.analyzeResults);

// ==================== ДЕТАЛИ ОПРОСА ====================
// Должен быть В САМОМ КОНЦЕ (чтобы не перехватывать специфичные роуты)

// Получить детали опроса
router.get('/:id', authenticate, pollController.getPollById);

module.exports = router;
