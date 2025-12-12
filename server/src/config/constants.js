// Константы для системы аутентификации StudVote

// JWT настройки
const JWT_EXPIRATION = '30d';
const CODE_EXPIRATION = 300; // 5 минут в секундах

// Факультеты
const FACULTIES = [
  'Прикладная информатика',
  'Финансы и кредит',
  'Экономика',
  'Менеджмент',
  'Юриспруденция'
];

// Курсы
const COURSES = [1, 2, 3, 4, 5];

// Группы (общий список)
const GROUPS = [
  'ПИ-401',
  'ПИ-402',
  'ФК-301',
  'ФК-302',
  'ЭК-201',
  'МН-401'
];

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
  FACULTIES,
  COURSES,
  GROUPS,
  DEPARTMENTS,
  USER_ROLES,
  EMAIL_PATTERNS
};

