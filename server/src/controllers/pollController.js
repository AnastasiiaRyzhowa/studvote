const Poll = require('../models/Poll');
const Vote = require('../models/Vote');
const User = require('../models/User');
const gigachatService = require('../services/gigachatService');

/**
 * Получить список опросов с фильтрацией и пагинацией
 * GET /api/polls?filter=all|active|completed|my-votes&page=1&limit=50
 */
exports.getPolls = async (req, res) => {
  try {
    const {
      filter = 'all',
      page = 1,
      limit = 50
    } = req.query;

    const userId = req.user?.userId;
    const now = new Date();

    // Построение базового фильтра
    let query = {};
    
    // Применяем фильтр
    switch(filter) {
      case 'active':
        // Активные опросы: status=active, дедлайн не прошел, пользователь НЕ голосовал
        query = {
          status: 'active',
          end_date: { $gt: now },
          ...(userId ? { voted_users: { $ne: userId } } : {})
        };
        break;
        
      case 'completed':
        // Завершенные: дедлайн прошел ИЛИ status=completed
        query = {
          $or: [
            { end_date: { $lt: now } },
            { status: 'completed' }
          ]
        };
        break;
        
      case 'my-votes':
        // Мои голоса: пользователь проголосовал
        if (userId) {
          query = {
            voted_users: userId
          };
        } else {
          // Если не авторизован, возвращаем пустой результат
          return res.json({
            success: true,
            polls: [],
            filter,
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0
            }
          });
        }
        break;
        
      default: // 'all'
        // Все опросы без фильтров
        query = {};
        break;
    }

    // Пагинация
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Запрос опросов
    const polls = await Poll.find(query)
      .populate('creator_id', 'full_name email role')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Подсчет общего количества
    const total = await Poll.countDocuments(query);

    // Для каждого опроса добавляем информацию о голосовании текущего пользователя
    const pollsWithVoteInfo = polls.map(poll => ({
      ...poll,
      has_voted: userId ? poll.voted_users.some(
        id => id.toString() === userId.toString()
      ) : false
    }));

    res.json({
      success: true,
      polls: pollsWithVoteInfo,
      filter,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Ошибка в getPolls:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении списка опросов'
    });
  }
};

/**
 * Получить количество опросов по каждому фильтру
 * GET /api/polls/counts
 */
exports.getPollsCounts = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const now = new Date();

    // Базовый query (пустой, т.к. нет visibility restrictions в текущей реализации)
    const baseQuery = {};

    // Подсчет для каждого фильтра
    const counts = {
      all: await Poll.countDocuments(baseQuery),
      
      active: await Poll.countDocuments({
        ...baseQuery,
        status: 'active',
        end_date: { $gt: now },
        ...(userId ? { voted_users: { $ne: userId } } : {})
      }),
      
      completed: await Poll.countDocuments({
        ...baseQuery,
        $or: [
          { end_date: { $lt: now } },
          { status: 'completed' }
        ]
      }),
      
      myVotes: userId ? await Poll.countDocuments({
        ...baseQuery,
        voted_users: userId
      }) : 0
    };

    res.json({
      success: true,
      counts
    });

  } catch (error) {
    console.error('Ошибка в getPollsCounts:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при подсчете опросов'
    });
  }
};

/**
 * Получить детальную информацию об опросе
 * GET /api/polls/:id
 */
exports.getPollById = async (req, res) => {
  try {
    const { id } = req.params;

    // Поиск опроса
    const poll = await Poll.findById(id)
      .populate('creator_id', 'full_name email role faculty group department');

    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Опрос не найден'
      });
    }

    // Проверяем, голосовал ли текущий пользователь
    let hasVoted = false;
    let userVote = null;

    if (req.user) {
      hasVoted = poll.voted_users.some(
        id => id.toString() === req.user.userId.toString()
      );

      if (hasVoted) {
        userVote = await Vote.getUserVote(req.user.userId, poll._id);
      }
    }

    // Получаем статистику
    const stats = await Vote.getPollStatistics(poll._id);

    res.json({
      success: true,
      poll: {
        ...poll.toObject(),
        has_voted: hasVoted,
        user_vote: userVote,
        is_active: poll.isActive(),
        participants_count: poll.participants_count
      },
      statistics: stats
    });

  } catch (error) {
    console.error('Ошибка в getPollById:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении опроса'
    });
  }
};

