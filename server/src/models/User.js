// backend/src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  
  // Имя пользователя (поддержка обоих вариантов)
  full_name: { 
    type: String, 
    required: true 
  },
  
  role: { 
    type: String, 
    enum: ['student', 'teacher', 'admin'], 
    required: true 
  },
  
  // ==================== СТУДЕНТ ====================
  student_id: { 
    type: String, 
    sparse: true 
  },
  
  faculty: { 
    type: String, 
    required: function() { return this.role === 'student'; } 
  },
  faculty_id: { type: String },
  faculty_name: { type: String },
  
  program: { 
    type: String, 
    required: function() { return this.role === 'student'; } 
  },
  program_id: { type: String },
  program_name: { type: String },
  
  course: { 
    type: Number, 
    min: 1, 
    max: 5, 
    required: function() { return this.role === 'student'; } 
  },
  
  group: { 
    type: String, 
    required: function() { return this.role === 'student'; } 
  },
  group_id: { type: Number },
  group_name: { type: String },
  
  // ==================== ПРЕПОДАВАТЕЛЬ ====================
  department: { type: String },
  ruz_teacher_id: { type: String },
  ruz_teacher_name: { type: String },
  
  // ==================== ГЕЙМИФИКАЦИЯ ====================
  // Вложенная структура (используется в студенческом интерфейсе)
  student_data: {
    points: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    badges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Badge' }],
    streak_days: { type: Number, default: 0 }
  },
  
  // Дублированные поля на верхнем уровне (для админки)
  points: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  badges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Badge' }],
  
  // ==================== АКТИВНОСТЬ ====================
  votes_count: { type: Number, default: 0 },      // для админки
  polls_created_count: { type: Number, default: 0 }, // для админки
  comments_count: { type: Number, default: 0 },   // для админки
  
  // Массивы ID опросов
  polls_participated: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Poll' 
  }],
  polls_created: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Poll' 
  }],
  
  // ==================== БЛОКИРОВКА ====================
  is_active: { 
    type: Boolean, 
    default: true 
  },
  
  // ==================== ДАТЫ ====================
  last_login: { type: Date },
  created_at: { 
    type: Date, 
    default: Date.now 
  },
  updated_at: { type: Date }
}, { 
  timestamps: true 
});

// ==================== ИНДЕКСЫ ====================
// email уже имеет unique: true в схеме, дополнительный индекс не нужен
// student_id уже имеет sparse: true в схеме, дополнительный индекс не нужен
userSchema.index({ role: 1 });
userSchema.index({ faculty: 1 });
userSchema.index({ program: 1 });
userSchema.index({ course: 1 });
userSchema.index({ group: 1 });
userSchema.index({ group_id: 1 });
userSchema.index({ is_active: 1 });
userSchema.index({ 'student_data.points': -1 }); // для рейтинга
userSchema.index({ points: -1 }); // для рейтинга (админка)

// ==================== ВИРТУАЛЬНЫЕ ПОЛЯ ====================
// Алиас full_name → name (для админки)
userSchema.virtual('name')
  .get(function() {
    return this.full_name;
  })
  .set(function(value) {
    this.full_name = value;
  });

// ==================== МЕТОДЫ ====================

// Синхронизация баллов между student_data и верхним уровнем
userSchema.methods.syncPoints = function() {
  if (this.role === 'student') {
    // Приоритет - student_data, синхронизируем на верхний уровень
    this.points = this.student_data.points;
    this.level = this.student_data.level;
  }
};

// Статический метод для расчёта уровня по баллам
userSchema.statics.calculateLevel = function(points) {
  if (points < 100) return 1;
  if (points < 250) return 2;
  if (points < 500) return 3;
  if (points < 1000) return 4;
  return 5;
};

// Добавить баллы студенту
userSchema.methods.addPoints = async function(amount, reason = '') {
  if (this.role !== 'student') return;
  
  // Обновляем оба места
  this.student_data.points += amount;
  this.points = this.student_data.points;
  
  // Пересчитываем уровень по новой логике
  this.student_data.level = this.constructor.calculateLevel(this.student_data.points);
  this.level = this.student_data.level;
  
  await this.save();
  
  console.log(`✅ Начислено ${amount} баллов пользователю ${this.full_name}. Причина: ${reason}`);
};

// Добавить бейдж
userSchema.methods.addBadge = async function(badgeId) {
  if (this.role !== 'student') return;
  
  // Проверка на дубликат
  if (this.student_data.badges.includes(badgeId)) return;
  
  this.student_data.badges.push(badgeId);
  this.badges = this.student_data.badges; // синхронизация
  
  await this.save();
};

// Увеличить счётчик голосований
userSchema.methods.incrementVotes = async function() {
  this.votes_count = (this.votes_count || 0) + 1;
  await this.save();
};

// Публичный JSON (безопасный для отправки клиенту)
userSchema.methods.toPublicJSON = function() {
  const obj = {
    id: this._id,
    email: this.email,
    full_name: this.full_name,
    name: this.full_name, // алиас для совместимости
    role: this.role,
    created_at: this.created_at,
    is_active: this.is_active,
    last_login: this.last_login
  };
  
  // Поля студента
  if (this.role === 'student') {
    obj.student_id = this.student_id;
    obj.faculty = this.faculty;
    obj.faculty_id = this.faculty_id;
    obj.faculty_name = this.faculty_name;
    obj.program = this.program;
    obj.program_id = this.program_id;
    obj.program_name = this.program_name;
    obj.course = this.course;
    obj.group = this.group;
    obj.group_id = this.group_id;
    obj.group_name = this.group_name;
    
    // Геймификация (оба варианта для совместимости)
    obj.student_data = {
      points: this.student_data.points,
      level: this.student_data.level,
      badges: this.student_data.badges,
      streak_days: this.student_data.streak_days
    };
    obj.points = this.student_data.points; // дубликат на верхнем уровне
    obj.level = this.student_data.level;
    obj.badges = this.student_data.badges;
    
    // Статистика
    obj.votes_count = this.votes_count || 0;
    obj.polls_created_count = this.polls_created_count || 0;
    obj.comments_count = this.comments_count || 0;
  }
  
  // Поля преподавателя
  if (this.role === 'teacher') {
    obj.department = this.department;
    obj.ruz_teacher_id = this.ruz_teacher_id;
    obj.ruz_teacher_name = this.ruz_teacher_name;
  }
  
  return obj;
};

// ==================== MIDDLEWARE ====================

// Pre-save: синхронизация перед сохранением
userSchema.pre('save', function(next) {
  if (this.role === 'student') {
    // Синхронизация баллов и уровня
    if (this.isModified('student_data.points')) {
      this.points = this.student_data.points;
      this.level = this.student_data.level;
    } else if (this.isModified('points')) {
      this.student_data.points = this.points;
      this.student_data.level = this.level;
    }
    
    // Синхронизация бейджей
    if (this.isModified('student_data.badges')) {
      this.badges = this.student_data.badges;
    } else if (this.isModified('badges')) {
      this.student_data.badges = this.badges;
    }
  }
  
  // Обновляем updated_at
  this.updated_at = new Date();
  
  if (typeof next === 'function') {
    next();
  }
});

// Включаем виртуальные поля в toJSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
