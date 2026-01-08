const Poll = require('../models/Poll');
const Vote = require('../models/Vote');
const User = require('../models/User');
const gigachatService = require('../services/gigachatService');
const scheduleService = require('../services/scheduleService');

const DEFAULT_DEADLINE_HOURS = 24;

const buildTemplateQuestions = (pollType, context) => {
  switch (pollType) {
    case 'subject_feedback':
      return {
        title: `Оценка дисциплины: ${context.subject || 'Занятие'}`,
        description: `Лекция от ${context.dateLabel} | Тема: ${context.topic || '—'}`,
        is_anonymous: true,
        reward_points: 5,
        show_results: 'after_vote',
        minResponsesForResults: 0,
        questions: [
          {
            id: 1,
            text: 'Насколько актуальна изученная тема?',
            type: 'rating',
            scale: 5,
            labels: { min: 'Совсем не актуально', max: 'Очень актуально' },
            required: true
          },
          {
            id: 2,
            text: 'Насколько понятно объяснили материал?',
            type: 'rating',
            scale: 5,
            labels: { min: 'Непонятно', max: 'Очень понятно' },
            required: true
          },
          {
            id: 3,
            text: 'Планируете ли использовать эти знания на практике?',
            type: 'single_choice',
            options: [
              'Да, уже знаю где применю',
              'Скорее да',
              'Пока не уверен(а)',
              'Скорее нет',
              'Нет, не планирую'
            ],
            required: true
          },
          {
            id: 4,
            text: 'Что можно улучшить?',
            type: 'text',
            maxLength: 300,
            required: false
          }
        ]
      };
    case 'teacher_feedback':
      return {
        title: `Отзыв о занятии с ${context.teacher || 'преподавателем'}`,
        description: 'Анонимно • Результаты видны после 10 ответов',
        is_anonymous: true,
        reward_points: 10,
        show_results: 'after_vote',
        minResponsesForResults: 10,
        questions: [
          {
            id: 1,
            text: 'Понятность объяснений',
            type: 'rating',
            scale: 5,
            labels: { min: 'Непонятно', max: 'Очень понятно' },
            required: true
          },
          {
            id: 2,
            text: 'Вовлечённость и интерактивность',
            type: 'rating',
            scale: 5,
            labels: { min: 'Низкая', max: 'Высокая' },
            required: true
          },
          {
            id: 3,
            text: 'Отношение к студентам',
            type: 'rating',
            scale: 5,
            labels: { min: 'Плохое', max: 'Отличное' },
            required: true
          },
          {
            id: 4,
            text: 'Хотели бы продолжить обучение у этого преподавателя?',
            type: 'binary',
            options: ['Да', 'Нет'],
            required: true
          }
        ]
      };
    case 'class_organization':
      return {
        title: 'Оценка организации занятия',
        description: `${context.dateLabel} | Аудитория ${context.room || '—'}`,
        is_anonymous: false,
        reward_points: 3,
        show_results: 'immediate',
        minResponsesForResults: 0,
        questions: [
          {
            id: 1,
            text: 'Техническое оснащение (проектор, микрофоны, доска)',
            type: 'rating',
            scale: 5,
            labels: { min: 'Плохо', max: 'Отлично' },
            required: true
          },
          {
            id: 2,
            text: 'Комфорт в аудитории (температура, освещение, шум)',
            type: 'rating',
            scale: 5,
            labels: { min: 'Неудобно', max: 'Комфортно' },
            required: true
          },
          {
            id: 3,
            text: 'Были ли технические проблемы?',
            type: 'binary',
            options: ['Нет', 'Да'],
            required: true,
            followUp: {
              showIf: 'Да',
              question: {
                id: 31,
                text: 'Какие именно?',
                type: 'multiple_choice',
                options: [
                  'Не работал проектор',
                  'Плохой звук',
                  'Проблемы с Wi-Fi',
                  'Холодно/Жарко',
                  'Плохое освещение',
                  'Другое'
                ],
                required: false
              }
            }
          }
        ]
      };
    default:
      return {
        title: context.customTitle || 'Опрос',
        description: context.customDescription || '',
        is_anonymous: !!context.isAnonymous,
        reward_points: context.reward_points || 0,
        show_results: 'after_vote',
        minResponsesForResults: 0,
        questions: Array.isArray(context.questions) ? context.questions : []
      };
  }
};