/**
 * Создать новый опрос
 * POST /api/polls
 */
exports.createPoll = async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      visibility,
      options,
      questions,
      start_date,
      end_date
    } = req.body;

    // Валидация обязательных полей
    if (!title || !type || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'Заполните все обязательные поля'
      });
    }

    // Валидация для обычных опросов
    if (type !== 'form') {
      if (!options || !Array.isArray(options) || options.length < 2 || options.length > 20) {
        return res.status(400).json({
          success: false,
          message: 'Опрос должен иметь от 2 до 20 вариантов ответа'
        });
      }
    }

    // Валидация для форм
    if (type === 'form') {
      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Анкета должна содержать хотя бы один вопрос'
        });
      }
    }

    // Валидация дат
    const startDate = start_date ? new Date(start_date) : new Date();
    const endDate = new Date(end_date);

    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: 'Дата окончания должна быть позже даты начала'
      });
    }

    // Подготовка данных для создания
    const pollData = {
      creator_id: req.user.userId,
      title: title.trim(),
      description: description ? description.trim() : undefined,
      type,
      visibility: visibility || 'public',
      start_date: startDate,
      end_date: endDate,
      status: 'active'
    };

    // Для обычных опросов - форматирование вариантов
    if (type !== 'form' && options) {
      pollData.options = options.map((option, index) => ({
        text: option.text || option,
        votes: 0,
        percentage: 0,
        order: index
      }));
    }

    // Для форм - добавление вопросов
    if (type === 'form' && questions) {
      pollData.questions = questions;
    }

    // Создание опроса
    const poll = new Poll(pollData);

    await poll.save();

    // Популяция создателя
    await poll.populate('creator_id', 'full_name email role');

    res.status(201).json({
      success: true,
      message: 'Опрос успешно создан',
      poll
    });

  } catch (error) {
    console.error('❌ ОШИБКА СОЗДАНИЯ ОПРОСА:');
    console.error('Тип ошибки:', error.name);
    console.error('Сообщение:', error.message);
    console.error('Детали:', error);
    
    // Если это ошибка валидации Mongoose
    if (error.name === 'ValidationError') {
      console.error('Ошибки валидации:', error.errors);
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: Object.keys(error.errors).map(key => ({
          field: key,
          message: error.errors[key].message
        }))
      });
    }

    res.status(500).json({
      success: false,
      message: 'Ошибка при создании опроса'
    });
  }
};

/**
 * Получить опросы созданные текущим пользователем
 * GET /api/polls/my/created
 */
exports.getMyPolls = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Поиск опросов пользователя
    const polls = await Poll.find({ creator_id: req.user.userId })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Подсчет общего количества
    const total = await Poll.countDocuments({ creator_id: req.user.userId });

    res.json({
      success: true,
      polls,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Ошибка в getMyPolls:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении ваших опросов'
    });
  }
};

/**
 * Проголосовать в опросе или заполнить форму
 * POST /api/votes
 */
