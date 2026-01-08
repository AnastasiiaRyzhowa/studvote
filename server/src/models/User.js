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
  full_name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['student', 'teacher', 'admin'],
    required: true
  },
  
  // Поля для студентов
  student_id: {
    type: String,
    sparse: true // Индекс только для существующих значений
  },
  faculty: {
    type: String,
    required: function() { return this.role === 'student'; }
  },
  faculty_id: {
    type: String,
    required: false
  },
  faculty_name: {
    type: String,
    required: false
  },
  program: {
    type: String,
    required: function() { return this.role === 'student'; }
  },
  program_id: {
    type: String,
    required: false
  },
  program_name: {
    type: String,
    required: false
  },
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
  group_id: {
    type: Number,
    required: false
  },
  group_name: {
    type: String,
    required: false
  },
  
  // Поля для преподавателей
  department: {
    type: String,
    required: function() { return this.role === 'teacher'; }
  },
  subjects: {
    type: [String],
    default: []
  },
  
  // Геймификация (только для студентов)
  student_data: {
    points: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    badges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Badge' }],
    streak_days: { type: Number, default: 0 }
  },
  
  // Участие в голосованиях
  polls_participated: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Poll' 
  }],
  polls_created: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Poll' 
  }],
  
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Индексы для быстрого поиска
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ student_id: 1 }, { sparse: true });
userSchema.index({ faculty: 1 }, { sparse: true });
userSchema.index({ department: 1 }, { sparse: true });

// Метод для получения публичной информации о пользователе
userSchema.methods.toPublicJSON = function() {
  const obj = {
    id: this._id,
    email: this.email,
    full_name: this.full_name,
    role: this.role,
    created_at: this.created_at
  };
  
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
    obj.student_data = this.student_data;
  } else if (this.role === 'teacher') {
    obj.department = this.department;
    obj.subjects = this.subjects;
  }
  
  return obj;
};

module.exports = mongoose.model('User', userSchema);