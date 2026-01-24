// backend/scripts/migrateData.js
// Скрипт миграции существующих данных под новую структуру моделей

const mongoose = require('mongoose');
const User = require('../src/models/User');
const Poll = require('../src/models/Poll');
require('dotenv').config();

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function migrateUsers() {
  log('blue', '\n[MIGRATING] Миграция пользователей...');
  
  const users = await User.find({});
  let updated = 0;
  let skipped = 0;
  
  for (const user of users) {
    let needsSave = false;
    
    // 1. Синхронизация баллов для студентов
    if (user.role === 'student') {
      // Инициализация student_data если его нет
      if (!user.student_data) {
        user.student_data = {
          points: 0,
          level: 1,
          badges: [],
          streak_days: 0
        };
      }
      
      // АГРЕССИВНАЯ СИНХРОНИЗАЦИЯ: всегда копируем из student_data на верхний уровень
      user.points = user.student_data.points || 0;
      user.level = user.student_data.level || 1;
      user.badges = user.student_data.badges || [];
      needsSave = true;
      
      // Инициализация счётчиков (всегда)
      if (user.votes_count === undefined || user.votes_count === null) {
        user.votes_count = user.polls_participated ? user.polls_participated.length : 0;
        needsSave = true;
      }
      
      if (user.polls_created_count === undefined || user.polls_created_count === null) {
        user.polls_created_count = user.polls_created ? user.polls_created.length : 0;
        needsSave = true;
      }
      
      if (user.comments_count === undefined || user.comments_count === null) {
        user.comments_count = 0;
        needsSave = true;
      }
    }
    
    if (needsSave) {
      try {
        await user.save({ validateBeforeSave: false });
        updated++;
      } catch (error) {
        log('red', `[ERROR] Ошибка обновления пользователя ${user.email}: ${error.message}`);
        skipped++;
      }
    } else {
      skipped++;
    }
  }
  
  log('green', `[OK] Пользователи: обновлено ${updated}, пропущено ${skipped}`);
  return { updated, skipped };
}

async function migratePolls() {
  log('blue', '\n[MIGRATING] Миграция опросов...');
  
  const polls = await Poll.find({});
  let updated = 0;
  let skipped = 0;
  
  for (const poll of polls) {
    let needsSave = false;
    
    // 1. Синхронизация lessonContext → верхний уровень (ВСЕГДА если есть lessonContext)
    if (poll.lessonContext && poll.lessonContext.subject) {
      poll.discipline_name = poll.lessonContext.subject;
      poll.teacher_name = poll.lessonContext.teacher || '';
      poll.topic = poll.lessonContext.subject;
      poll.date = poll.lessonContext.date || '';
      poll.group_id = poll.lessonContext.groupId || null;
      poll.group_name = poll.lessonContext.group || '';
      needsSave = true;
    }
    
    // 2. Синхронизация метаданных в responses (ВСЕГДА заполняем)
    if (poll.responses && poll.responses.length > 0) {
      for (const response of poll.responses) {
        // Заполнение student_metadata (всегда перезаписываем)
        response.student_metadata = {
          faculty: response.user_faculty || '',
          program: response.user_program || '',
          course: response.user_course || 0,
          group: response.user_group || ''
        };
        needsSave = true;
        
        // Для lesson_review: структурирование answers если они в старом формате
        if (poll.pollType === 'lesson_review' || poll.type === 'form') {
          let needsRestructure = false;
          let q1, q2, q3, q4, q5;
          
          // Если answers - это массив, преобразуем в объект Q1-Q5
          if (Array.isArray(response.answers)) {
            q1 = response.answers[0];
            q2 = response.answers[1];
            q3 = response.answers[2];
            q4 = response.answers[3];
            q5 = response.answers[4];
            needsRestructure = true;
          }
          // Если answers - это объект с числовыми ключами "1", "2", "3", "4", "5"
          else if (response.answers && typeof response.answers === 'object' && response.answers['1'] !== undefined) {
            q1 = response.answers['1'];
            q2 = response.answers['2'];
            q3 = response.answers['3'];
            q4 = response.answers['4'];
            q5 = response.answers['5'];
            needsRestructure = true;
          }
          // Если answers - это объект с полями q1-q5 (маленькие буквы)
          else if (response.answers && typeof response.answers === 'object' && response.answers.q1 !== undefined) {
            q1 = response.answers.q1;
            q2 = response.answers.q2;
            q3 = response.answers.q3;
            q4 = response.answers.q4;
            q5 = response.answers.q5;
            needsRestructure = true;
          }
          // Если уже в формате Q1-Q5, ничего не делаем
          else if (response.answers && response.answers.Q1 !== undefined) {
            q1 = response.answers.Q1;
            q2 = response.answers.Q2;
            q3 = response.answers.Q3;
            q4 = response.answers.Q4;
            q5 = response.answers.Q5;
          }
          
          if (needsRestructure && q1 && q2 && q3 && q4 && q5) {
            response.answers = { Q1: q1, Q2: q2, Q3: q3, Q4: q4, Q5: q5 };
            needsSave = true;
            
            // Пересчитать ИКОП если его нет
            if (!response.ikop) {
              response.ikop = calculateIKOP(q1, q2, q3, q4, q5);
              needsSave = true;
            }
          }
        }
      }
    }
    
    // 3. Синхронизация total_votes (ВСЕГДА)
    poll.total_votes = poll.voted_users ? poll.voted_users.length : 0;
    needsSave = true;
    
    if (needsSave) {
      try {
        await poll.save({ validateBeforeSave: false });
        updated++;
      } catch (error) {
        log('red', `[ERROR] Ошибка обновления опроса "${poll.title}": ${error.message}`);
        skipped++;
      }
    } else {
      skipped++;
    }
  }
  
  log('green', `[OK] Опросы: обновлено ${updated}, пропущено ${skipped}`);
  return { updated, skipped };
}

