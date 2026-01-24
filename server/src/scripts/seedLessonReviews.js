#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const Poll = require('../models/Poll');
const User = require('../models/User');

// ==================== КОНФИГУРАЦИЯ ====================

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI не задан в .env файле');
  process.exit(1);
}

// Утилита для дат
const now = new Date();
const daysAgo = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

// ==================== ДАННЫЕ ====================

// Факультеты и программы
const faculties = [
  { 
    code: 'ФКН', 
    name: 'Факультет компьютерных наук',
    programs: [
      { code: 'ПИ', name: 'Программная инженерия' },
      { code: 'ИВТ', name: 'Информатика и вычислительная техника' },
      { code: 'ИБ', name: 'Информационная безопасность' }
    ]
  },
  { 
    code: 'ФЭК', 
    name: 'Факультет экономики',
    programs: [
      { code: 'ЭК', name: 'Экономика' },
      { code: 'МЕН', name: 'Менеджмент' }
    ]
  }
];

// Дисциплины по факультетам
const disciplines = {
  'ФКН': [
    { name: 'Базы данных', teacher: 'Петров Петр Петрович' },
    { name: 'Алгоритмы и структуры данных', teacher: 'Иванов Иван Иванович' },
    { name: 'Веб-программирование', teacher: 'Сидорова Анна Сергеевна' },
    { name: 'Машинное обучение', teacher: 'Козлов Дмитрий Александрович' },
    { name: 'Системное программирование', teacher: 'Смирнов Игорь Владимирович' }
  ],
  'ФЭК': [
    { name: 'Микроэкономика', teacher: 'Федоров Федор Федорович' },
    { name: 'Макроэкономика', teacher: 'Николаева Елена Игоревна' },
    { name: 'Финансы и кредит', teacher: 'Морозов Андрей Николаевич' }
  ]
};

// ==================== ФУНКЦИИ ГЕНЕРАЦИИ ====================

/**
 * Создать или обновить пользователя
 */
