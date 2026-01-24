// Скрипт для добавления тестовых данных в профиль пользователя
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Poll = require('../models/Poll');
const Vote = require('../models/Vote');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB подключен');
  } catch (error) {
    console.error('❌ Ошибка подключения к MongoDB:', error);
    process.exit(1);
  }
};

const addTestData = async () => {
  try {
    await connectDB();

    // Получаем текущего пользователя (замените email на ваш)
    const userEmail = process.argv[2];
    
    if (!userEmail) {
      console.log('❌ Укажите email пользователя');
      console.log('Использование: node addTestData.js <email>');
      console.log('Пример: node addTestData.js 565566@edu.fa.ru');
      process.exit(1);
    }

    const user = await User.findOne({ email: userEmail });
    
    if (!user) {
      console.log(`❌ Пользователь с email ${userEmail} не найден`);
      process.exit(1);
    }

    console.log(`✅ Найден пользователь: ${user.full_name} (${user.email})`);

    // 1. Создаём тестовые опросы от имени пользователя
    console.log('\n📝 Создание тестовых опросов...');
    
    const testPolls = [
      {
        title: 'Оценка качества преподавания',
        description: 'Оцените качество преподавания по курсу "Математический анализ"',
        type: 'rating',
        visibility: 'public',
        creator_id: user._id,
        options: [
          { text: 'Доступность материала', order: 0 },
          { text: 'Практическая польза', order: 1 },
          { text: 'Качество объяснений', order: 2 }
        ],
        start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 дней назад
        end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // через 7 дней
        status: 'active',
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      },
      {
        title: 'Выбор старосты группы',
        description: 'Голосование за кандидатов на должность старосты группы',
        type: 'single',
        visibility: 'group',
        creator_id: user._id,
        options: [
          { text: 'Иванов Иван', order: 0, votes_count: 12 },
          { text: 'Петрова Мария', order: 1, votes_count: 18 },
          { text: 'Сидоров Петр', order: 2, votes_count: 8 }
        ],
        start_date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        end_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // вчера
        status: 'completed',
        total_votes: 38,
        created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      },
      {
        title: 'Предпочтения по времени консультаций',
        description: 'Когда вам удобнее посещать консультации?',
        type: 'multiple',
        visibility: 'public',
        creator_id: user._id,
        options: [
          { text: 'Утро (9:00-12:00)', order: 0, votes_count: 5 },
          { text: 'День (12:00-15:00)', order: 1, votes_count: 8 },
          { text: 'Вечер (15:00-18:00)', order: 2, votes_count: 12 }
        ],
        start_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        end_date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        status: 'active',
        total_votes: 15,
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      }
    ];

    const createdPolls = [];
    for (const pollData of testPolls) {
      const poll = await Poll.create(pollData);
      createdPolls.push(poll);
      console.log(`  ✓ Создан опрос: "${poll.title}"`);
    }

    // 2. Создаём голоса в других опросах
    console.log('\n🗳️  Создание истории голосований...');
    
    // Находим несколько существующих опросов (не созданных текущим пользователем)
    const existingPolls = await Poll.find({ 
      creator_id: { $ne: user._id },
      status: { $in: ['active', 'completed'] }
    }).limit(5);

    const testVotes = [];
    const voteDates = [
      new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 часа назад
      new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // вчера
      new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // позавчера
      new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 дня назад
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // неделю назад
    ];

    // Если нет чужих опросов, используем свои для тестирования
    const pollsToVote = existingPolls.length > 0 ? existingPolls : createdPolls.slice(0, 3);

    for (let i = 0; i < pollsToVote.length && i < 5; i++) {
      const poll = pollsToVote[i];
      
      // Проверяем, не голосовал ли уже пользователь
      const existingVote = await Vote.findOne({
        user_id: user._id,
        poll_id: poll._id
      });

      if (existingVote) {
        console.log(`  ⏭️  Пропущен опрос "${poll.title}" (уже проголосовали)`);
        continue;
      }

      const voteData = {
        user_id: user._id,
        poll_id: poll._id,
        option_ids: poll.type === 'rating' ? [0, 1, 2] : poll.type === 'single' ? [0] : [0, 1],
        ratings: poll.type === 'rating' ? { 0: 5, 1: 4, 2: 5 } : undefined,
        points_earned: 10,
        voted_at: voteDates[i] || new Date()
      };

      const vote = await Vote.create(voteData);
      testVotes.push(vote);
      
      // Обновляем счетчики в опросе
      poll.total_votes = (poll.total_votes || 0) + 1;
      await poll.save();
      
      console.log(`  ✓ Проголосовали в: "${poll.title}" (+10 баллов)`);
    }

    // 3. Обновляем баллы пользователя
    console.log('\n💰 Обновление баллов пользователя...');
    
    const totalVotes = await Vote.countDocuments({ user_id: user._id });
    const earnedPoints = testVotes.length * 10;
    
    if (user.role === 'student' && user.student_data) {
      user.student_data.points = (user.student_data.points || 0) + earnedPoints;
      await user.save();
      console.log(`  ✓ Добавлено ${earnedPoints} баллов (всего: ${user.student_data.points})`);
    }

    // 4. Итоговая статистика
    console.log('\n📊 Итоговая статистика:');
    console.log(`  • Создано опросов: ${createdPolls.length}`);
    console.log(`  • Новых голосований: ${testVotes.length}`);
    console.log(`  • Всего голосований: ${totalVotes}`);
    console.log(`  • Баллы пользователя: ${user.student_data?.points || 0}`);
    
    console.log('\n✅ Тестовые данные успешно добавлены!');
    console.log('🌐 Обновите страницу профиля в браузере');

  } catch (error) {
    console.error('❌ Ошибка при добавлении тестовых данных:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Соединение с БД закрыто');
    process.exit(0);
  }
};

// Запуск скрипта
addTestData();
