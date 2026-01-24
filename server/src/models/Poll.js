const mongoose = require('mongoose');

const PollSchema = new mongoose.Schema({
  // ==================== ОСНОВНОЕ ====================
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['single', 'multiple', 'rating', 'form', 'topic', 'teacher', 'subject', 'organization', 'custom'],
    default: 'custom'
  },
  pollType: {
    type: String,
    enum: [
      'lesson_review',  // Новый: опрос после пары (фиксированные 5 вопросов + комментарий)
      'custom',         // Новый: кастомный опрос с гибкими вопросами
      // Старые типы (для обратной совместимости)
      'subject_feedback',
      'teacher_feedback',
      'class_organization',
      'teacher_lesson_review',
      'teacher_future_preferences'
    ],
    required: false
  },
  
  // ==================== ВАРИАНТЫ ОТВЕТОВ (для simple polls) ====================
  options: [{
    text: {
      type: String,
      required: true
    },
    votes: {
      type: Number,
      default: 0
    },
    voters: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],
  
  // Дополнительные настройки для опросов
  max_choices: {
    type: Number,
    default: null // Для multiple choice
  },
  is_anonymous: {
    type: Boolean,
    default: false
  },
  show_results: {
    type: String,
    enum: ['immediate', 'after_vote', 'after_end'],
    default: 'immediate'
  },
  allow_comments: {
    type: Boolean,
    default: false
  },
  visibility: {
    type: String,
    enum: ['public', 'group', 'faculty', 'program', 'private'],
    default: 'public'
  },
  reward_points: {
    type: Number,
    default: 0,
    min: 0
  },
  minResponsesForResults: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Для lesson_review: настройки чекбокса технических проблем
  technicalIssues: {
    enabled: { type: Boolean, default: false },
    options: {
      type: [String],
      default: ['Проблемы с техникой', 'Проблемы с аудиторией', 'Другое']
    }
  },
  
  // ==================== СВОБОДНЫЕ ОПРОСЫ ====================
  // Категория свободного опроса
  category: {
    type: String,
    enum: ['organizational', 'academic', 'extracurricular', 'feedback'],
    default: null
  },
  
  // Теги для свободных опросов
  tags: [{
    type: String,
    trim: true
  }],
  
  // Целевая аудитория для свободных опросов
  target_audience: {
    type: {
      type: String,
      enum: ['all', 'faculty', 'program', 'course', 'group'],
      default: 'all'
    },
    value: String  // Значение (например, имя факультета, программы, курса или группы)
  },
  
  // Максимальное количество ответов (целевое количество)
  max_responses: {
    type: Number,
    default: null
  },

  // Целевое количество (для охвата/админки). Если не задано — можно использовать max_responses/0.
  target_count: {
    type: Number,
    default: 0
  },
  
  // Имя создателя (кэш для быстрого доступа)
  creator_name: {
    type: String,
    default: null
  },
  
  // Дата закрытия опроса
  closed_at: {
    type: Date,
    default: null
  },

  // Дубли (для совместимости с админкой/аналитикой)
  discipline_name: { type: String, default: null },
  group_id: { type: Number, default: null },
  group_name: { type: String, default: null },
  date: { type: String, default: null },
  topic: { type: String, default: null },
  
  // ==================== ПРИВЯЗКА К УЧЕБНОМУ ПРОЦЕССУ ====================
  subject_id: {
    type: String, // ID из RUZ
    default: null
  },
  subject_name: {
    type: String,
    default: null
  },
  teacher_id: {
    type: String, // ID из RUZ
    default: null
  },
  teacher_name: {
    type: String,
    default: null
  },
  topic_name: {
    type: String, // Название темы (для type='topic')
    default: null
  },
  lessonContext: {
    lessonId: String,
    lessonOid: String,      // ID пары из РУЗ
    subject: String,         // Название дисциплины
    teacher: String,         // ФИО преподавателя
    date: Date,              // Дата пары
    time: String,            // Время пары "10:00-11:30"
    beginLesson: String,     // Время начала "10:00"
    endLesson: String,       // Время окончания "11:30"
    topic: String,           // Тема пары
    auditorium: String,      // Аудитория
    room: String,            // Аудитория (для совместимости)
    lessonType: String,      // Тип занятия (лекция, практика)
    group: String,           // Название группы
    groupId: String          // ID группы
  },
  lesson_date: {
    type: Date, // Дата конкретной пары (для type='organization')
    default: null
  },
  lesson_time: {
    type: String, // "10:10-11:40"
    default: null
  },
  
  // ==================== СОЗДАТЕЛЬ ====================
  creator_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  creator_role: {
    type: String,
    enum: ['student', 'teacher', 'admin'],
    default: 'student'
  },
  
  // Контекст создателя (откуда опрос)
  source_faculty: String,
  source_program: String,
  source_course: Number,
  source_group: String,
  
  // ✅ ДОБАВЛЕНО: Поля для фильтрации lesson_review опросов в аналитике
  faculty: { type: String, default: null },
  faculty_name: { type: String, default: null },
  program: { type: String, default: null },
  program_name: { type: String, default: null },
  course: { type: Number, default: null },
  
  // ==================== ТАРГЕТИНГ (кому показывать) ====================
  target_groups: [{
    type: String // group_id из RUZ
  }],
  target_faculties: [{
    type: String // 'fit', 'fmeo', 'feb'
  }],
  target_programs: [{
    type: String // 'devops', 'data-science'
  }],
  target_courses: [{
    type: Number // 1, 2, 3, 4
  }],
  
  // ==================== ВОПРОСЫ ====================
  questions: [{
    id: mongoose.Schema.Types.Mixed,  // String или Number (для гибкости)
    text: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: [
        'rating',           // Звезды 1-5 (для lesson_review и custom)
        'yes_no',           // Да/Нет (для custom)
        'choice',           // Выбор из списка (для custom)
        'text',             // Текстовый ответ (для обоих типов)
        // Старые типы (для обратной совместимости)
        'single_choice',
        'multiple_choice',
        'binary',
        'text_short',
        'text_long',
        'rating_1_5',
        'multiple_choice_old'
      ],
      default: 'text_short'
    },
    required: {
      type: Boolean,
      default: true
    },
    // Для lesson_review: вес вопроса для расчета ИКОП
    weight: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },
    // Для lesson_review: блок вопроса (content/methodology)
    block: {
      type: String,
      enum: ['content', 'methodology', 'other'],
      default: 'other'
    },
    // rating
    scale: { type: Number, default: 5 },
    labels: {
      min: String,
      max: String
    },
    // choices
    options: [String],
    allowOther: { type: Boolean, default: false },
    // text
    maxLength: { type: Number, default: null },
    // follow-up conditional
    followUp: mongoose.Schema.Types.Mixed
  }],
  
  // ==================== ОТВЕТЫ С МЕТАДАННЫМИ ДЛЯ СРЕЗОВ ====================
  responses: [{
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    
    // Сами ответы (гибкая структура)
    answers: mongoose.Schema.Types.Mixed, 
    raw_responses: mongoose.Schema.Types.Mixed,
    // Комментарий (для совместимости с UI админки/студента)
    comment: {
      type: String,
      default: ''
    },
    // Примеры:
    // Для одного вопроса: answers: 5
    // Для нескольких: answers: { q1_relevance: 5, q2_clarity: 4, q6_comment: "Отлично!" }
    
    // Для lesson_review: технические проблемы (опционально)
    technical_issues: {
      has_issues: { type: Boolean, default: false },
      selected: [String],  // ["Проблемы с техникой", "Проблемы с аудиторией"]
      description: String  // Описание проблемы
    },
    
    // Для lesson_review: ИКОП (Индекс Качества Образовательного Процесса)
    ikop: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },

    // Дубли для совместимости (админка ожидает student_metadata)
    student_metadata: {
      faculty: { type: String, default: '' },
      program: { type: String, default: '' },
      course: { type: Number, default: 0 },
      group: { type: String, default: '' }
    },
    
    // ============ МЕТАДАННЫЕ ДЛЯ СРЕЗОВ (КРИТИЧНО!) ============
    user_faculty: {
      type: String,
      required: true
    },
    user_faculty_name: {
      type: String,
      required: true
    },
    user_program: {
      type: String,
      required: true
    },
    user_program_name: {
      type: String,
      required: true
    },
    user_course: {
      type: Number,
      required: true
    },
    user_group: {
      type: String,
      required: true
    },
    user_group_name: {
      type: String,
      required: true
    },
    
    submitted_at: {
      type: Date,
      default: Date.now
    }
  }],
  
  // ==================== СТАТУС ====================
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'closed', 'deleted'],
    default: 'active'
  },
  start_date: {
    type: Date,
    default: Date.now
  },
  end_date: {
    type: Date,
    required: true
  },
  
  // ==================== СТАТИСТИКА ====================
  total_votes: {
    type: Number,
    default: 0
  },
  
  // Кэш средних оценок (обновляется при новом голосе)
  cached_analytics: {
    overall_average: Number,
    by_faculty: mongoose.Schema.Types.Mixed,
    by_program: mongoose.Schema.Types.Mixed,
    by_course: mongoose.Schema.Types.Mixed,
    last_updated: Date
  },
  
  // ==================== СОВМЕСТИМОСТЬ СО СТАРОЙ СИСТЕМОЙ ====================
  // Оставляем для обратной совместимости
  voted_users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
  
}, {
  timestamps: true
});

