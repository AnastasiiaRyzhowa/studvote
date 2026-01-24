const mongoose = require('mongoose');

// Схема для голоса
const voteSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  poll_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Poll',
    required: true,
    index: true
  },
  option_ids: {
    type: [Number],
    required: true,
    validate: {
      validator: function(options) {
        return options.length > 0 && options.length <= 20;
      },
      message: 'Должен быть выбран хотя бы один вариант'
    }
  },
  points_earned: {
    type: Number,
    default: 0,
    min: 0
  },
  voted_at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// КРИТИЧЕСКИЙ ИНДЕКС: Один пользователь может проголосовать в опросе только один раз
voteSchema.index({ user_id: 1, poll_id: 1 }, { unique: true });

// Индекс для быстрого получения всех голосов в опросе
voteSchema.index({ poll_id: 1, voted_at: -1 });

// Индекс для получения истории голосований пользователя
voteSchema.index({ user_id: 1, voted_at: -1 });

// Индексы для аналитики
voteSchema.index({ voted_at: 1, user_id: 1 });
voteSchema.index({ 'userData.group': 1, voted_at: 1 });

/**
 * Статический метод: Проверяет, голосовал ли пользователь в опросе
 * @param {ObjectId} userId - ID пользователя
 * @param {ObjectId} pollId - ID опроса
 * @returns {Promise<boolean>}
 */
voteSchema.statics.hasUserVoted = async function(userId, pollId) {
  const vote = await this.findOne({ user_id: userId, poll_id: pollId });
  return !!vote;
};

/**
 * Статический метод: Получить голос пользователя в опросе
 * @param {ObjectId} userId - ID пользователя
 * @param {ObjectId} pollId - ID опроса
 * @returns {Promise<Vote|null>}
 */
voteSchema.statics.getUserVote = async function(userId, pollId) {
  return this.findOne({ user_id: userId, poll_id: pollId });
};

/**
 * Статический метод: Подсчет общего количества голосов в опросе
 * @param {ObjectId} pollId - ID опроса
 * @returns {Promise<number>}
 */
voteSchema.statics.countVotesInPoll = async function(pollId) {
  return this.countDocuments({ poll_id: pollId });
};

/**
 * Статический метод: Получить статистику голосования по опросу
 * @param {ObjectId} pollId - ID опроса
 * @returns {Promise<Object>}
 */
voteSchema.statics.getPollStatistics = async function(pollId) {
  const votes = await this.find({ poll_id: pollId });
  
  // Подсчет голосов по вариантам
  const optionVotes = {};
  votes.forEach(vote => {
    vote.option_ids.forEach(optionId => {
      optionVotes[optionId] = (optionVotes[optionId] || 0) + 1;
    });
  });
  
  return {
    total_votes: votes.length,
    option_votes: optionVotes,
    votes: votes
  };
};

/**
 * Статический метод: Получить все голоса пользователя
 * @param {ObjectId} userId - ID пользователя
 * @param {Object} options - Опции (limit, skip, sort)
 * @returns {Promise<Array<Vote>>}
 */
voteSchema.statics.getUserVotes = async function(userId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    sort = { voted_at: -1 }
  } = options;
  
  return this.find({ user_id: userId })
    .sort(sort)
    .limit(limit)
    .skip(skip)
    .populate('poll_id', 'title status end_date');
};

/**
 * Метод экземпляра: Проверяет валидность голоса
 * @returns {boolean}
 */
voteSchema.methods.isValid = function() {
  return (
    this.option_ids &&
    this.option_ids.length > 0 &&
    this.user_id &&
    this.poll_id
  );
};

/**
 * Middleware: Валидация перед сохранением
 */
voteSchema.pre('save', async function() {
  // Проверяем, что пользователь не голосовал ранее (для новых документов)
  if (this.isNew) {
    const existingVote = await this.constructor.findOne({
      user_id: this.user_id,
      poll_id: this.poll_id
    });
    
    if (existingVote) {
      const error = new Error('Пользователь уже проголосовал в этом опросе');
      error.code = 'DUPLICATE_VOTE';
      throw error;
    }
  }
});

/**
 * Middleware: После сохранения голоса - начисление баллов пользователю
 */
voteSchema.post('save', async function(doc) {
  try {
    // Получаем модель User
    const User = mongoose.model('User');
    
    // Начисляем баллы пользователю (если это студент)
    const updatedUser = await User.findByIdAndUpdate(
      doc.user_id,
      { $inc: { 'student_data.points': doc.points_earned } },
      { new: true }
    );
    
    // Обновляем уровень при необходимости
    if (updatedUser) {
      const newLevel = User.calculateLevel(updatedUser.student_data?.points || 0);
      if (updatedUser.student_data?.level !== newLevel) {
        await User.findByIdAndUpdate(doc.user_id, {
          $set: { 'student_data.level': newLevel }
        });
      }
    }
  } catch (error) {
    console.error('Ошибка при начислении баллов:', error);
  }
});

/**
 * Middleware: Запрет на изменение голоса после создания
 */
voteSchema.pre('findOneAndUpdate', function() {
  const error = new Error('Изменение голоса после создания запрещено');
  error.code = 'VOTE_IMMUTABLE';
  throw error;
});

voteSchema.pre('updateOne', function() {
  const error = new Error('Изменение голоса после создания запрещено');
  error.code = 'VOTE_IMMUTABLE';
  throw error;
});

// Включаем виртуальные поля в JSON
voteSchema.set('toJSON', { virtuals: true });
voteSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Vote', voteSchema);





