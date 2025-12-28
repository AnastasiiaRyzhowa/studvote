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
 * @access  Public
 */
router.get('/', pollController.getPolls);

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
router.post('/', authenticate, pollController.createPoll);

/**
 * @route   GET /api/polls/counts
 * @desc    Получить количество опросов по каждому фильтру
 * @access  Public (но учитывает аутентификацию если есть)
 */
router.get('/counts', pollController.getPollsCounts);

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
 * @route   GET /api/polls/:id
 * @desc    Получить детальную информацию об опросе
 * @access  Public
 */
router.get('/:id', pollController.getPollById);

module.exports = router;