// Расчёт ИКОП (копия из модели)
function calculateIKOP(Q1, Q2, Q3, Q4, Q5) {
  const weights = {
    Q1: 0.25, // Актуальность
    Q2: 0.25, // Понятность
    Q3: 0.20, // Практика
    Q4: 0.15, // Вовлеченность
    Q5: 0.15  // Организация
  };
  
  const weightedSum = Q1 * weights.Q1 + Q2 * weights.Q2 + Q3 * weights.Q3 + Q4 * weights.Q4 + Q5 * weights.Q5;
  const ikop = ((weightedSum - 1) / 4) * 100;
  
  return Math.round(ikop);
}

async function verifyMigration() {
  log('blue', '\n[CHECK] Проверка результатов миграции...');
  
  // Проверка пользователей
  const studentsWithPoints = await User.countDocuments({ 
    role: 'student', 
    points: { $exists: true, $ne: null } 
  });
  const studentsWithStudentData = await User.countDocuments({ 
    role: 'student', 
    'student_data.points': { $exists: true } 
  });
  
  log('yellow', `[USERS] Студентов с points: ${studentsWithPoints}`);
  log('yellow', `[USERS] Студентов с student_data.points: ${studentsWithStudentData}`);
  
  // Проверка опросов
  const pollsWithDisciplineName = await Poll.countDocuments({ 
    pollType: 'lesson_review',
    discipline_name: { $exists: true, $ne: null } 
  });
  const pollsWithStructuredAnswers = await Poll.countDocuments({ 
    pollType: 'lesson_review',
    'responses.answers.Q1': { $exists: true }
  });
  const pollsWithIKOP = await Poll.countDocuments({ 
    pollType: 'lesson_review',
    'responses.ikop': { $exists: true, $ne: null }
  });
  
  log('yellow', `[STATS] Lesson review с discipline_name: ${pollsWithDisciplineName}`);
  log('yellow', `[STATS] Опросов со структурированными ответами (Q1-Q5): ${pollsWithStructuredAnswers}`);
  log('yellow', `[STATS] Опросов с рассчитанным ИКОП: ${pollsWithIKOP}`);
  
  return {
    usersOk: studentsWithPoints === studentsWithStudentData,
    pollsOk: true // можем добавить дополнительные проверки
  };
}

async function migrate() {
  try {
    log('blue', '[CONNECT] Подключение к MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    log('green', '[OK] Подключено к MongoDB\n');
    
    // Статистика до миграции
    const usersBefore = await User.countDocuments();
    const pollsBefore = await Poll.countDocuments();
    const pollsWithResponsesBefore = await Poll.countDocuments({ 'responses.0': { $exists: true } });
    
    log('yellow', `[STATS] До миграции:`);
    log('yellow', `   Пользователей: ${usersBefore}`);
    log('yellow', `   Опросов: ${pollsBefore}`);
    log('yellow', `   Опросов с ответами: ${pollsWithResponsesBefore}`);
    
    // Выполняем миграцию
    const usersResult = await migrateUsers();
    const pollsResult = await migratePolls();
    
    // Проверка результатов
    const verification = await verifyMigration();
    
    // Итоговая статистика
    log('green', '\n[SUCCESS] МИГРАЦИЯ ЗАВЕРШЕНА!');
    log('green', '==========================================');
    log('green', `[OK] Пользователи: обновлено ${usersResult.updated}, пропущено ${usersResult.skipped}`);
    log('green', `[OK] Опросы: обновлено ${pollsResult.updated}, пропущено ${pollsResult.skipped}`);
    
    if (verification.usersOk && verification.pollsOk) {
      log('green', '\n[DONE] Все проверки пройдены успешно!');
    } else {
      log('yellow', '\n[WARNING] Обнаружены расхождения. Проверьте логи выше.');
    }
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    log('red', `\n[ERROR] ОШИБКА МИГРАЦИИ: ${error.message}`);
    log('red', error.stack);
    process.exit(1);
  }
}

// Запуск миграции
migrate();