// ==================== МЕТОДЫ ====================

// Проверка: может ли пользователь видеть этот опрос
PollSchema.methods.isVisibleTo = function(user) {
  // Если таргетинг не задан - показываем всем
  if (this.target_groups.length === 0 &&
      this.target_faculties.length === 0 &&
      this.target_programs.length === 0 &&
      this.target_courses.length === 0) {
    return true;
  }
  
  // Проверяем группу (по group_id ИЛИ по названию group)
  if (this.target_groups.length > 0) {
    const userGroupId = user.group_id ? user.group_id.toString() : null;
    const userGroupName = user.group;
    
    if (this.target_groups.some(tg => 
      tg === userGroupId || tg === userGroupName
    )) {
      return true;
    }
  }
  
  // Проверяем факультет
  if (this.target_faculties.length > 0 && this.target_faculties.includes(user.faculty)) {
    return true;
  }
  
  // Проверяем программу
  if (this.target_programs.length > 0 && this.target_programs.includes(user.program)) {
    return true;
  }
  
  // Проверяем курс
  if (this.target_courses.length > 0 && this.target_courses.includes(user.course)) {
    return true;
  }
  
  return false;
};

// Проверка: голосовал ли пользователь
PollSchema.methods.hasVoted = function(userId) {
  return this.responses.some(r => r.user_id.toString() === userId.toString());
};