const extractLessonContext = (lesson, fallbackGroup) => {
  if (!lesson) {
    return {};
  }

  const dateString = lesson.date || lesson.dateStart || lesson.lessonDate;
  const parsedDate = dateString ? new Date(dateString) : null;

  const timeStart = lesson.beginLesson || lesson.startTime || lesson.timeStart || lesson.time;
  const timeEnd = lesson.endLesson || lesson.endTime || lesson.timeEnd;
  const time = timeStart && timeEnd ? `${timeStart}-${timeEnd}` : (timeStart || timeEnd || null);

  return {
    lessonId: lesson.lessonOid || lesson.oid || lesson.id || lesson.lessonId || null,
    subject: lesson.discipline || lesson.subject || lesson.title || null,
    teacher: lesson.lecturer || lesson.lecturer_title || lesson.teacher || null,
    date: parsedDate,
    room: (Array.isArray(lesson.auditorium) ? lesson.auditorium.join(', ') : (lesson.auditorium || lesson.room || lesson.auditory || null)),
    topic: lesson.topic || lesson.theme || lesson.content || null,
    lessonType: lesson.kindOfWork || lesson.lessonType || null,
    time,
    groupId: lesson.group || lesson.groupOid || fallbackGroup || null,
    dateLabel: parsedDate ? parsedDate.toLocaleDateString('ru-RU') : (dateString || '')
  };
};

const resolveVisibility = (lessonContext, user, pollType, customScope = {}) => {
  // Прошедшая пара — по умолчанию видит группа пары
  if (customScope.visibilityScope === 'faculty') {
    return {
      visibility: 'faculty',
      target_faculties: [user.faculty].filter(Boolean),
      target_groups: [],
      target_courses: [],
      target_programs: []
    };
  }

  if (customScope.visibilityScope === 'course') {
    return {
      visibility: 'program',
      target_faculties: [],
      target_groups: [],
      target_courses: [user.course].filter(Boolean),
      target_programs: []
    };
  }

  if (customScope.visibilityScope === 'program') {
    return {
      visibility: 'program',
      target_faculties: [],
      target_groups: [],
      target_courses: [],
      target_programs: [user.program].filter(Boolean)
    };
  }

  // default group-only
  const groupId = lessonContext.groupId || user.group_id || user.group;
  return {
    visibility: 'group',
    target_faculties: [],
    target_groups: groupId ? [groupId.toString()] : [],
    target_courses: [],
    target_programs: []
  };
};

/**
 * Получить список опросов с фильтрацией и пагинацией
 * GET /api/polls?filter=all|active|completed|my-votes&page=1&limit=50
 */
