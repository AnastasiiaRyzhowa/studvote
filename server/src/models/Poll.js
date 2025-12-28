const mongoose = require('mongoose');

// Схема для вариантов ответа
const optionSchema = new mongoose.Schema({
  text: {
    type: String,
    trim: true,
    maxlength: 500
  },
  votes: {
    type: Number,
    default: 0,
    min: 0
  },
  percentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  order: {
    type: Number,
    default: 0
  }
}, { _id: false });

// Основная схема опроса
const pollSchema = new mongoose.Schema({
  creator_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 5,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  type: {
    type: String,
    enum: ['single', 'multiple', 'rating', 'form'],
    required: true,
    default: 'single'
  },
  visibility: {
    type: String,
    enum: ['public', 'group', 'faculty'],
    default: 'public',
    index: true
  },
  options: {
    type: [optionSchema],
    default: [],
    validate: {
      validator: function(options) {
        // Для форм options не используется
        if (this.type === 'form') {
          return true;
        }
        return options && options.length >= 2 && options.length <= 20;
      },
      message: 'Опрос должен иметь от 2 до 20 вариантов ответа'
    }
  },
  questions: {
    type: [{
      id: {
        type: String
      },
      text: {
        type: String
      },
      type: {
        type: String,
        enum: ['single', 'multiple', 'rating', 'text']
      },
      required: {
        type: Boolean,
        default: false
      },
      options: [{
        type: String
      }],
      max_choices: {
        type: Number,
        default: 1
      }
    }],
    default: []
  },
  total_votes: {
    type: Number,
    default: 0,
    min: 0
  },
  voted_users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  responses: [{
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    answers: {
      type: mongoose.Schema.Types.Mixed
    },
    created_at: {
      type: Date,
      default: Date.now
    }
  }],
  qr_code: {
    type: String
  },
  start_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  end_date: {
    type: Date,
    required: true,
    validate: {
      validator: function(endDate) {
        return endDate > this.start_date;
      },
      message: 'Дата окончания должна быть позже даты начала'
    }
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'completed'],
    default: 'draft',
    index: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Составной индекс для эффективного поиска активных опросов
pollSchema.index({ status: 1, start_date: 1, end_date: 1 });

// Индекс для быстрого поиска опросов пользователя
pollSchema.index({ creator_id: 1, created_at: -1 });

// Виртуальное поле для подсчета участников
pollSchema.virtual('participants_count').get(function() {
  return this.voted_users ? this.voted_users.length : 0;
});

// Виртуальное поле для проверки завершенности
pollSchema.virtual('is_ended').get(function() {
  return new Date() > this.end_date;
});

/**
 * Проверяет, активен ли опрос в данный момент
 * @returns {boolean}
 */
pollSchema.methods.isActive = function() {
  const now = new Date();
  return (
    this.status === 'active' &&
    now >= this.start_date &&
    now <= this.end_date
  );
};

/**
 * Проверяет, может ли пользователь голосовать
 * @param {ObjectId} userId - ID пользователя
 * @returns {boolean}
 */
pollSchema.methods.canVote = function(userId) {
  // Проверяем активность опроса
  if (!this.isActive()) {
    return false;
  }
  
  // Проверяем, не голосовал ли уже пользователь
  if (!this.voted_users || !Array.isArray(this.voted_users)) {
    return true;
  }
  
  const hasVoted = this.voted_users.some(
    votedUserId => votedUserId.toString() === userId.toString()
  );
  
  return !hasVoted;
};

/**
 * Пересчитывает проценты для всех вариантов ответа
 * @returns {Promise<Poll>}
 */
pollSchema.methods.calculateResults = async function() {
  if (!this.options || !Array.isArray(this.options)) {
    return this;
  }
  
  if (this.total_votes === 0) {
    // Если нет голосов, устанавливаем все проценты в 0
    this.options.forEach(option => {
      option.percentage = 0;
    });
  } else {
    // Вычисляем процент для каждого варианта
    this.options.forEach(option => {
      option.percentage = Math.round((option.votes / this.total_votes) * 100 * 100) / 100;
    });
  }
  
  return this.save();
};

/**
 * Обновляет статус опроса на основе текущей даты
 * @returns {Promise<Poll>}
 */
pollSchema.methods.updateStatus = async function() {
  const now = new Date();
  
  if (this.status === 'draft') {
    return this;
  }
  
  if (now < this.start_date) {
    this.status = 'draft';
  } else if (now >= this.start_date && now <= this.end_date) {
    this.status = 'active';
  } else {
    this.status = 'completed';
  }
  
  return this.save();
};

/**
 * Добавляет голос пользователя
 * @param {ObjectId} userId - ID пользователя
 * @param {Array<Number>} optionIndices - Индексы выбранных вариантов
 * @returns {Promise<Poll>}
 */
pollSchema.methods.addVote = async function(userId, optionIndices) {
  // Проверяем возможность голосования
  if (!this.canVote(userId)) {
    throw new Error('Голосование невозможно');
  }
  
  // Инициализируем массивы если они не существуют
  if (!this.voted_users) {
    this.voted_users = [];
  }
  if (!this.options) {
    this.options = [];
  }
  
  // Валидация индексов
  const invalidIndices = optionIndices.filter(
    index => index < 0 || index >= this.options.length
  );
  
  if (invalidIndices.length > 0) {
    throw new Error('Недопустимые индексы вариантов');
  }
  
  // Проверка типа опроса
  if (this.type === 'single' && optionIndices.length > 1) {
    throw new Error('Для опроса с единственным выбором можно выбрать только один вариант');
  }
  
  // Добавляем пользователя в список проголосовавших
  this.voted_users.push(userId);
  
  // Увеличиваем счетчики голосов
  optionIndices.forEach(index => {
    this.options[index].votes += 1;
  });
  
  // Увеличиваем общий счетчик
  this.total_votes += 1;
  
  // Пересчитываем проценты
  await this.calculateResults();
  
  return this;
};

/**
 * Middleware: Автоматическое обновление статуса перед сохранением
 */
pollSchema.pre('save', async function() {
  if (this.isModified('start_date') || this.isModified('end_date')) {
    const now = new Date();
    
    if (this.status !== 'draft') {
      if (now < this.start_date) {
        this.status = 'draft';
      } else if (now >= this.start_date && now <= this.end_date) {
        this.status = 'active';
      } else {
        this.status = 'completed';
      }
    }
  }
});

// Включаем виртуальные поля в JSON
pollSchema.set('toJSON', { virtuals: true });
pollSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Poll', pollSchema);