// Добавить голос
PollSchema.methods.addVote = async function(userId, answers, userMetadata) {
  // Проверка дубликата
  if (this.hasVoted(userId)) {
    throw new Error('Вы уже проголосовали в этом опросе');
  }
  
  // Для обычных опросов (single, multiple, rating) - обновляем счетчики в options
  if (this.options && this.options.length > 0 && this.type !== 'form') {
    const selectedIndices = Array.isArray(answers) ? answers : [answers];
    
    selectedIndices.forEach(index => {
      if (this.options[index]) {
        this.options[index].votes = (this.options[index].votes || 0) + 1;
        if (!this.options[index].voters) {
          this.options[index].voters = [];
        }
        this.options[index].voters.push(userId);
      }
    });
  }
  
  // Добавляем ответ с метаданными (и дублируем student_metadata для совместимости)
  this.responses.push({
    user_id: userId,
    answers: answers,
    comment: userMetadata?.comment || '',
    
    // Метаданные для срезов (с проверками на undefined)
    user_faculty: userMetadata?.faculty || 'unknown',
    user_faculty_name: userMetadata?.faculty_name || userMetadata?.faculty || 'unknown',
    user_program: userMetadata?.program || 'unknown',
    user_program_name: userMetadata?.program_name || userMetadata?.program || 'unknown',
    user_course: userMetadata?.course || 0,
    user_group: userMetadata?.group_id ? userMetadata.group_id.toString() : (userMetadata?.group || 'unknown'),
    user_group_name: userMetadata?.group_name || userMetadata?.group || 'unknown',
    student_metadata: {
      faculty: userMetadata?.faculty || '',
      program: userMetadata?.program || '',
      course: userMetadata?.course || 0,
      group: userMetadata?.group || userMetadata?.group_name || ''
    },
    
    submitted_at: new Date()
  });
  
  // Для обратной совместимости
  if (!this.voted_users) {
    this.voted_users = [];
  }
  this.voted_users.push(userId);
  
  this.total_votes = this.responses.length;
  
  await this.save();
  
  // Обновляем кэш аналитики (асинхронно)
  setImmediate(() => {
    this.updateAnalyticsCache().catch(err => {
      console.error('Error updating analytics cache:', err);
    });
  });
  
  return this;
};