exports.getPolls = async (req, res) => {
  try {
    const {
      filter = 'all',
      page = 1,
      limit = 50,
      group_id
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

    // Фильтр по целевой группе (для предметных опросов)
    if (group_id) {
      const gidNum = Number(group_id);
      if (!Number.isNaN(gidNum)) {
        query = {
          ...query,
          target_groups: gidNum
        };
      }
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
 * Быстрое создание опроса по паре
 * POST /api/polls/quick-lesson-poll
 */
exports.createQuickLessonPoll = async (req, res) => {
  try {
    const { lessonId, pollType, deadline, visibilityScope, custom } = req.body;

    if (!lessonId || !pollType) {
      return res.status(400).json({
        success: false,
        message: 'lessonId и pollType обязательны'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    // Загружаем расписание группы и ищем пару
    const range = scheduleService.getDefaultRange();
    const groupId = user.group_id || user.group;
    const schedule = groupId
      ? await scheduleService.getGroupSchedule(groupId, { ...range, lng: 1 })
      : [];

    const lesson = schedule.find((item) => {
      const possibleIds = [
        item.lessonOid,
        item.oid,
        item.id,
        item.lessonId,
        item.guid
      ].filter(Boolean);
      return possibleIds.map(String).includes(String(lessonId));
    });

    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Пара не найдена в расписании'
      });
    }

    const lessonContext = extractLessonContext(lesson, groupId);
    const now = new Date();

    // Определяем статус прошедшая/будущая пара
    const endDateString = lesson.date && (lesson.endLesson || lesson.endTime)
      ? `${lesson.date} ${lesson.endLesson || lesson.endTime}`
      : lesson.date;
    const endDate = endDateString ? new Date(endDateString) : now;
    const isCompletedLesson = endDate < now;

    // Базовые настройки
    const deadlineDate = deadline ? new Date(deadline) : new Date(now.getTime() + DEFAULT_DEADLINE_HOURS * 3600 * 1000);

    const template = buildTemplateQuestions(pollType, {
      ...lessonContext,
      customTitle: custom?.title,
      customDescription: custom?.description,
      questions: custom?.questions,
      isAnonymous: custom?.isAnonymous,
      reward_points: custom?.reward_points
    });

    const visibility = resolveVisibility(lessonContext, user, pollType, { visibilityScope });

    const pollData = {
      creator_id: req.user.userId,
      title: template.title,
      description: template.description,
      type: 'form',
      pollType,
      questions: template.questions,
      is_anonymous: template.is_anonymous,
      reward_points: template.reward_points,
      minResponsesForResults: template.minResponsesForResults || 0,
      show_results: template.show_results || 'after_vote',
      visibility: visibility.visibility,
      target_groups: visibility.target_groups,
      target_faculties: visibility.target_faculties,
      target_programs: visibility.target_programs,
      target_courses: visibility.target_courses,
      start_date: now,
      end_date: deadlineDate,
      status: 'active',
      lessonContext,
      subject_name: lessonContext.subject || null,
      teacher_name: lessonContext.teacher || null,
      lesson_date: lessonContext.date || null,
      lesson_time: lessonContext.time || null
    };

    // Если прошедшая пара — дедлайн фиксированный и видят только студенты группы
    if (isCompletedLesson) {
      pollData.visibility = 'group';
      pollData.target_groups = visibility.target_groups.length
        ? visibility.target_groups
        : groupId ? [groupId.toString()] : [];
      pollData.end_date = new Date(now.getTime() + DEFAULT_DEADLINE_HOURS * 3600 * 1000);
    }

    const poll = new Poll(pollData);
    await poll.save();

    res.status(201).json({
      success: true,
      message: 'Опрос создан',
      poll
    });
  } catch (error) {
    console.error('Ошибка createQuickLessonPoll:', error);
    res.status(500).json({
      success: false,
      message: 'Не удалось создать опрос'
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
      end_date,
      subject_id,
      subject_name,
      topic,
      teacher_name,
      target_groups,
      target_faculties,
      target_programs,
      target_courses,
      status,
      is_anonymous,
      show_results,
      max_choices
    } = req.body;

    // Валидация обязательных полей
    if (!title || !type || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'Заполните все обязательные поля'
      });
    }

    // Опросы с вопросами (form/topic/teacher/subject/organization/custom) допускаем по questions
    const isQuestionBased = type === 'form' || (Array.isArray(questions) && questions.length > 0);

    // Валидация для вопросных опросов
    if (isQuestionBased) {
      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Анкета должна содержать хотя бы один вопрос'
        });
      }
    } else {
      // Валидация для простых опросов с вариантами
      if (!options || !Array.isArray(options) || options.length < 2 || options.length > 20) {
        return res.status(400).json({
          success: false,
          message: 'Опрос должен иметь от 2 до 20 вариантов ответа'
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
      type: type || 'custom', // По умолчанию custom
      visibility: visibility || 'public',
      start_date: startDate,
      end_date: endDate,
      status: status || 'active',
      is_anonymous: is_anonymous !== undefined ? is_anonymous : false,
      show_results: show_results || 'immediate',
      max_choices: max_choices || null,
      // метаданные предмет/тема
      subject_id,
      subject_name,
      topic,
      teacher_name,
      // Таргетинг
      target_groups: Array.isArray(target_groups) ? target_groups.map(g => g.toString()) : [],
      target_faculties: Array.isArray(target_faculties) ? target_faculties : [],
      target_programs: Array.isArray(target_programs) ? target_programs : [],
      target_courses: Array.isArray(target_courses) ? target_courses : []
    };

    // Для обычных опросов с вариантами - форматирование options
    if (!isQuestionBased && options) {
      pollData.options = options.map((option, index) => ({
        text: option.text || option,
        votes: 0,
        voters: []
      }));
    }

    // Для опросов с вопросами - добавление questions
    if (isQuestionBased && questions) {
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

    // ========== ВОПРОСНЫЕ ОПРОСЫ (формы/шаблоны) ==========
    const isQuestionPoll = (poll.type === 'form' || type === 'form' || (poll.questions && poll.questions.length > 0));
    if (isQuestionPoll) {
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

      const incomingResponses = req.body.responses || answers;
      if (!incomingResponses || typeof incomingResponses !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Укажите ответы на вопросы'
        });
      }

      const questionsMap = new Map((poll.questions || []).map(q => [String(q.id), q]));

      const normalizeBinary = (val) => {
        if (typeof val === 'boolean') return val ? 'Да' : 'Нет';
        if (val === null || val === undefined) return null;
        const lower = String(val).trim().toLowerCase();
        if (['да', 'yes', 'true', '1', '👍'].includes(lower)) return 'Да';
        if (['нет', 'no', 'false', '0', '👎'].includes(lower)) return 'Нет';
        return null;
      };

      const answersObject = {};
      const structuredResponses = [];

      const validateAndAssign = (question, rawValue) => {
        let value = rawValue;
        switch (question.type) {
          case 'rating':
          case 'rating_1_5': {
            const scale = Number(question.scale) || 5;
            const num = Number(value);
            if (!Number.isInteger(num) || num < 1 || num > scale) {
              throw new Error(`Неверное значение рейтинга для вопроса "${question.text}"`);
            }
            value = num;
            break;
          }
          case 'single_choice':
          case 'multiple_choice_old': {
            if (!question.options || !question.options.includes(value)) {
              throw new Error(`Выберите вариант из списка для "${question.text}"`);
            }
            break;
          }
          case 'multiple_choice': {
            if (!Array.isArray(value) || value.length === 0) {
              if (question.required) throw new Error(`Ответьте на вопрос "${question.text}"`);
              value = [];
              break;
            }
            const invalid = value.filter(v => !question.options || !question.options.includes(v));
            if (invalid.length) {
              throw new Error(`Недопустимый вариант для "${question.text}"`);
            }
            break;
          }
          case 'binary':
          case 'yes_no': {
            value = normalizeBinary(value);
            if (!value) {
              throw new Error(`Ответьте Да/Нет для "${question.text}"`);
            }
            break;
          }
          case 'text':
          case 'text_long':
          case 'text_short': {
            if (value === undefined || value === null) {
              value = '';
            }
            value = String(value);
            if (question.maxLength && value.length > question.maxLength) {
              throw new Error(`Превышен лимит символов в "${question.text}"`);
            }
            break;
          }
          default:
            break;
        }

        answersObject[question.id] = value;
        structuredResponses.push({
          questionId: question.id,
          type: question.type,
          value
        });
      };

      // Если ответы пришли в виде массива объектов
      if (Array.isArray(incomingResponses)) {
        incomingResponses.forEach((resp) => {
          const question = questionsMap.get(String(resp.questionId));
          if (question) {
            validateAndAssign(question, resp.value);
            if (question.followUp && question.followUp.question) {
              const shouldShow = question.followUp.showIf;
              if (answersObject[question.id] === shouldShow && resp.followUpValue !== undefined) {
                validateAndAssign(question.followUp.question, resp.followUpValue);
              }
            }
          }
        });
      } else {
        // Объект вида { [id]: value }
        Object.entries(incomingResponses).forEach(([questionId, value]) => {
          const question = questionsMap.get(String(questionId));
          if (question) {
            validateAndAssign(question, value);
          }
        });
      }

      // Проверяем обязательные вопросы
      for (const q of poll.questions || []) {
        const hasAnswer = answersObject[q.id] !== undefined && answersObject[q.id] !== null && answersObject[q.id] !== '';
        if (q.required && !hasAnswer) {
          return res.status(400).json({
            success: false,
            message: `Пожалуйста, ответьте на обязательный вопрос: ${q.text}`
          });
        }
        if (q.followUp && q.followUp.question && answersObject[q.id] === q.followUp.showIf) {
          const follow = q.followUp.question;
          const followAnswered = answersObject[follow.id] !== undefined && answersObject[follow.id] !== null && answersObject[follow.id] !== '';
          if (follow.required && !followAnswered) {
            return res.status(400).json({
              success: false,
              message: `Пожалуйста, ответьте на дополнительный вопрос: ${follow.text}`
            });
          }
        }
      }

      // Получаем полные данные пользователя для метаданных
      const fullUser = await User.findById(req.user.userId);
      
      // Метаданные пользователя для срезов
      const userMetadata = {
        faculty: fullUser.faculty,
        faculty_name: fullUser.faculty_name || fullUser.faculty,
        program: fullUser.program,
        program_name: fullUser.program_name || fullUser.program,
        course: fullUser.course,
        group_id: fullUser.group_id ? fullUser.group_id.toString() : fullUser.group,
        group_name: fullUser.group_name || fullUser.group
      };

      // Сохраняем ответы
      if (!poll.responses) {
        poll.responses = [];
      }

      poll.responses.push({
        user_id: req.user.userId,
        answers: answersObject,
        raw_responses: structuredResponses,
        
        // Метаданные для аналитики
        user_faculty: userMetadata.faculty,
        user_faculty_name: userMetadata.faculty_name,
        user_program: userMetadata.program,
        user_program_name: userMetadata.program_name,
        user_course: userMetadata.course,
        user_group: userMetadata.group_id,
        user_group_name: userMetadata.group_name,
        
        submitted_at: new Date()
      });

      // ВАЖНО: Добавляем пользователя в voted_users для корректной работы фильтров
      if (!poll.voted_users) {
        poll.voted_users = [];
      }
      poll.voted_users.push(req.user.userId);

      // Обновляем total_votes
      poll.total_votes = poll.responses.length;

      await poll.save();
      
      // Начисляем баллы пользователю
      const reward = poll.reward_points || 0;
      if (reward > 0 && fullUser?.role === 'student') {
        await User.findByIdAndUpdate(req.user.userId, {
          $inc: { 'student_data.points': reward }
        });
      }
      
      // Обновляем кэш аналитики (асинхронно)
      setImmediate(() => {
        poll.updateAnalyticsCache().catch(err => {
          console.error('Error updating analytics cache:', err);
        });
      });

      return res.json({
        success: true,
        message: 'Ответы сохранены',
        points_earned: reward
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

    // Получаем полные данные пользователя для метаданных
    const fullUser = await User.findById(req.user.userId);
    
    // Метаданные пользователя для срезов (для новой системы)
    const userMetadata = {
      faculty: fullUser.faculty,
      faculty_name: fullUser.faculty_name || fullUser.faculty,
      program: fullUser.program,
      program_name: fullUser.program_name || fullUser.program,
      course: fullUser.course,
      group_id: fullUser.group_id ? fullUser.group_id.toString() : fullUser.group,
      group_name: fullUser.group_name || fullUser.group
    };
    
    // Обновление опроса с метаданными (новая система)
    const answersData = option_ids.length === 1 ? option_ids[0] : option_ids;
    await poll.addVote(req.user.userId, answersData, userMetadata);

    // Начисляем баллы пользователю
    const reward = poll.reward_points || 10;
    if (reward > 0 && fullUser?.role === 'student') {
      await User.findByIdAndUpdate(req.user.userId, {
        $inc: { 'student_data.points': reward }
      });
    }

    res.json({
      success: true,
      message: 'Голос учтен',
      points_earned: reward,
      poll: {
        total_votes: poll.total_votes,
        options: poll.options
      }
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

/**
 * Получить аналитику по опросу
 * GET /api/polls/:pollId/analytics
 */
exports.getPollAnalytics = async (req, res) => {
  try {
    const { pollId } = req.params;
    const analyticsService = require('../services/analyticsService');
    
    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({ success: false, message: 'Опрос не найден' });
    }
    
    // Проверка прав (только создатель или админ может видеть аналитику)
    if (req.user && poll.creator_id.toString() !== req.user.userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Нет доступа' });
    }
    
    const result = await analyticsService.analyzePollResults(pollId);
    
    res.json({
      success: true,
      analytics: result
    });
  } catch (error) {
    console.error('Error getting poll analytics:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