exports.vote = async (req, res) => {
  try {
    const { poll_id, option_ids, answers, type } = req.body;

    // Валидация базовых данных
    if (!poll_id) {
      return res.status(400).json({
        success: false,
        message: 'Укажите опрос'
      });
    }

    // Поиск опроса
    const poll = await Poll.findById(poll_id);

    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Опрос не найден'
      });
    }

    // Проверка дедлайна
    if (new Date(poll.end_date) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Опрос завершен'
      });
    }

    // Проверка, активен ли опрос
    if (!poll.isActive()) {
      return res.status(400).json({
        success: false,
        message: 'Опрос неактивен или завершен'
      });
    }

    // ========== ФОРМА - новая логика ==========
    if (poll.type === 'form' || type === 'form') {
      // Проверка: уже голосовал?
      const existingResponse = poll.responses?.find(
        r => r.user_id.toString() === req.user.userId.toString()
      );

      if (existingResponse) {
        return res.status(400).json({
          success: false,
          message: 'Вы уже заполнили эту анкету'
        });
      }

      // Валидация ответов
      if (!answers || typeof answers !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Укажите ответы на вопросы'
        });
      }

      console.log('📝 ОТЛАДКА СОХРАНЕНИЯ ОТВЕТОВ:');
      console.log('Полученные answers:', answers);
      console.log('Тип answers:', typeof answers);
      console.log('Ключи answers:', Object.keys(answers));
      console.log('JSON.stringify:', JSON.stringify(answers));

      // Сохраняем ответы
      if (!poll.responses) {
        poll.responses = [];
      }

      // ВАЖНО: Преобразуем answers в обычный объект, чтобы Mongoose правильно сохранил
      const answersObject = { ...answers };
      
      console.log('Преобразованный answersObject:', answersObject);
      console.log('Ключи answersObject:', Object.keys(answersObject));

      poll.responses.push({
        user_id: req.user.userId,
        answers: answersObject,
        created_at: new Date()
      });

      // ВАЖНО: Добавляем пользователя в voted_users для корректной работы фильтров
      if (!poll.voted_users) {
        poll.voted_users = [];
      }
      poll.voted_users.push(req.user.userId);

      // Обновляем total_votes
      poll.total_votes = poll.responses.length;

      await poll.save();
      
      console.log('✅ Опрос сохранен');
      console.log('Последний ответ после сохранения:', poll.responses[poll.responses.length - 1]);
      console.log('Answers в последнем ответе:', poll.responses[poll.responses.length - 1]?.answers);

      // Начисляем баллы пользователю
      await User.findByIdAndUpdate(req.user.userId, {
        $inc: { points: 10 }
      });

      return res.json({
        success: true,
        message: 'Ответы сохранены',
        points_earned: 10
      });
    }

    // ========== ОБЫЧНЫЙ ОПРОС - существующая логика ==========
    
    // Валидация входных данных для обычного опроса
    if (!option_ids || !Array.isArray(option_ids) || option_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Укажите выбранные варианты'
      });
    }

    // Проверка, может ли пользователь голосовать
    if (!poll.canVote(req.user.userId)) {
      return res.status(400).json({
        success: false,
        message: 'Вы уже проголосовали в этом опросе'
      });
    }

    // Валидация индексов вариантов
    const invalidIndices = option_ids.filter(
      index => index < 0 || index >= poll.options.length
    );

    if (invalidIndices.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Недопустимые варианты ответа'
      });
    }

    // Проверка типа опроса
    if (poll.type === 'single' && option_ids.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Для этого опроса можно выбрать только один вариант'
      });
    }

    // Создание голоса
    const vote = new Vote({
      user_id: req.user.userId,
      poll_id: poll_id,
      option_ids: option_ids,
      points_earned: 10 // Базовые баллы за участие
    });

    await vote.save();

    // Обновление опроса
    await poll.addVote(req.user.userId, option_ids);

    // Начисляем баллы пользователю
    await User.findByIdAndUpdate(req.user.userId, {
      $inc: { points: 10 }
    });

    // Получение обновленной статистики
    const stats = await Vote.getPollStatistics(poll_id);

    res.json({
      success: true,
      message: 'Голос учтен',
      vote,
      points_earned: vote.points_earned,
      poll: {
        total_votes: poll.total_votes,
        options: poll.options
      },
      statistics: stats
    });

  } catch (error) {
    console.error('❌ ОШИБКА ГОЛОСОВАНИЯ:');
    console.error('Тип ошибки:', error.name);
    console.error('Сообщение:', error.message);
    console.error('Детали:', error);

    // Обработка ошибки повторного голосования
    if (error.code === 'DUPLICATE_VOTE' || error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Вы уже проголосовали в этом опросе'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Ошибка при голосовании'
    });
  }
};

/**
 * Получить историю голосований текущего пользователя
 * GET /api/votes/my
 */
