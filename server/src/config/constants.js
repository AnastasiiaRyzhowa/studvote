// Константы для системы аутентификации StudVote

// JWT настройки
const JWT_EXPIRATION = '30d';
const CODE_EXPIRATION = 300; // 5 минут в секундах

// Кафедры
const DEPARTMENTS = [
  'Кафедра информационных технологий',
  'Кафедра финансов',
  'Кафедра экономики',
  'Кафедра менеджмента',
  'Кафедра правоведения'
];

// Роли пользователей
const USER_ROLES = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin'
};

// Email доменов для определения ролей
const EMAIL_PATTERNS = {
  STUDENT: /^\d{6}@edu\.fa\.ru$/,
  TEACHER: /^[a-z]+@fa\.ru$/,
  ADMIN: 'admin@fa.ru'
};

module.exports = {
  JWT_EXPIRATION,
  CODE_EXPIRATION,
  DEPARTMENTS,
  USER_ROLES,
  EMAIL_PATTERNS
};

