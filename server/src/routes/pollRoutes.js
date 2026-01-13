const express = require('express');
const router = express.Router();
const pollController = require('../controllers/pollController');
const { authenticate } = require('../middleware/auth');

/**
 * Публичные роуты (без аутентификации)
 */

/**
 * @route   GET /api/polls
 * @desc    Получить список опросов с фильтрацией
 * @query   status, visibility, page, limit
 * @access  Private (требует аутентификации)
 */
router.get('/', authenticate, pollController.getPolls);

/**
 * Защищенные роуты (требуют аутентификации)
 * ВАЖНО: Специфичные роуты должны быть ПЕРЕД общими (/:id)
 */

/**
 * @route   POST /api/polls
 * @desc    Создать новый опрос
 * @body    title, description, type, visibility, options[], start_date, end_date
 * @access  Private (authenticated users)
 */
router.post('/quick-lesson-poll', authenticate, pollController.createQuickLessonPoll);
router.post('/', authenticate, pollController.createPoll);

/**
 * @route   GET /api/polls/counts
 * @desc    Получить количество опросов по каждому фильтру
 * @access  Private (требует аутентификации)
 */
router.get('/counts', authenticate, pollController.getPollsCounts);

/**
 * @route   GET /api/polls/my/created
 * @desc    Получить опросы созданные текущим пользователем
 * @access  Private (authenticated users)
 */
router.get('/my/created', authenticate, pollController.getMyPolls);

/**
 * @route   POST /api/polls/generate-ai
 * @desc    Генерация опроса с помощью AI
 * @body    prompt
 * @access  Private (authenticated users)
 */
router.post('/generate-ai', authenticate, pollController.generateWithAI);

/**
 * @route   POST /api/polls/generate-form-ai
 * @desc    Генерация анкеты (формы) с помощью AI
 * @body    prompt
 * @access  Private (authenticated users)
 */
router.post('/generate-form-ai', authenticate, pollController.generateFormWithAI);

/**
 * @route   POST /api/polls/votes
 * @desc    Проголосовать в опросе
 * @body    poll_id, option_ids[]
 * @access  Private (authenticated users)
 */
router.post('/votes', authenticate, pollController.vote);

/**
 * @route   GET /api/polls/votes/my
 * @desc    Получить историю голосований текущего пользователя
 * @access  Private (authenticated users)
 */
router.get('/votes/my', authenticate, pollController.getMyVotes);

/**
 * @route   GET /api/polls/:id/analyze
 * @desc    Анализ результатов опроса с помощью AI
 * @access  Private (authenticated users)
 */
router.get('/:id/analyze', authenticate, pollController.analyzeResults);

/**
 * @route   GET /api/polls/:pollId/analytics
 * @desc    Получить аналитику по опросу (срезы по факультетам, программам, курсам)
 * @access  Private (authenticated users - только создатель или админ)
 */
router.get('/:pollId/analytics', authenticate, pollController.getPollAnalytics);

/**
 * @route   GET /api/polls/:pollId/my-feedback-summary
 * @desc    Получить персональную аналитику после голосования (сравнение с группой + AI инсайты)
 * @access  Private (authenticated users - только студенты)
 */
router.get('/:pollId/my-feedback-summary', authenticate, pollController.getMyFeedbackSummary);

/**
 * @route   GET /api/polls/:id
 * @desc    Получить детальную информацию об опросе
 * @access  Public
 */
router.get('/:id', pollController.getPollById);

module.exports = router;

