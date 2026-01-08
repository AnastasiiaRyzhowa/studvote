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
    enum: ['subject_feedback', 'teacher_feedback', 'class_organization', 'custom'],
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
  visibility: {
    type: String,
    enum: ['public', 'group', 'faculty', 'program'],
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
    subject: String,
    teacher: String,
    date: Date,
    room: String,
    topic: String,
    lessonType: String,
    time: String
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
    id: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    text: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: [
        'rating',
        'single_choice',
        'multiple_choice',
        'binary',
        'text',
        // обратная совместимость
        'rating_1_5',
        'yes_no',
        'multiple_choice_old',
        'text_long',
        'text_short'
      ],
      default: 'text'
    },
    options: [mongoose.Schema.Types.Mixed], // Для multiple_choice
    scale: mongoose.Schema.Types.Mixed, // число звезд или массив подписей
    labels: {
      min: String,
      max: String
    },
    required: {
      type: Boolean,
      default: true
    },
    maxLength: {
      type: Number,
      default: null
    },
    followUp: mongoose.Schema.Types.Mixed // условные вопросы/branching
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
    // Примеры:
    // Для одного вопроса: answers: 5
    // Для нескольких: answers: { q1: 5, q2: 4, q3: "yes" }
    
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
    enum: ['draft', 'active', 'completed'],
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
  
  // Проверяем группу
  if (this.target_groups.length > 0 && user.group_id && this.target_groups.includes(user.group_id.toString())) {
    return true;
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
  
  // Добавляем ответ с метаданными
  this.responses.push({
    user_id: userId,
    answers: answers,
    
    // Метаданные для срезов (с проверками на undefined)
    user_faculty: userMetadata?.faculty || 'unknown',
    user_faculty_name: userMetadata?.faculty_name || userMetadata?.faculty || 'unknown',
    user_program: userMetadata?.program || 'unknown',
    user_program_name: userMetadata?.program_name || userMetadata?.program || 'unknown',
    user_course: userMetadata?.course || 0,
    user_group: userMetadata?.group_id ? userMetadata.group_id.toString() : (userMetadata?.group || 'unknown'),
    user_group_name: userMetadata?.group_name || userMetadata?.group || 'unknown',
    
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

module.exports = mongoose.model('Poll', PollSchema);
