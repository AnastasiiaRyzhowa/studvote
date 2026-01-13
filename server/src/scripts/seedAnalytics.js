require('dotenv').config();
const mongoose = require('mongoose');
const Poll = require('../models/Poll');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set. Please set it in .env');
  process.exit(1);
}

const now = new Date();
const daysAgo = (d) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

async function upsertUser(filter, data) {
  return User.findOneAndUpdate(filter, data, { upsert: true, new: true, setDefaultsOnInsert: true });
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // --- Users: 5 студентов + 1 преподаватель ---
  const studentsData = [
    { email: 'stud1@edu.fa.ru', full_name: 'Студент Один', role: 'student', faculty: 'ФИТ', program: 'Программная инженерия', course: 2, group: 'ПИ-201', group_id: 201, student_id: '000001' },
    { email: 'stud2@edu.fa.ru', full_name: 'Студент Два', role: 'student', faculty: 'ФИТ', program: 'Программная инженерия', course: 2, group: 'ПИ-201', group_id: 201, student_id: '000002' },
    { email: 'stud3@edu.fa.ru', full_name: 'Студент Три', role: 'student', faculty: 'ФИТ', program: 'Программная инженерия', course: 2, group: 'ПИ-202', group_id: 202, student_id: '000003' },
    { email: 'stud4@edu.fa.ru', full_name: 'Студент Четыре', role: 'student', faculty: 'ФИТ', program: 'Data Science', course: 3, group: 'ДС-301', group_id: 301, student_id: '000004' },
    { email: 'stud5@edu.fa.ru', full_name: 'Студент Пять', role: 'student', faculty: 'ФИТ', program: 'Data Science', course: 3, group: 'ДС-301', group_id: 301, student_id: '000005' }
  ];

  const teacherData = {
    email: 'teacher@fa.ru',
    full_name: 'Преподаватель ИИ',
    role: 'teacher',
    department: 'Кафедра информационных технологий',
    ruz_teacher_id: 't-1',
    ruz_teacher_name: 'Преподаватель ИИ',
    subjects: ['Машинное обучение', 'Базы данных']
  };

  const students = [];
  for (const s of studentsData) {
    const doc = await upsertUser({ email: s.email }, s);
    students.push(doc);
  }
  const teacher = await upsertUser({ email: teacherData.email }, teacherData);

  // --- Clean previous demo polls ---
  await Poll.deleteMany({ title: /^Demo Analytics/ });

  // Common metadata helper
  const metaFor = (u) => ({
    faculty: u.faculty,
    faculty_name: u.faculty,
    program: u.program,
    program_name: u.program,
    course: u.course,
    group: u.group,
    group_id: u.group_id,
    group_name: u.group
  });

  // --- Subject feedback poll ---
  const subjectPoll = new Poll({
    title: 'Demo Analytics: Оценка предмета',
    description: 'Тестовый опрос для дашборда',
    type: 'form',
    pollType: 'subject_feedback',
    questions: [
      { id: 1, text: 'Актуальность темы', type: 'rating', scale: 5, required: true },
      { id: 2, text: 'Понятность объяснения', type: 'rating', scale: 5, required: true },
      { id: 3, text: 'Практическая ценность', type: 'rating', scale: 5, required: true },
      { id: 4, text: 'Что улучшить?', type: 'text_long', required: false }
    ],
    subject_name: 'Машинное обучение',
    teacher_name: teacher.full_name,
    lessonContext: {
      subject: 'Машинное обучение',
      teacher: teacher.full_name,
      group: 'ПИ-201',
      date: daysAgo(3)
    },
    creator_id: teacher._id,
    status: 'active',
    start_date: daysAgo(5),
    end_date: daysAgo(-5),
    responses: []
  });

  const subjResponses = [
    { user: students[0], answers: { 1: 5, 2: 4, 3: 5, 4: 'Больше практики на семинарах' } },
    { user: students[1], answers: { 1: 4, 2: 4, 3: 4, 4: 'Добавить разбор кейсов' } },
    { user: students[2], answers: { 1: 3, 2: 3, 3: 3, 4: 'Снизить темп, много теории' } },
    { user: students[3], answers: { 1: 4, 2: 5, 3: 4, 4: 'Больше примеров из индустрии' } },
    { user: students[4], answers: { 1: 5, 2: 5, 3: 5, 4: 'Все супер' } }
  ];
  subjResponses.forEach((r) => {
    subjectPoll.responses.push({
      user_id: r.user._id,
      answers: r.answers,
      raw_responses: [],
      user_faculty: r.user.faculty,
      user_faculty_name: r.user.faculty,
      user_program: r.user.program,
      user_program_name: r.user.program,
      user_course: r.user.course,
      user_group: r.user.group,
      user_group_name: r.user.group,
      submitted_at: daysAgo(2)
    });
  });

  await subjectPoll.save();

  // --- Teacher feedback poll ---
  const teacherPoll = new Poll({
    title: 'Demo Analytics: Оценка преподавателя',
    description: 'Тестовый опрос teacher_feedback',
    type: 'form',
    pollType: 'teacher_feedback',
    questions: [
      { id: 1, text: 'Понятность объяснений', type: 'rating', scale: 5, required: true },
      { id: 2, text: 'Вовлечённость', type: 'rating', scale: 5, required: true },
      { id: 3, text: 'Отношение к студентам', type: 'rating', scale: 5, required: true },
      { id: 4, text: 'Хотите продолжить обучение у этого преподавателя?', type: 'single_choice', options: ['Да', 'Скорее да', 'Не знаю', 'Скорее нет', 'Нет'], required: true },
      { id: 5, text: 'Комментарий', type: 'text_long', required: false }
    ],
    subject_name: 'Машинное обучение',
    teacher_name: teacher.full_name,
    lessonContext: {
      subject: 'Машинное обучение',
      teacher: teacher.full_name,
      group: 'ПИ-201',
      date: daysAgo(4)
    },
    creator_id: teacher._id,
    status: 'active',
    start_date: daysAgo(6),
    end_date: daysAgo(-4),
    responses: []
  });

  const teacherResponses = [
    { user: students[0], answers: { 1: 5, 2: 5, 3: 5, 4: 'Да', 5: 'Отлично объясняет' } },
    { user: students[1], answers: { 1: 4, 2: 4, 3: 5, 4: 'Да', 5: 'Хочу больше практики' } },
    { user: students[2], answers: { 1: 3, 2: 3, 3: 4, 4: 'Скорее да', 5: 'Слишком быстро' } },
    { user: students[3], answers: { 1: 4, 2: 4, 3: 4, 4: 'Да', 5: 'Все ок' } },
    { user: students[4], answers: { 1: 5, 2: 5, 3: 5, 4: 'Да', 5: 'Примеры класс' } }
  ];
  teacherResponses.forEach((r) => {
    teacherPoll.responses.push({
      user_id: r.user._id,
      answers: r.answers,
      raw_responses: [],
      user_faculty: r.user.faculty,
      user_faculty_name: r.user.faculty,
      user_program: r.user.program,
      user_program_name: r.user.program,
      user_course: r.user.course,
      user_group: r.user.group,
      user_group_name: r.user.group,
      submitted_at: daysAgo(1)
    });
  });

  await teacherPoll.save();

  // --- Teacher self-review (teacher_lesson_review) ---
  const selfPoll = new Poll({
    title: 'Demo Analytics: Отчёт преподавателя',
    description: 'Самооценка занятия',
    type: 'form',
    pollType: 'teacher_lesson_review',
    questions: [
      { id: 1, text: 'Посещаемость', type: 'text_short', required: true },
      { id: 2, text: 'Активность', type: 'rating', scale: 5, required: true },
      { id: 3, text: 'Качество выполнения заданий', type: 'rating', scale: 5, required: true },
      { id: 4, text: 'Изменить рейтинг надёжности', type: 'single_choice', options: ['Оставить без изменений', 'Повысить', 'Понизить'], required: true },
      { id: 5, text: 'Комментарий', type: 'text_long', required: false }
    ],
    teacher_name: teacher.full_name,
    lessonContext: {
      subject: 'Машинное обучение',
      teacher: teacher.full_name,
      group: 'ПИ-201',
      date: daysAgo(1)
    },
    creator_id: teacher._id,
    status: 'active',
    start_date: daysAgo(2),
    end_date: daysAgo(-2),
    responses: []
  });

  const selfAnswers = { 1: '23', 2: 4, 3: 4, 4: 'Оставить без изменений', 5: 'Группа работала ровно, вопросов немного' };
  selfPoll.responses.push({
    user_id: teacher._id,
    answers: selfAnswers,
    raw_responses: [
      { type: 'text', value: 'Низкая явка в начале, потом подтянулись' }
    ],
    user_faculty: 'ФИТ',
    user_faculty_name: 'ФИТ',
    user_program: 'Программная инженерия',
    user_program_name: 'Программная инженерия',
    user_course: 2,
    user_group: 'ПИ-201',
    user_group_name: 'ПИ-201',
    submitted_at: daysAgo(1)
  });

  await selfPoll.save();

  console.log('Seed completed: users, subject poll, teacher poll, self-review poll inserted.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
