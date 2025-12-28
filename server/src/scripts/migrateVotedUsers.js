/**
 * Миграция для обновления voted_users на основе responses
 * 
 * Проблема: При голосовании в формах массив voted_users не обновлялся,
 * только добавлялись записи в responses. Из-за этого фильтр "Мои голоса" 
 * не работал корректно.
 * 
 * Решение: Синхронизировать voted_users с user_id из responses
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Poll = require('../models/Poll');
const connectDB = require('../config/database');

async function migrateVotedUsers() {
  try {
    console.log('🚀 Запуск миграции voted_users...\n');

    // Подключение к БД
    await connectDB();

    // Находим все опросы типа "form" с responses
    const polls = await Poll.find({
      type: 'form',
      responses: { $exists: true, $ne: [] }
    });

    console.log(`📊 Найдено опросов типа "form" с ответами: ${polls.length}\n`);

    let updatedCount = 0;
    let alreadyCorrectCount = 0;

    for (const poll of polls) {
      // Собираем уникальные user_id из responses
      const userIdsFromResponses = [
        ...new Set(
          poll.responses.map(r => r.user_id.toString())
        )
      ];

      // Собираем существующие user_id из voted_users
      const existingVotedUsers = poll.voted_users 
        ? poll.voted_users.map(id => id.toString())
        : [];

      // Находим user_id, которых нет в voted_users
      const missingUserIds = userIdsFromResponses.filter(
        userId => !existingVotedUsers.includes(userId)
      );

      if (missingUserIds.length > 0) {
        // Обновляем опрос
        if (!poll.voted_users) {
          poll.voted_users = [];
        }

        // Добавляем недостающих пользователей
        missingUserIds.forEach(userId => {
          poll.voted_users.push(new mongoose.Types.ObjectId(userId));
        });

        await poll.save();

        console.log(` Опрос "${poll.title}"`);
        console.log(`   - Добавлено пользователей в voted_users: ${missingUserIds.length}`);
        console.log(`   - Всего ответов: ${poll.responses.length}`);
        console.log(`   - Всего в voted_users: ${poll.voted_users.length}\n`);

        updatedCount++;
      } else {
        alreadyCorrectCount++;
      }
    }

    console.log('\nРЕЗУЛЬТАТЫ МИГРАЦИИ:');
    console.log(`   Обновлено опросов: ${updatedCount}`);
    console.log(`   ℹ Уже корректных: ${alreadyCorrectCount}`);
    console.log(`    Всего проверено: ${polls.length}\n`);

    // Также проверим обычные опросы (single/multiple/rating)
    console.log('🔍 Проверка обычных опросов...\n');

    const regularPolls = await Poll.find({
      type: { $in: ['single', 'multiple', 'rating'] }
    });

    console.log(`Найдено обычных опросов: ${regularPolls.length}`);
    
    let regularPollsWithIssues = 0;
    
    for (const poll of regularPolls) {
      // Для обычных опросов voted_users обновляется через Vote модель
      // Но проверим консистентность
      const votedUsersCount = poll.voted_users ? poll.voted_users.length : 0;
      const totalVotes = poll.total_votes || 0;
      
      if (votedUsersCount !== totalVotes) {
        console.log(`  Несоответствие в опросе "${poll.title}":`);
        console.log(`   voted_users.length: ${votedUsersCount}`);
        console.log(`   total_votes: ${totalVotes}\n`);
        regularPollsWithIssues++;
      }
    }

    if (regularPollsWithIssues > 0) {
      console.log(`\n  Найдено опросов с несоответствиями: ${regularPollsWithIssues}`);
      console.log('   (Это может быть нормально для опросов с множественным выбором)\n');
    } else {
      console.log(' Все обычные опросы корректны\n');
    }

    console.log('🎉 Миграция завершена!');

    process.exit(0);
  } catch (error) {
    console.error(' Ошибка при миграции:', error);
    process.exit(1);
  }
}

// Запуск миграции
migrateVotedUsers();