async function upsertUser(filter, data) {
  return User.findOneAndUpdate(
    filter,
    { ...data, is_active: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/**
 * Генерация случайной оценки с весами (больше хороших оценок)
 */
function randomRating() {
  const rand = Math.random();
  if (rand < 0.5) return 5;  // 50% - отлично
  if (rand < 0.8) return 4;  // 30% - хорошо
  if (rand < 0.95) return 3; // 15% - средне
  if (rand < 0.98) return 2; // 3% - плохо
  return 1;                   // 2% - очень плохо
}

/**
 * Расчёт ИКОП из оценок Q1-Q5
 */
function calculateIKOP(q1, q2, q3, q4, q5) {
  const avgRating = (q1 + q2 + q3 + q4 + q5) / 5;
  return Math.round(((avgRating - 1) / 4) * 100);
}

/**
 * Генерация комментария на основе среднего балла
 */
function generateComment(avgRating) {
  if (avgRating >= 4.5) {
    const positive = [
      'Отличное занятие! Всё понятно.',
      'Преподаватель отлично объясняет материал.',
      'Очень интересная тема, хочется узнать больше.',
      'Примеры из практики очень помогают.',
      'Всё на высшем уровне!'
    ];
    return positive[Math.floor(Math.random() * positive.length)];
  } else if (avgRating >= 3.5) {
    const neutral = [
      'Неплохо, но хотелось бы больше практики.',
      'Тема интересная, но немного сложная.',
      'Хорошо, но темп слишком быстрый.',
      'В целом понятно, но есть вопросы.',
      ''
    ];
    return neutral[Math.floor(Math.random() * neutral.length)];
  } else {
    const negative = [
      'Слишком сложно, не успеваю.',
      'Хотелось бы больше примеров.',
      'Тема непонятна, нужно повторить.',
      'Слишком много теории.',
      ''
    ];
    return negative[Math.floor(Math.random() * negative.length)];
  }
}

/**
 * Создание студентов для факультета
 */
async function createStudents(faculty, program, course, groupName, count) {
  const students = [];
  for (let i = 1; i <= count; i++) {
    const student = await upsertUser(
      { email: `student_${faculty.code}_${program.code}_${course}_${i}@edu.fa.ru` },
      {
        email: `student_${faculty.code}_${program.code}_${course}_${i}@edu.fa.ru`,
        full_name: `${faculty.code} Студент ${program.code}-${course}${i}`,
        role: 'student',
        faculty: faculty.code,
        faculty_name: faculty.name,
        program: program.code,
        program_name: program.name,
        course: course,
        group: groupName,
        group_id: parseInt(`${course}0${i}`, 10),
        group_name: groupName,
        student_id: `${faculty.code}${program.code}${course}${String(i).padStart(3, '0')}`,
        student_data: {
          points: 0,
          level: 1,
          badges: [],
          streak_days: 0
        }
      }
    );
    students.push(student);
  }
  return students;
}

/**
 * Создание lesson_review опроса с ответами
 */
async function createLessonReviewPoll(discipline, teacher, students, facultyObj, programObj, daysOffset) {
  const pollDate = daysAgo(daysOffset);
  const group = students[0].group;
  const course = students[0].course;

  console.log(`  📝 Создание опроса: ${discipline} (${teacher.full_name})`);

  const poll = new Poll({
    title: `Оценка занятия: ${discipline}`,
    description: `Оцените качество проведённого занятия по дисциплине "${discipline}"`,
    type: 'form',
    pollType: 'lesson_review',
    
    // ✅ ДОБАВЛЕНО: Поля на уровне Poll для фильтрации API
    faculty: facultyObj.code,              // 'ФКН'
    faculty_name: facultyObj.name,         // 'Факультет компьютерных наук'
    program: programObj.code,              // 'ПИ'
    program_name: programObj.name,         // 'Программная инженерия'
    course: course,                        // 2 или 3
    
    // Контекст занятия
    lessonContext: {
      subject: discipline,
      teacher: teacher.full_name,
      date: pollDate,
      time: '10:00-11:30',
      beginLesson: '10:00',
      endLesson: '11:30',
      topic: `Лекция по теме "${discipline}"`,
      auditorium: 'Ауд. 201',
      room: 'Ауд. 201',
      lessonType: 'Лекция',
      group: group,
      groupId: students[0].group_id?.toString() || group
    },
    
    // Дубликаты для совместимости с админкой
    subject_name: discipline,
    discipline_name: discipline,
    teacher_name: teacher.full_name,
    group_name: group,
    group_id: students[0].group_id,
    date: pollDate.toISOString().split('T')[0],
    topic: discipline,
    
    // Стандартные 5 вопросов для lesson_review
    questions: [
      { 
        id: 'q1_relevance', 
        text: 'Актуальность материала', 
        type: 'rating', 
        scale: 5, 
        required: true,
        weight: 0.25,
        block: 'content'
      },
      { 
        id: 'q2_clarity', 
        text: 'Понятность изложения', 
        type: 'rating', 
        scale: 5, 
        required: true,
        weight: 0.3,
        block: 'methodology'
      },
      { 
        id: 'q3_practice', 
        text: 'Практическая ценность', 
        type: 'rating', 
        scale: 5, 
        required: true,
        weight: 0.2,
        block: 'content'
      },
      { 
        id: 'q4_engagement', 
        text: 'Вовлечённость студентов', 
        type: 'rating', 
        scale: 5, 
        required: true,
        weight: 0.15,
        block: 'methodology'
      },
      { 
        id: 'q5_organization', 
        text: 'Организация занятия', 
        type: 'rating', 
        scale: 5, 
        required: true,
        weight: 0.1,
        block: 'other'
      },
      { 
        id: 'q6_comment', 
        text: 'Комментарий (необязательно)', 
        type: 'text', 
        required: false
      }
    ],
    
    creator_id: teacher._id,
    creator_role: 'teacher',
    status: 'active',
    start_date: pollDate,
    end_date: daysAgo(daysOffset - 7),
    
    // Таргетинг
    target_groups: [group],
    target_faculties: [facultyObj.code],
    target_programs: [programObj.code],
    target_courses: [course],
    
    responses: []
  });

  // Генерация ответов от студентов (70-90% откликаемость)
  const responseCount = Math.floor(students.length * (0.7 + Math.random() * 0.2));
  const respondents = students
    .sort(() => Math.random() - 0.5)
    .slice(0, responseCount);

  for (const student of respondents) {
    const q1 = randomRating();
    const q2 = randomRating();
    const q3 = randomRating();
    const q4 = randomRating();
    const q5 = randomRating();
    const ikop = calculateIKOP(q1, q2, q3, q4, q5);
    const avgRating = (q1 + q2 + q3 + q4 + q5) / 5;
    const comment = Math.random() > 0.5 ? generateComment(avgRating) : '';

    poll.responses.push({
      user_id: student._id,
      
      // Ответы Q1-Q5 + комментарий
      answers: {
        q1_relevance: q1,
        q2_clarity: q2,
        q3_practice: q3,
        q4_engagement: q4,
        q5_organization: q5,
        q6_comment: comment,
        // Дубликаты для совместимости со старым форматом
        Q1: q1,
        Q2: q2,
        Q3: q3,
        Q4: q4,
        Q5: q5
      },
      
      comment: comment,
      ikop: ikop,
      
      // Технические проблемы (10% вероятность)
      technical_issues: {
        has_issues: Math.random() < 0.1,
        selected: Math.random() < 0.1 ? ['Проблемы с техникой'] : [],
        description: ''
      },
      
      // Метаданные студента (КРИТИЧНО для аналитики!)
      user_faculty: student.faculty,
      user_faculty_name: student.faculty_name || student.faculty,
      user_program: student.program,
      user_program_name: student.program_name || student.program,
      user_course: student.course,
      user_group: student.group,
      user_group_name: student.group_name || student.group,
      
      // Дубликат для совместимости с UI
      student_metadata: {
        faculty: student.faculty,
        program: student.program,
        course: student.course,
        group: student.group
      },
      
      submitted_at: new Date(pollDate.getTime() + Math.random() * 2 * 24 * 60 * 60 * 1000)
    });
  }

  poll.total_votes = poll.responses.length;
  poll.target_count = students.length;
  poll.max_responses = students.length;

  await poll.save();
  
  const avgIkop = poll.responses.reduce((sum, r) => sum + r.ikop, 0) / poll.responses.length;
  console.log(`     ✅ Создан опрос с ${poll.responses.length}/${students.length} ответами, средний ИКОП: ${Math.round(avgIkop)}`);
  
  return poll;
}

// ==================== ОСНОВНАЯ ФУНКЦИЯ ====================

async function seed() {
  try {
    console.log('🌱 Запуск seed для lesson_review опросов...\n');
    
    // Подключение к MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Подключено к MongoDB:', mongoose.connection.name);
    console.log('');

    // Удаление старых демо-опросов
    console.log('🗑️  Удаление старых демо-данных...');
    await Poll.deleteMany({ title: /^Оценка занятия:/ });
    console.log('   ✅ Очищено\n');

    // Создание преподавателей
    console.log('👨‍🏫 Создание преподавателей...');
    const teachers = [];
    for (const faculty of faculties) {
      for (const disc of disciplines[faculty.code]) {
        const teacher = await upsertUser(
          { email: `teacher_${disc.name.toLowerCase().replace(/\s+/g, '_')}@fa.ru` },
          {
            email: `teacher_${disc.name.toLowerCase().replace(/\s+/g, '_')}@fa.ru`,
            full_name: disc.teacher,
            role: 'teacher',
            department: `Кафедра ${faculty.name}`,
            ruz_teacher_id: `t-${teachers.length + 1}`,
            ruz_teacher_name: disc.teacher
          }
        );
        teachers.push({ teacher, discipline: disc.name, faculty: faculty.code });
      }
    }
    console.log(`   ✅ Создано ${teachers.length} преподавателей\n`);

    // Создание студентов и опросов
    console.log('👨‍🎓 Создание студентов и опросов...\n');
    let totalPolls = 0;
    let totalResponses = 0;

    for (const faculty of faculties) {
      console.log(`📁 Факультет: ${faculty.name}`);
      
      for (const program of faculty.programs) {
        console.log(`  📂 Программа: ${program.name}`);
        
        // Создаём группы на 2 курсах
        for (let course = 2; course <= 3; course++) {
          const groupName = `${program.code}-${course}01`;
          console.log(`    📚 Курс ${course}, Группа: ${groupName}`);
          
          // Создаём 15-25 студентов в группе
          const studentCount = 15 + Math.floor(Math.random() * 11);
          const students = await createStudents(faculty, program, course, groupName, studentCount);
          console.log(`       ✅ Создано ${students.length} студентов`);
          
          // Создаём опросы для каждой дисциплины факультета
          const facultyDisciplines = disciplines[faculty.code];
          for (let i = 0; i < facultyDisciplines.length; i++) {
            const disc = facultyDisciplines[i];
            const teacherData = teachers.find(t => 
              t.discipline === disc.name && t.faculty === faculty.code
            );
            
            if (teacherData) {
              // Создаём 2-3 опроса на дисциплину (разные недели)
              const pollsCount = 2 + Math.floor(Math.random() * 2);
              for (let j = 0; j < pollsCount; j++) {
                const daysOffset = 7 + i * 7 + j * 7; // разные недели
                const poll = await createLessonReviewPoll(
                  disc.name,
                  teacherData.teacher,
                  students,
                  faculty,      // ✅ Передаем объект faculty
                  program,      // ✅ Передаем объект program
                  daysOffset
                );
                totalPolls++;
                totalResponses += poll.responses.length;
              }
            }
          }
          console.log('');
        }
      }
      console.log('');
    }

    // Итоги
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎉 Seed завершён успешно!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ Создано преподавателей: ${teachers.length}`);
    console.log(`✅ Создано опросов: ${totalPolls}`);
    console.log(`✅ Создано ответов: ${totalResponses}`);
    console.log(`✅ Средняя откликаемость: ${Math.round(totalResponses / totalPolls)} ответов на опрос`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('📊 Теперь можно проверить экспорт аналитики:');
    console.log('   1. Войдите как администратор');
    console.log('   2. Перейдите в "Дашборд качества образования"');
    console.log('   3. Нажмите "Экспортировать" → "Excel (сырые данные)"');
    console.log('   4. Проверьте файл Excel с данными ИКОП\n');

  } catch (error) {
    console.error('❌ Ошибка:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('👋 Отключено от MongoDB');
  }
}

// ==================== ЗАПУСК ====================

seed()
  .then(() => {
    console.log('\n✅ Скрипт выполнен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Скрипт завершился с ошибкой:', error);
    process.exit(1);
  });