// Обновить кэш аналитики
PollSchema.methods.updateAnalyticsCache = async function() {
  try {
    const analytics = require('../services/analyticsService');
    const result = await analytics.analyzePollResults(this._id);
    
    this.cached_analytics = {
      overall_average: result.overall.average,
      by_faculty: result.byFaculty,
      by_program: result.byProgram,
      by_course: result.byCourse,
      last_updated: new Date()
    };
    
    await this.save();
  } catch (error) {
    console.error('Error in updateAnalyticsCache:', error);
  }
};

// Проверка: активен ли опрос
PollSchema.methods.isActive = function() {
  const now = new Date();
  return (
    this.status === 'active' &&
    now >= this.start_date &&
    now <= this.end_date
  );
};

// Проверка: может ли пользователь голосовать (для обратной совместимости)
PollSchema.methods.canVote = function(userId) {
  if (!this.isActive()) {
    return false;
  }
  
  return !this.hasVoted(userId);
};

// ==================== ИНДЕКСЫ ====================
PollSchema.index({ status: 1, end_date: 1 });
PollSchema.index({ creator_id: 1 });
PollSchema.index({ 'target_groups': 1 });
PollSchema.index({ subject_id: 1 });
PollSchema.index({ teacher_id: 1 });
PollSchema.index({ type: 1 });

// ==================== MIDDLEWARE ====================
PollSchema.pre('save', function () {
  try {
    // Синхронизация lessonContext -> дубли верхнего уровня (для админки)
    if (this.lessonContext) {
      if (!this.discipline_name && this.lessonContext.subject) this.discipline_name = this.lessonContext.subject;
      if (!this.teacher_name && this.lessonContext.teacher) this.teacher_name = this.lessonContext.teacher;
      if (!this.group_name && this.lessonContext.group) this.group_name = this.lessonContext.group;
      // groupId может быть строкой
      if (!this.group_id && this.lessonContext.groupId) this.group_id = Number(this.lessonContext.groupId) || this.group_id;
      if (!this.topic && (this.lessonContext.topic || this.lessonContext.subject)) this.topic = this.lessonContext.topic || this.lessonContext.subject;
      if (!this.date && this.lessonContext.date) {
        // если date - Date, приводим к YYYY-MM-DD
        if (this.lessonContext.date instanceof Date && !Number.isNaN(this.lessonContext.date.getTime())) {
          const d = this.lessonContext.date;
          const pad = (n) => String(n).padStart(2, '0');
          this.date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        } else {
          this.date = String(this.lessonContext.date);
        }
      }
    }

    // Синхронизация target_count (если не задан, можно подсказать из max_responses)
    if ((!this.target_count || this.target_count === 0) && this.max_responses) {
      this.target_count = this.max_responses;
    }

    // Синхронизация student_metadata из user_* полей (если responses обновились)
    if (Array.isArray(this.responses)) {
      this.responses.forEach((r) => {
        if (!r.student_metadata || (!r.student_metadata.faculty && !r.student_metadata.program)) {
          r.student_metadata = {
            faculty: r.user_faculty || '',
            program: r.user_program || '',
            course: r.user_course || 0,
            group: r.user_group || ''
          };
        }
      });
    }
  } catch (e) {
    // best-effort
  }
});

module.exports = mongoose.model('Poll', PollSchema);
