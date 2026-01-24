const Poll = require('../models/Poll');
const Vote = require('../models/Vote');
const User = require('../models/User');
const gigachatService = require('../services/gigachatService');
const scheduleService = require('../services/scheduleService');
const { buildVoteAnalytics } = require('../services/voteAnalyticsService');

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
            type: 'text_long',
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
            text: 'Связь теории с практикой',
            type: 'rating',
            scale: 5,
            labels: { min: 'Нет связи', max: 'Отличная связь' },
            required: true
          },
          {
            id: 5,
            text: 'Хотели бы продолжить обучение у этого преподавателя?',
            type: 'single_choice',
            options: [
              'Да, определённо',
              'Скорее да',
              'Не знаю',
              'Скорее нет',
              'Нет'
            ],
            required: true
          },
          {
            id: 6,
            text: 'Комментарий (необязательно)',
            type: 'text_long',
            maxLength: 300,
            required: false
          }
        ]
      };
    case 'class_organization':
      return {
        title: `Оценка занятия: ${context.subject || 'Занятие'}`,
        description: `${context.teacher || ''} | ${context.dateLabel || ''} | ${context.room || ''}`,
        is_anonymous: true,
        reward_points: 5,
        show_results: 'after_vote',
        minResponsesForResults: 0,
        questions: [
          {
            id: 1,
            text: 'Насколько актуальна тема для твоей будущей работы?',
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
            text: 'Достаточно ли практики/примеров?',
            type: 'rating',
            scale: 5,
            labels: { min: 'Очень мало', max: 'Достаточно' },
            required: true
          },
          {
            id: 4,
            text: 'Насколько преподаватель смог заинтересовать и вовлечь?',
            type: 'rating',
            scale: 5,
            labels: { min: 'Совсем не вовлек', max: 'Очень вовлек' },
            required: true
          },
          {
            id: 5,
            text: 'Как оцениваешь организацию пары (структура, темп)?',
            type: 'rating',
            scale: 5,
            labels: { min: 'Плохо', max: 'Отлично' },
            required: true
          },
          {
            id: 6,
            text: 'Что понравилось? Что улучшить?',
            type: 'text_long',
            maxLength: 500,
            required: false
          },
          {
            id: 7,
            text: 'Были проблемы с техникой/аудиторией',
            type: 'binary',
            options: ['Да', 'Нет'],
            required: false,
            followUp: {
              condition: {
                type: 'equals',
                value: 'Да'
              },
              question: {
                id: 71,
                text: 'Какие проблемы были?',
                type: 'multiple_choice',
                options: [
                  'Проблемы с техникой',
                  'Проблемы с аудиторией',
                  'Другое'
                ],
                allowOther: true,
                required: false
              }
            }
          }
        ]
      };
    case 'lesson_review':
      return {
        title: `${context.subject || 'Занятие'} - ${context.topic || 'Занятие'}`,
        description: `${context.teacher || ''} | ${context.dateLabel || ''} | ${context.room || ''}`,
        is_anonymous: false,
        reward_points: 5,
        show_results: 'after_vote',
        minResponsesForResults: 0,
        questions: [
          {
            id: 1,
            text: 'Насколько актуальна тема для твоей будущей работы?',
            type: 'rating',
            scale: 5,
            labels: { min: 'Неактуально', max: 'Очень актуально' },
            required: true,
            weight: 0.25,
            block: 'content'
          },
          {
            id: 2,
            text: 'Насколько понятно объяснили материал?',
            type: 'rating',
            scale: 5,
            labels: { min: 'Непонятно', max: 'Очень понятно' },
            required: true,
            weight: 0.30,
            block: 'content'
          },
          {
            id: 3,
            text: 'Достаточно ли практики/примеров?',
            type: 'rating',
            scale: 5,
            labels: { min: 'Мало', max: 'Достаточно' },
            required: true,
            weight: 0.20,
            block: 'content'
          },
          {
            id: 4,
            text: 'Насколько преподаватель смог заинтересовать и вовлечь?',
            type: 'rating',
            scale: 5,
            labels: { min: 'Совсем не вовлекал', max: 'Очень вовлекал' },
            required: true,
            weight: 0.15,
            block: 'methodology'
          },
          {
            id: 5,
            text: 'Как оцениваешь организацию пары (структура, темп)?',
            type: 'rating',
            scale: 5,
            labels: { min: 'Плохо', max: 'Отлично' },
            required: true,
            weight: 0.10,
            block: 'methodology'
          },
          {
            id: 6,
            text: 'Что понравилось? Что улучшить?',
            type: 'text_long',
            maxLength: 500,
            required: false,
            block: 'other'
          },
          {
            id: 7,
            text: 'Были проблемы с техникой/аудиторией',
            type: 'binary',
            options: ['Да', 'Нет'],
            required: false,
            followUp: {
              condition: {
                type: 'equals',
                value: 'Да'
              },
              question: {
                id: 71,
                text: 'Какие проблемы были?',
                type: 'multiple_choice',
                options: [
                  'Проблемы с техникой',
                  'Проблемы с аудиторией',
                  'Другое'
                ],
                allowOther: true,
                required: false
              }
            }
          }
        ]
      };
    case 'teacher_lesson_review':
      return {
        title: `Оценка занятия | ${context.dateLabel || ''} | ${context.group || context.groupId || 'Группа'} | ${context.subject || ''}`.trim(),
        description: 'Оценка прошедшей пары преподавателем',
        is_anonymous: false,
        reward_points: 0,
        show_results: 'after_vote',
        minResponsesForResults: 0,
        questions: [
          {
            id: 1,
            text: 'Посещаемость: сколько студентов присутствовало (из 25)?',
            type: 'text_short',
            maxLength: 20,
            required: true
          },
          {
            id: 2,
            text: 'Активность группы на занятии',
            type: 'rating',
            scale: 5,
            labels: { min: 'Низкая', max: 'Высокая' },
            required: true
          },
          {
            id: 3,
            text: 'Качество выполнения заданий',
            type: 'rating',
            scale: 5,
            labels: { min: 'Плохое', max: 'Отличное' },
            required: true
          },
          {
            id: 4,
            text: 'Изменить рейтинг надёжности группы?',
            type: 'single_choice',
            options: [
              'Повысить (+5 баллов) - группа работала отлично',
              'Оставить без изменений',
              'Понизить (-5 баллов) - низкая посещаемость/активность',
              'Значительно понизить (-10 баллов) - серьёзные проблемы'
            ],
            required: true,
            followUp: {
              condition: {
                type: 'not_equals',
                value: 'Оставить без изменений'
              },
              question: {
                id: 5,
                text: 'Обоснование изменения рейтинга (обязательно при понижении)',
                type: 'text_long',
                maxLength: 200,
                required: false
              }
            }
          },
          {
            id: 6,
            text: 'Ссылка на фото-доказательство (опционально)',
            type: 'text_short',
            maxLength: 200,
            required: false
          },
          {
            id: 7,
            text: 'Комментарий о занятии (необязательно)',
            type: 'text_long',
            maxLength: 300,
            required: false
          }
        ]
      };
    case 'teacher_future_preferences':
      return {
        title: `Опрос к занятию | ${context.dateLabel || ''} | ${context.group || context.groupId || 'Группа'} | ${context.subject || ''}`.trim(),
        description: 'Собираем пожелания студентов к следующей паре',
        is_anonymous: true,
        reward_points: 3,
        show_results: 'after_vote',
        minResponsesForResults: 0,
        questions: [
          {
            id: 1,
            text: 'Какие темы вы хотите увидеть на следующей лекции?',
            type: 'text_long',
            maxLength: 300,
            required: false
          },
          {
            id: 2,
            text: 'Предпочтительный формат занятия (лекция, практика, воркшоп, Q&A и др.)',
            type: 'text_long',
            maxLength: 300,
            required: false
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
    group: lesson.group || lesson.group_name || lesson.stream || null,
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
      group_id,
      showAll
    } = req.query;

    const userId = req.user?.userId;
    const currentUser = userId ? await User.findById(userId).lean() : null;
    const now = new Date(); // Текущая дата для фильтрации

    // Построение базового фильтра
    let query = {};
    let roleScope = [];
    
    // Базовое исключение удалённых и черновиков
    query.status = { $nin: ['deleted', 'draft'] };
    
    // Для студентов исключаем teacher-опросы
    if (req.user?.role === 'student') {
      query.pollType = { $nin: ['teacher_lesson_review', 'teacher_future_preferences'] };
    }
    
    // Применяем фильтр
    switch(filter) {
      case 'active':
        // Активные опросы: пользователь НЕ голосовал И дедлайн не прошел
        query = {
          ...query, // сохраняем базовый фильтр (status $nin, pollType)
          status: 'active',
          end_date: { $gt: now },
          ...(userId ? { voted_users: { $ne: userId } } : {})
        };
        // Для активных опросов ограничиваем видимость в зависимости от роли
        if (req.user?.role === 'student' && !showAll) {
          const g = currentUser?.group;
          const gid = currentUser?.group_id;
          const faculty = currentUser?.faculty;
          const program = currentUser?.program;
          const course = currentUser?.course;
          
          const visibilityOr = [
            // Публичные опросы (без таргетинга) - все массивы пустые
            {
              $and: [
                { $or: [{ target_groups: { $exists: false } }, { target_groups: { $size: 0 } }] },
                { $or: [{ target_faculties: { $exists: false } }, { target_faculties: { $size: 0 } }] },
                { $or: [{ target_programs: { $exists: false } }, { target_programs: { $size: 0 } }] },
                { $or: [{ target_courses: { $exists: false } }, { target_courses: { $size: 0 } }] }
              ]
            }
          ];
          
          // Опросы для группы студента
          if (g || gid) {
            const groupConditions = [
              g ? { target_groups: g } : null,
              gid ? { target_groups: gid } : null,
              gid ? { target_groups: String(gid) } : null,
              g ? { 'lessonContext.group': g } : null,
              (g || gid) ? { 'lessonContext.groupId': (g || gid).toString() } : null
            ].filter(Boolean);
            
            if (groupConditions.length) {
              visibilityOr.push(...groupConditions);
            }
          }
          
          // Опросы для факультета студента
          if (faculty) {
            visibilityOr.push({ target_faculties: faculty });
          }
          
          // Опросы для программы студента
          if (program) {
            visibilityOr.push({ target_programs: program });
          }
          
          // Опросы для курса студента
          if (course) {
            visibilityOr.push({ target_courses: course });
          }
          
          roleScope.push({ $or: visibilityOr });
        }
        
        // Для преподавателей показываем только опросы о них
        if (req.user?.role === 'teacher' && currentUser?.full_name) {
          const teacherName = currentUser.full_name;
          roleScope.push({
            $or: [
              { teacher_name: teacherName },
              { 'lessonContext.teacher': teacherName },
              { 
                pollType: 'teacher_feedback',
                $or: [
                  { teacher_name: teacherName },
                  { 'lessonContext.teacher': teacherName }
                ]
              }
            ]
          });
        }
        break;
        
      case 'completed':
        // Завершенные: пользователь УЖЕ проголосовал
        if (userId) {
          query = {
            voted_users: userId
          };
          
          // Для преподавателей показываем только опросы о них
          if (req.user?.role === 'teacher' && currentUser?.full_name) {
            const teacherName = currentUser.full_name;
            roleScope.push({
              $or: [
                { teacher_name: teacherName },
                { 'lessonContext.teacher': teacherName }
              ]
            });
          }
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
        
      case 'my-votes':
        // Мои голоса: пользователь проголосовал (то же что и completed, для совместимости)
        if (userId) {
          query = {
            voted_users: userId
          };
          
          // Для преподавателей показываем только опросы о них
          if (req.user?.role === 'teacher' && currentUser?.full_name) {
            const teacherName = currentUser.full_name;
            roleScope.push({
              $or: [
                { teacher_name: teacherName },
                { 'lessonContext.teacher': teacherName }
              ]
            });
          }
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
        
        // Для преподавателей показываем только опросы о них
        if (req.user?.role === 'teacher' && currentUser?.full_name) {
          const teacherName = currentUser.full_name;
          roleScope.push({
            $or: [
              { teacher_name: teacherName },
              { 'lessonContext.teacher': teacherName }
            ]
          });
        }
        break;
    }

    // roleScope учитывает роль пользователя (студент/преподаватель)
    if (roleScope.length) {
      query = Object.keys(query).length ? { $and: [query, ...roleScope] } : { $and: roleScope };
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

    // Дополнительная фильтрация через isVisibleTo() для студентов
    let filteredPolls = polls;
    if (req.user?.role === 'student' && currentUser && filter === 'active') {
      filteredPolls = polls.filter(poll => {
        // Создаем временный документ Poll для использования метода isVisibleTo()
        const pollDoc = new Poll(poll);
        return pollDoc.isVisibleTo(currentUser);
      });
      
      console.log('🔒 Дополнительная фильтрация через isVisibleTo():');
      console.log('   До фильтрации:', polls.length);
      console.log('   После фильтрации:', filteredPolls.length);
    }

    // Для каждого опроса добавляем информацию о голосовании текущего пользователя
    const pollsWithVoteInfo = filteredPolls.map(poll => ({
      ...poll,
      has_voted: userId ? poll.voted_users.some(
        id => id.toString() === userId.toString()
      ) : false
    }));

    console.log('📋 POLLS DEBUG:');
    console.log('   Filter:', filter);
    console.log('   User ID:', userId);
    console.log('   Query:', JSON.stringify(query));
    console.log('   Found polls:', polls.length);
    console.log('   Total count:', total);

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
    const currentUser = userId ? await User.findById(userId).lean() : null;
    const now = new Date();

    // Базовый query с учетом роли пользователя
    let baseQuery = {
      status: { $nin: ['deleted', 'draft'] } // Исключаем удалённые и черновики
    };
    const roleScope = [];
    
    if (req.user?.role === 'student') {
      // Для студентов исключаем teacher-опросы
      baseQuery.pollType = { $nin: ['teacher_lesson_review', 'teacher_future_preferences'] };
      
      // Показываем только custom опросы или опросы их группы
      roleScope.push({ pollType: 'custom' });
      const g = currentUser?.group;
      const gid = currentUser?.group_id;
      const groupOr = [
        g ? { target_groups: g } : null,
        gid ? { target_groups: gid } : null,
        gid ? { target_groups: String(gid) } : null,
        g ? { 'lessonContext.group': g } : null,
        (g || gid) ? { 'lessonContext.groupId': (g || gid).toString() } : null
      ].filter(Boolean);
      if (groupOr.length) {
        roleScope.push({ $or: groupOr });
      }
    }
    
    // Для преподавателей показываем только опросы о них
    if (req.user?.role === 'teacher' && currentUser?.full_name) {
      const teacherName = currentUser.full_name;
      roleScope.push({
        $or: [
          { teacher_name: teacherName },
          { 'lessonContext.teacher': teacherName }
        ]
      });
    }

    if (roleScope.length) {
      baseQuery = { $or: roleScope };
    }

    // Подсчет для каждого фильтра
    const counts = {
      all: 0, // Убрали вкладку "Все", поэтому 0
      
      // АКТИВНЫЕ: опросы где студент НЕ голосовал и дедлайн не прошел
      active: await Poll.countDocuments({
        ...baseQuery,
        status: 'active',
        end_date: { $gt: now },
        ...(userId ? { voted_users: { $ne: userId } } : {})
      }),
      
      // ЗАВЕРШЕННЫЕ: опросы где студент УЖЕ проголосовал
      completed: userId ? await Poll.countDocuments({
        ...baseQuery,
        voted_users: userId
      }) : 0,
      
      // МОИ ГОЛОСА: то же что и завершенные
      myVotes: userId ? await Poll.countDocuments({
        ...baseQuery,
        voted_users: userId
      }) : 0
    };

    console.log('📊 COUNTS DEBUG:');
    console.log('   User ID:', userId);
    console.log('   User role:', req.user?.role);
    console.log('   User group:', currentUser?.group, currentUser?.group_id);
    console.log('   Base query:', JSON.stringify(baseQuery));
    console.log('   Counts:', counts);

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

    // Загружаем расписание и ищем пару
    const range = scheduleService.getDefaultRange();
    let schedule = [];
    let groupId = user.group_id || user.group;

    if (user.role === 'teacher' && user.ruz_teacher_id) {
      const teacherResp = await scheduleService.getPersonSchedule(user.ruz_teacher_id, { ...range, lng: 1 });
      schedule = Array.isArray(teacherResp) ? teacherResp : (teacherResp?.data || []);
    } else {
      const scheduleResp = groupId
        ? await scheduleService.getGroupSchedule(groupId, { ...range, lng: 1 })
        : { data: [] };
      schedule = Array.isArray(scheduleResp) ? scheduleResp : (scheduleResp?.data || []);
    }

    let lessonContext = null;
    let targetLesson = null;

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
      // Для отчёта преподавателя может не быть чёткого совпадения ID — пробуем сопоставить по дате/времени
      if (pollType === 'teacher_lesson_review' || pollType === 'teacher_future_preferences') {
        const fallbackLesson = schedule.find((item) => String(item.lessonOid || item.id || item.lessonId || '') === String(lessonId)) || schedule[0];
        if (!fallbackLesson) {
          return res.status(404).json({
            success: false,
            message: 'Пара не найдена в расписании'
          });
        }
        targetLesson = fallbackLesson;
        lessonContext = extractLessonContext(fallbackLesson, groupId);
      } else {
        return res.status(404).json({
          success: false,
          message: 'Пара не найдена в расписании'
        });
      }
    } else {
      targetLesson = lesson;
      lessonContext = extractLessonContext(lesson, groupId);
    }

    const now = new Date();

    // Определяем статус прошедшая/будущая пара
    const endDateString = targetLesson?.date && (targetLesson.endLesson || targetLesson.endTime)
      ? `${targetLesson.date} ${targetLesson.endLesson || targetLesson.endTime}`
      : targetLesson?.date;
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

    // Частный случай: отчёт преподавателя — не показываем студентам, храним приватно
    if (pollType === 'teacher_lesson_review') {
      pollData.visibility = 'private';
      pollData.target_groups = [];
      pollData.target_courses = [];
      pollData.target_faculties = [];
      pollData.target_programs = [];
      pollData.is_anonymous = false;
      pollData.reward_points = 0;
    }

    // ===== ПРОВЕРКА: Существует ли уже опрос для этой пары? =====
    // Ищем опрос с теми же параметрами (subject, teacher, date, pollType, group)
    const existingPoll = await Poll.findOne({
      pollType: pollType,
      'lessonContext.subject': lessonContext.subject,
      'lessonContext.teacher': lessonContext.teacher,
      'lessonContext.date': lessonContext.date,
      'lessonContext.time': lessonContext.time,
      status: { $ne: 'deleted' }
    }).sort({ created_at: -1 }).lean();

    // Если опрос уже существует - вернуть его, НЕ создавая новый
    if (existingPoll) {
      console.log('✅ Опрос уже существует для этой пары:', existingPoll._id);
      return res.status(200).json({
        success: true,
        message: 'Опрос уже существует для этой пары',
        poll: existingPoll,
        isExisting: true
      });
    }

    // Если опроса нет - создаем новый
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
    console.error(' ОШИБКА СОЗДАНИЯ ОПРОСА:');
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
    
    console.log('\n🗳️  VOTE REQUEST:');
    console.log('   User ID:', req.user?.userId);
    console.log('   Poll ID:', poll_id);
    console.log('   Type:', type);
    console.log('   Has answers:', !!answers);

    // Валидация базовых данных
    if (!poll_id) {
      console.log('   ❌ Нет poll_id');
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
            const invalid = value.filter(v => {
              if (question.options && question.options.includes(v)) return false;
              if (question.allowOther && typeof v === 'string' && v.toLowerCase().startsWith('другое')) return false;
              return true;
            });
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

      // Специфичная валидация для отчёта преподавателя: требуем обоснование при понижении рейтинга
      if (poll.pollType === 'teacher_lesson_review') {
        const changeValue = answersObject[4];
        const justification = answersObject[5];
        const lowered = typeof changeValue === 'string' && changeValue.toLowerCase().includes('пониз');
        if (lowered && (!justification || String(justification).trim().length === 0)) {
          return res.status(400).json({
            success: false,
            message: 'Пожалуйста, укажите обоснование при понижении рейтинга'
          });
        }
      }

      // Получаем полные данные пользователя для метаданных
      const fullUser = await User.findById(req.user.userId);
      
      // Метаданные пользователя для срезов
      const userMetadata = {
        faculty: fullUser.faculty || 'n/a',
        faculty_name: fullUser.faculty_name || fullUser.faculty || 'n/a',
        program: fullUser.program || 'n/a',
        program_name: fullUser.program_name || fullUser.program || 'n/a',
        course: Number.isFinite(fullUser.course) ? fullUser.course : 0,
        group_id: fullUser.group_id ? fullUser.group_id.toString() : (fullUser.group || 'n/a'),
        group_name: fullUser.group_name || fullUser.group || 'n/a'
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
      
      console.log('   ✅ Голос сохранён!');
      console.log('   📊 Всего ответов:', poll.responses.length);
      console.log('   👥 В voted_users:', poll.voted_users.length);
      console.log('');

      // Начисляем баллы пользователю
      const reward = poll.reward_points || 0;
      if (reward > 0 && fullUser?.role === 'student') {
        const updatedUser = await User.findByIdAndUpdate(
          req.user.userId,
          { $inc: { 'student_data.points': reward } },
          { new: true }
        );
        if (updatedUser) {
          const newLevel = User.calculateLevel(updatedUser.student_data?.points || 0);
          if (updatedUser.student_data?.level !== newLevel) {
            await User.findByIdAndUpdate(req.user.userId, {
              $set: { 'student_data.level': newLevel }
            });
            console.log(`🎖️ Уровень обновлён: ${updatedUser.student_data?.level} → ${newLevel}`);
          }
        }
      }
      
      // Обновляем кэш аналитики (асинхронно)
      setImmediate(() => {
        poll.updateAnalyticsCache().catch(err => {
          console.error('Error updating analytics cache:', err);
        });
      });

      // Собираем быстрый аналитический ответ для студента
      let analytics = null;
      if (req.user?.role === 'student') {
        analytics = buildVoteAnalytics(poll, req.user.userId, true);
      }

      return res.json({
        success: true,
        message: 'Ответы сохранены',
        points_earned: reward,
        analytics
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
      faculty: fullUser.faculty || 'n/a',
      faculty_name: fullUser.faculty_name || fullUser.faculty || 'n/a',
      program: fullUser.program || 'n/a',
      program_name: fullUser.program_name || fullUser.program || 'n/a',
      course: Number.isFinite(fullUser.course) ? fullUser.course : 0,
      group_id: fullUser.group_id ? fullUser.group_id.toString() : (fullUser.group || 'n/a'),
      group_name: fullUser.group_name || fullUser.group || 'n/a'
    };
    
    // Обновление опроса с метаданными (новая система)
    const answersData = option_ids.length === 1 ? option_ids[0] : option_ids;
    await poll.addVote(req.user.userId, answersData, userMetadata);

    // Начисляем баллы пользователю (совместимость: синхронизируем student_data.points <-> points)
    const reward = poll.reward_points || 10;
    if (reward > 0 && fullUser?.role === 'student') {
      const updatedUser = await User.findByIdAndUpdate(
        req.user.userId,
        { $inc: { 'student_data.points': reward } },
        { new: true }
      );
      if (updatedUser) {
        const newLevel = User.calculateLevel(updatedUser.student_data?.points || 0);
        if (updatedUser.student_data?.level !== newLevel) {
          await User.findByIdAndUpdate(req.user.userId, {
            $set: { 'student_data.level': newLevel }
          });
          console.log(`🎖️ Уровень обновлён: ${updatedUser.student_data?.level} → ${newLevel}`);
        }
      }
      // Счётчик активности (best-effort)
      await User.findByIdAndUpdate(req.user.userId, { $inc: { votes_count: 1 } });
    }

    // Собираем быстрый аналитический ответ для студента
    let analytics = null;
    if (req.user?.role === 'student') {
      analytics = buildVoteAnalytics(poll, req.user.userId, true);
    }

    res.json({
      success: true,
      message: 'Голос учтен',
      points_earned: reward,
      poll: {
        total_votes: poll.total_votes,
        options: poll.options
      },
      analytics
    });

  } catch (error) {
    console.error(' ОШИБКА ГОЛОСОВАНИЯ:');
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
 * Упрощенное голосование с начислением баллов (для новых опросов)
 * POST /api/polls/:id/vote
 */
exports.submitVote = async (req, res) => {
  try {
    const pollId = req.params.id || req.params.pollId; // Поддержка обоих форматов
    const { answers, comment, technical_issues } = req.body;
    const userId = req.user.userId;
    
    console.log('📥 submitVote вызван для опроса:', pollId);
    console.log('   userId:', userId);
    console.log('   answers:', JSON.stringify(answers, null, 2));
    console.log('   comment:', comment);
    
    const poll = await Poll.findById(pollId);
    
    if (!poll) {
      return res.status(404).json({ 
        success: false,
        error: 'Опрос не найден' 
      });
    }
    
    // Проверка активности
    if (!poll.isActive()) {
      return res.status(400).json({ 
        success: false,
        error: 'Опрос завершён или ещё не начался' 
      });
    }
    
    // Проверка на повторное голосование
    if (poll.hasVoted(userId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Вы уже проголосовали в этом опросе' 
      });
    }
    
    // Проверка видимости для пользователя
    const user = await User.findById(userId);
    const isVisible = poll.isVisibleTo(user);
    
    console.log('🔍 Проверка видимости опроса:', poll._id);
    console.log('   poll.target_groups:', poll.target_groups);
    console.log('   poll.target_faculties:', poll.target_faculties);
    console.log('   user.group_id:', user.group_id);
    console.log('   user.group:', user.group);
    console.log('   user.faculty:', user.faculty);
    console.log('   isVisible:', isVisible);
    
    if (!isVisible) {
      return res.status(403).json({ 
        success: false,
        error: 'Этот опрос не предназначен для вас' 
      });
    }
    
    // Структурирование ответов для lesson_review
    let formattedAnswers = answers;
    
    console.log('📥 Backend получил answers:', JSON.stringify(answers, null, 2));
    console.log('   Тип:', typeof answers, 'isArray:', Array.isArray(answers));
    
    if (poll.pollType === 'lesson_review') {
      // Преобразуем массив или объект в структуру Q1-Q5
      if (Array.isArray(answers)) {
        formattedAnswers = {
          Q1: answers[0] || null,
          Q2: answers[1] || null,
          Q3: answers[2] || null,
          Q4: answers[3] || null,
          Q5: answers[4] || null
        };
      } else if (typeof answers === 'object') {
        // Поддержка формата {q1, q2, q3, q4, q5} или {Q1, Q2, Q3, Q4, Q5}
        formattedAnswers = {
          Q1: answers.Q1 || answers.q1 || null,
          Q2: answers.Q2 || answers.q2 || null,
          Q3: answers.Q3 || answers.q3 || null,
          Q4: answers.Q4 || answers.q4 || null,
          Q5: answers.Q5 || answers.q5 || null
        };
      }
      
      // Валидация: все 5 вопросов обязательны для lesson_review
      console.log('🔍 Валидация answers для lesson_review:', formattedAnswers);
      
      const requiredQuestions = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
      for (const q of requiredQuestions) {
        const value = parseInt(formattedAnswers[q]);  // Преобразуем в число
        console.log(`   ${q}:`, formattedAnswers[q], '→', value);
        
        if (!value || value < 1 || value > 5) {
          return res.status(400).json({ 
            success: false,
            error: `Вопрос ${q} обязателен и должен быть от 1 до 5` 
          });
        }
        
        // Сохраняем преобразованное значение
        formattedAnswers[q] = value;
      }
    }
    
    // Добавляем голос (метод сам рассчитает ИКОП и заполнит метаданные)
    const response = await poll.addVote(userId, {
      answers: formattedAnswers,
      comment: comment || ''
    });
    
    // Обновляем статистику пользователя
    if (user) {
      // Добавляем опрос в список участия
      if (!user.polls_participated.includes(pollId)) {
        user.polls_participated.push(pollId);
      }
      
      // Увеличиваем счётчик голосований
      if (typeof user.incrementVotes === 'function') {
        await user.incrementVotes();
      } else {
        user.votes_count = (user.votes_count || 0) + 1;
        await user.save({ validateModifiedOnly: true });
      }
      
      // Начисляем баллы за участие (только студентам)
      if (user.role === 'student') {
        let points = 10; // базовые баллы за голосование
        
        // Дополнительные баллы за развёрнутый комментарий
        if (comment && comment.trim().length > 20) {
          points += 5;
        }
        
        if (typeof user.addPoints === 'function') {
          await user.addPoints(points, `Участие в опросе: ${poll.title}`);
        } else {
          // Фоллбек для старых моделей
          user.points = (user.points || 0) + points;
          if (user.student_data) {
            user.student_data.points = user.points;
          }
          await user.save({ validateModifiedOnly: true });
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Голос учтён',
      ikop: response.ikop,
      points_earned: user.role === 'student' ? (comment && comment.trim().length > 20 ? 15 : 10) : 0,
      new_total_points: user.role === 'student' ? user.points : 0
    });
  } catch (error) {
    console.error('submitVote error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Ошибка отправки голоса' 
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
    
    // Проверка: студент, который уже проголосовал, может видеть общую статистику
    const isCreator = req.user && poll.creator_id.toString() === req.user.userId.toString();
    const isAdmin = req.user && req.user.role === 'admin';
    const hasVoted = req.user && poll.voted_users && poll.voted_users.some(
      id => id.toString() === req.user.userId.toString()
    );
    
    // Доступ: создатель, админ, или студент, который уже проголосовал
    if (!isCreator && !isAdmin && !hasVoted) {
      return res.status(403).json({ success: false, message: 'Нет доступа. Сначала пройдите опрос.' });
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

/**
 * Получить персональную аналитику после голосования
 * GET /api/polls/:pollId/my-feedback-summary
 */
exports.getMyFeedbackSummary = async (req, res) => {
  try {
    const { pollId } = req.params;
    const userId = req.user.userId;
    
    // Получаем опрос
    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({ success: false, message: 'Опрос не найден' });
    }
    
    // Находим ответ текущего пользователя
    const myResponse = poll.responses.find(r => r.user_id && r.user_id.toString() === userId.toString());
    if (!myResponse) {
      return res.status(404).json({ success: false, message: 'Вы еще не проголосовали' });
    }
    
    // Получаем группу пользователя
    const currentUser = await User.findById(userId);
    const userGroup = currentUser.group;
    
    // Фильтруем ответы только студентов из той же группы
    // Сравниваем по user_group_name (название группы), а не user_group (может быть ID)
    const groupResponses = poll.responses.filter(r => {
      const responseGroup = r.user_group_name || r.user_group;
      return responseGroup === userGroup && r.user_id && r.user_id.toString() !== userId.toString();
    });
    
    // Анализируем ответы
    const myAnswers = myResponse.answers || {};
    const comparisons = [];
    const groupComments = [];
    
    // Обрабатываем вопросы
    if (poll.questions && poll.questions.length > 0) {
      poll.questions.forEach(question => {
        const myAnswer = myAnswers[question.id];
        
        if (question.type === 'rating' && myAnswer !== undefined) {
          // Считаем среднее по группе для rating вопросов
          const groupRatings = groupResponses
            .map(r => r.answers && r.answers[question.id])
            .filter(val => val !== undefined && val !== null);
          
          if (groupRatings.length > 0) {
            const groupAvg = groupRatings.reduce((sum, val) => sum + val, 0) / groupRatings.length;
            
            comparisons.push({
              questionText: question.text,
              myValue: myAnswer,
              groupAverage: parseFloat(groupAvg.toFixed(1)),
              questionType: 'rating',
              scale: question.scale || 5
            });
          }
        } else if (question.type === 'text' && myAnswer && myAnswer.trim()) {
          // Собираем текстовые ответы группы
          groupResponses.forEach(r => {
            const answer = r.answers && r.answers[question.id];
            if (answer && answer.trim()) {
              groupComments.push({
                questionText: question.text,
                text: answer
              });
            }
          });
        }
      });
    }
    
    // Собираем топ-3 комментария (по длине или частоте упоминания ключевых слов)
    const topComments = groupComments
      .slice(0, 10)  // Берём первые 10 для анализа
      .map(c => c.text);
    
    // Используем AI для суммаризации комментариев
    let aiSummary = null;
    let aiInsight = null;
    
    if (topComments.length > 0 && comparisons.length > 0) {
      try {
        // Формируем промпт для AI
        const commentsText = topComments.join('\n- ');
        const myScores = comparisons.map(c => `${c.questionText}: ${c.myValue}/${c.scale}`).join(', ');
        const groupScores = comparisons.map(c => `${c.questionText}: ${c.groupAverage}/${c.scale}`).join(', ');
        
        const aiPrompt = `Ты - аналитик образовательной платформы. Студент только что оценил занятие и хочет понять, как его мнение соотносится с группой.

ОЦЕНКИ СТУДЕНТА: ${myScores}
СРЕДНИЕ ОЦЕНКИ ГРУППЫ: ${groupScores}

КОММЕНТАРИИ ДРУГИХ СТУДЕНТОВ ГРУППЫ:
- ${commentsText}

Задачи:
1. Кратко (2-3 предложения) суммируй общее настроение группы по этому занятию
2. Дай студенту персональный инсайт: как его оценки отличаются от группы и что это может значить (1-2 предложения)

Пиши простым языком, дружелюбно, как коллега студенту. Без формальностей.`;
        
        const aiResponse = await gigachatService.chat(aiPrompt);
        
        if (aiResponse && aiResponse.message) {
          // Пытаемся разделить на summary и insight
          const parts = aiResponse.message.split(/\n\n+/);
          if (parts.length >= 2) {
            aiSummary = parts[0].trim();
            aiInsight = parts[1].trim();
          } else {
            aiSummary = aiResponse.message;
          }
        }
      } catch (aiError) {
        console.error('AI суммаризация не удалась:', aiError);
        // Продолжаем без AI
      }
    }
    
    // Формируем ответ - ПРОСТО, без AI и комментариев
    res.json({
      success: true,
      data: {
        pollTitle: poll.title,
        pollType: poll.pollType || poll.type,
        yourGroup: userGroup,
        groupSize: groupResponses.length + 1,  // +1 сам студент
        comparisons  // Только оценки!
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения персональной аналитики:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка при получении аналитики' 
    });
  }
};

/**
 * Создать новый опрос (lesson_review или custom)
 * POST /api/polls/new
 */
exports.createNewPoll = async (req, res) => {
  try {
    const { pollType, lessonContext, title, description, questions, target_groups, technicalIssuesEnabled } = req.body;
    const userId = req.user.userId;

    if (!pollType || !['lesson_review', 'custom'].includes(pollType)) {
      return res.status(400).json({
        success: false,
        message: 'Неверный тип опроса. Допустимые: lesson_review, custom'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    const now = new Date();
    const defaultDeadline = new Date(now.getTime() + DEFAULT_DEADLINE_HOURS * 3600 * 1000);

    let pollData = {
      creator_id: userId,
      creator_role: user.role,
      type: 'form',
      pollType,
      status: 'active',
      start_date: now,
      end_date: req.body.end_date ? new Date(req.body.end_date) : defaultDeadline,
      target_groups: target_groups || [],
      is_anonymous: req.body.is_anonymous !== false,
      reward_points: req.body.reward_points || 5
    };

    // ======== ОПРОС ПОСЛЕ ПАРЫ (lesson_review) ========
    if (pollType === 'lesson_review') {
      if (!lessonContext || !lessonContext.subject || !lessonContext.teacher) {
        return res.status(400).json({
          success: false,
          message: 'Для опроса после пары обязательны: subject, teacher в lessonContext'
        });
      }

      // Проверяем, существует ли уже опрос для этой пары
      const existingPoll = await Poll.findOne({
        pollType: 'lesson_review',
        'lessonContext.subject': lessonContext.subject,
        'lessonContext.teacher': lessonContext.teacher,
        'lessonContext.date': lessonContext.date,
        status: { $ne: 'deleted' }
      }).lean();

      if (existingPoll) {
        return res.status(200).json({
          success: true,
          message: 'Опрос уже существует для этой пары',
          poll: existingPoll,
          isExisting: true
        });
      }

      // Стандартные 5 вопросов + комментарий (ФИКСИРОВАННЫЕ)
      const standardQuestions = [
        {
          id: 'q1_relevance',
          text: 'Насколько актуальна тема для твоей будущей работы?',
          type: 'rating',
          scale: 5,
          weight: 0.25,
          block: 'content',
          required: true,
          labels: { min: 'Совсем не актуально', max: 'Очень актуально' }
        },
        {
          id: 'q2_clarity',
          text: 'Насколько понятно объяснили материал?',
          type: 'rating',
          scale: 5,
          weight: 0.30,
          block: 'content',
          required: true,
          labels: { min: 'Непонятно', max: 'Очень понятно' }
        },
        {
          id: 'q3_practice',
          text: 'Достаточно ли практики/примеров?',
          type: 'rating',
          scale: 5,
          weight: 0.20,
          block: 'content',
          required: true,
          labels: { min: 'Очень мало', max: 'Достаточно' }
        },
        {
          id: 'q4_engagement',
          text: 'Насколько преподаватель смог заинтересовать и вовлечь?',
          type: 'rating',
          scale: 5,
          weight: 0.15,
          block: 'methodology',
          required: true,
          labels: { min: 'Совсем не вовлек', max: 'Очень вовлек' }
        },
        {
          id: 'q5_organization',
          text: 'Как оцениваешь организацию пары (структура, темп)?',
          type: 'rating',
          scale: 5,
          weight: 0.10,
          block: 'methodology',
          required: true,
          labels: { min: 'Плохо', max: 'Отлично' }
        },
        {
          id: 'q6_comment',
          text: 'Что понравилось? Что улучшить?',
          type: 'text',
          weight: 0,
          block: 'other',
          required: false,
          maxLength: 500
        }
      ];

      pollData = {
        ...pollData,
        title: `${lessonContext.subject}${lessonContext.topic ? ' - ' + lessonContext.topic : ''}`,
        description: `${lessonContext.teacher}${lessonContext.date ? ' • ' + new Date(lessonContext.date).toLocaleDateString('ru-RU') : ''}`,
        lessonContext: {
          ...lessonContext,
          date: lessonContext.date ? new Date(lessonContext.date) : null
        },
        questions: standardQuestions,
        subject_name: lessonContext.subject,
        teacher_name: lessonContext.teacher,
        lesson_date: lessonContext.date ? new Date(lessonContext.date) : null,
        lesson_time: lessonContext.time || null,
        technicalIssues: {
          enabled: technicalIssuesEnabled !== false,
          options: ['Проблемы с техникой', 'Проблемы с аудиторией', 'Другое']
        },
        show_results: 'after_vote',
        minResponsesForResults: 3
      };
    }

    // ======== КАСТОМНЫЙ ОПРОС (custom) ========
    else if (pollType === 'custom') {
      if (!title || !questions || questions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Для кастомного опроса обязательны: title и questions'
        });
      }

      // Валидация вопросов
      const validTypes = ['rating', 'yes_no', 'choice', 'text'];
      const invalidQuestions = questions.filter(q => !validTypes.includes(q.type));
      
      if (invalidQuestions.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Недопустимые типы вопросов. Допустимые: ${validTypes.join(', ')}`
        });
      }

      // Проверка, что для choice указаны options
      const choiceWithoutOptions = questions.filter(q => q.type === 'choice' && (!q.options || q.options.length === 0));
      if (choiceWithoutOptions.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Для вопросов типа choice необходимо указать options'
        });
      }

      pollData = {
        ...pollData,
        title,
        description: description || '',
        questions: questions.map((q, idx) => ({
          id: q.id || `q${idx + 1}`,
          text: q.text,
          type: q.type,
          required: q.required !== false,
          scale: q.type === 'rating' ? 5 : undefined,
          options: q.options || [],
          maxLength: q.type === 'text' ? (q.maxLength || 500) : undefined
        })),
        show_results: req.body.show_results || 'after_vote',
        minResponsesForResults: req.body.minResponsesForResults || 0
      };
    }

    // Создаем опрос
    const poll = new Poll(pollData);
    await poll.save();

    console.log(`✅ Создан опрос типа ${pollType}:`, poll._id);
    console.log('   target_groups:', poll.target_groups);
    console.log('   target_faculties:', poll.target_faculties);
    console.log('   visibility:', poll.visibility);

    res.status(201).json({
      success: true,
      message: 'Опрос успешно создан',
      poll
    });

  } catch (error) {
    console.error('Ошибка создания опроса:', error);
    res.status(500).json({
      success: false,
      message: 'Не удалось создать опрос',
      error: error.message
    });
  }
};

/**
 * Проголосовать в опросе (с расчетом ИКОП для lesson_review)
 * POST /api/polls/:id/vote-new
 */
exports.voteInNewPoll = async (req, res) => {
  try {
    const { id } = req.params;
    const { answers, technical_issues } = req.body;
    const userId = req.user.userId;

    const poll = await Poll.findById(id);
    if (!poll) {
      return res.status(404).json({ success: false, message: 'Опрос не найден' });
    }

    // Проверка, что пользователь еще не голосовал
    if (poll.hasVoted(userId)) {
      return res.status(400).json({ success: false, message: 'Вы уже проголосовали' });
    }

    // Проверка, что опрос активен
    if (!poll.isActive()) {
      return res.status(400).json({ success: false, message: 'Опрос завершен' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    // Валидация ответов
    const requiredQuestions = poll.questions.filter(q => q.required);
    const missingAnswers = requiredQuestions.filter(q => !answers[q.id]);
    
    if (missingAnswers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Необходимо ответить на все обязательные вопросы',
        missing: missingAnswers.map(q => q.text)
      });
    }

    // Расчет ИКОП для lesson_review
    let ikop = null;
    if (poll.pollType === 'lesson_review') {
      const { calculateIKOP } = require('../services/ikopService');
      ikop = calculateIKOP(answers, poll.questions);
    }

    // Метаданные пользователя для срезов
    const userMetadata = {
      faculty: user.faculty || 'unknown',
      faculty_name: user.faculty_name || user.faculty || 'Неизвестно',
      program: user.program || 'unknown',
      program_name: user.program_name || user.program || 'Неизвестно',
      course: user.course || 0,
      group_id: user.group_id || user.group || 'unknown',
      group_name: user.group_name || user.group || 'Неизвестно'
    };

    // Добавляем ответ
    poll.responses.push({
      user_id: userId,
      answers,
      technical_issues: technical_issues || { has_issues: false },
      ikop,
      ...userMetadata,
      user_faculty: userMetadata.faculty,
      user_faculty_name: userMetadata.faculty_name,
      user_program: userMetadata.program,
      user_program_name: userMetadata.program_name,
      user_course: userMetadata.course,
      user_group: userMetadata.group_id.toString(),
      user_group_name: userMetadata.group_name,
      submitted_at: new Date()
    });

    poll.voted_users.push(userId);
    poll.total_votes = poll.responses.length;
    await poll.save();

    console.log(`✅ Пользователь ${userId} проголосовал в опросе ${id}${ikop !== null ? `, ИКОП: ${ikop}` : ''}`);

    res.json({
      success: true,
      message: 'Голос принят',
      ikop,
      poll: {
        _id: poll._id,
        title: poll.title,
        total_votes: poll.total_votes
      }
    });

  } catch (error) {
    console.error('Ошибка голосования:', error);
    res.status(500).json({
      success: false,
      message: 'Не удалось отправить голос',
      error: error.message
    });
  }
};