exports.getMyVotes = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Получение голосов пользователя
    const votes = await Vote.getUserVotes(req.user.userId, {
      limit: limitNum,
      skip: skip,
      sort: { voted_at: -1 }
    });

    // Подсчет общего количества
    const total = await Vote.countDocuments({ user_id: req.user.userId });

    // Подсчет заработанных баллов
    const totalPoints = await Vote.aggregate([
      { $match: { user_id: req.user.userId } },
      { $group: { _id: null, total: { $sum: '$points_earned' } } }
    ]);

    res.json({
      success: true,
      votes,
      statistics: {
        total_votes: total,
        total_points_earned: totalPoints.length > 0 ? totalPoints[0].total : 0
      },
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Ошибка в getMyVotes:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении истории голосований'
    });
  }
};

/**
 * Генерация опроса с помощью AI
 * POST /api/polls/generate-ai
 */
exports.generateWithAI = async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'Промпт обязателен'
      });
    }
    
    // Генерируем опрос с помощью GigaChat
    const pollData = await gigachatService.generatePoll(prompt);
    
    if (!pollData) {
      return res.status(500).json({
        success: false,
        message: 'Не удалось сгенерировать опрос. Проверьте настройки GigaChat API.'
      });
    }
    
    res.json({
      success: true,
      poll: pollData
    });
    
  } catch (error) {
    console.error('Ошибка генерации с AI:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера при генерации опроса'
    });
  }
};

/**
 * Генерация анкеты (формы) с помощью AI
 * POST /api/polls/generate-form-ai
 */
exports.generateFormWithAI = async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'Промпт обязателен'
      });
    }
    
    // Генерируем анкету с помощью GigaChat
    const formData = await gigachatService.generateForm(prompt);
    
    if (!formData) {
      return res.status(500).json({
        success: false,
        message: 'Не удалось сгенерировать анкету. Проверьте настройки GigaChat API.'
      });
    }
    
    res.json({
      success: true,
      form: formData
    });
    
  } catch (error) {
    console.error('Ошибка генерации анкеты с AI:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера при генерации анкеты'
    });
  }
};

/**
 * Анализ результатов опроса с помощью AI
 * GET /api/polls/:id/analyze
 */
exports.analyzeResults = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Получаем опрос с результатами
    const poll = await Poll.findById(id)
      .populate('creator_id', 'full_name')
      .lean();
    
    if (!poll) {
      return res.status(404).json({ 
        success: false, 
        message: 'Опрос не найден' 
      });
    }
    
    // Формируем данные для анализа
    const pollData = {
      title: poll.title,
      description: poll.description,
      totalVotes: poll.total_votes,
      type: poll.type,
      options: poll.options.map(opt => ({
        text: opt.text,
        votes: opt.votes,
        percentage: poll.total_votes > 0 ? Math.round((opt.votes / poll.total_votes) * 100) : 0
      }))
    };
    
    // Формируем промпт для AI
    const prompt = `
Проанализируй результаты опроса и дай краткий профессиональный анализ.

Название опроса: ${pollData.title}
Описание: ${pollData.description || 'Не указано'}
Тип: ${pollData.type === 'single' ? 'Один вариант ответа' : pollData.type === 'multiple' ? 'Несколько вариантов' : 'Рейтинг'}
Всего проголосовало: ${pollData.totalVotes}

Результаты:
${pollData.options.map((opt, i) => `${i + 1}. "${opt.text}" - ${opt.votes} голосов (${opt.percentage}%)`).join('\n')}

Дай анализ в следующем формате (без лишнего текста, только суть):

1. ЛИДЕР: Кто победил и насколько убедительно (1-2 предложения)
2. АКТИВНОСТЬ: Оценка активности участников (1-2 предложения)
3. ИНСАЙТ: Главный вывод или рекомендация (1-2 предложения)

Пиши профессионально, по-русски, без лишних слов.
`;
    
    // Вызываем GigaChat
    const analysis = await gigachatService.sendChatRequest(prompt, 0.7);
    
    if (!analysis) {
      return res.status(500).json({ 
        success: false, 
        message: 'Не удалось получить анализ от AI' 
      });
    }
    
    res.json({
      success: true,
      analysis: analysis
    });
    
  } catch (error) {
    console.error('Ошибка анализа результатов:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка при анализе результатов' 
    });
  }
};

