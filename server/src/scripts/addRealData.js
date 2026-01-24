// Скрипт для добавления РЕАЛЬНЫХ данных в профиль пользователя
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

const addRealData = async () => {
  try {
    await connectDB();

    // Получаем текущего пользователя
    const userEmail = process.argv[2];
    
    if (!userEmail) {
      console.log('❌ Укажите email пользователя');
      console.log('Использование: node addRealData.js <email>');
      console.log('Пример: node addRealData.js 565566@edu.fa.ru');
      process.exit(1);
    }

    const user = await User.findOne({ email: userEmail });
    
    if (!user) {
      console.log(`❌ Пользователь с email ${userEmail} не найден`);
      process.exit(1);
    }

    console.log(`✅ Найден пользователь: ${user.full_name} (${user.email})`);

    // 1. Находим РЕАЛЬНЫЕ опросы в системе (не созданные текущим пользователем)
    console.log('\n🔍 Поиск реальных опросов в системе...');
    
    const realPolls = await Poll.find({ 
      creator_id: { $ne: user._id },
      status: { $in: ['active', 'completed'] }
    })
    .sort({ created_at: -1 })
    .limit(15);

    if (realPolls.length === 0) {
      console.log('⚠️  В системе нет доступных опросов для голосования');
      console.log('💡 Создайте несколько опросов в интерфейсе или импортируйте тестовые данные');
      process.exit(0);
    }

    console.log(`✅ Найдено ${realPolls.length} реальных опросов в системе`);

    // 2. Добавляем голоса в реальные опросы
    console.log('\n🗳️  Добавление голосований в реальные опросы...');
    
    // Берем случайное количество опросов (от 5 до 10, но не больше доступных)
    const numVotes = Math.min(Math.floor(Math.random() * 6) + 5, realPolls.length);
    const selectedPolls = realPolls.slice(0, numVotes);
    
    // Даты голосований - распределяем реалистично
    const now = Date.now();
    const voteDates = selectedPolls.map((_, index) => {
      // Распределяем от 2 часов назад до 30 дней назад
      const hoursAgo = Math.floor(Math.random() * 24 * 30) + 2;
      return new Date(now - hoursAgo * 60 * 60 * 1000);
    }).sort((a, b) => b - a); // Сортируем от новых к старым

    const addedVotes = [];
    let earnedPoints = 0;

    for (let i = 0; i < selectedPolls.length; i++) {
      const poll = selectedPolls[i];
      
      // Проверяем наличие вопросов (для форм) или опций (для простых опросов)
      const hasQuestions = poll.questions && poll.questions.length > 0;
      const hasOptions = poll.options && poll.options.length > 0;
      
      if (!hasQuestions && !hasOptions) {
        console.log(`  ⏭️  Пропущен: "${poll.title.substring(0, 50)}..." (нет вопросов/опций)`);
        continue;
      }
      
      // Проверяем, не голосовал ли уже пользователь
      const existingVote = await Vote.findOne({
        user_id: user._id,
        poll_id: poll._id
      });

      if (existingVote) {
        console.log(`  ⏭️  Пропущен: "${poll.title.substring(0, 50)}..." (уже проголосовали)`);
        continue;
      }

      // Формируем данные голоса в зависимости от типа опроса
      let voteData = {
        user_id: user._id,
        poll_id: poll._id,
        points_earned: 10,
        voted_at: voteDates[i]
      };

      // Если это форма/опрос с вопросами
      if (hasQuestions) {
        const answers = {};
        
        poll.questions.forEach((question) => {
          const qId = question.id || question._id;
          
          if (question.type === 'rating' || question.type === 'rating_1_5') {
            // Рейтинг от 3 до 5
            answers[qId] = Math.floor(Math.random() * 3) + 3;
          } else if (question.type === 'yes_no' || question.type === 'binary') {
            // Да/Нет
            answers[qId] = Math.random() > 0.3 ? 'yes' : 'no';
          } else if (question.type === 'text' || question.type === 'text_short' || question.type === 'text_long') {
            // Текстовый ответ
            answers[qId] = 'Отличное занятие, все понятно!';
          } else if (question.type === 'choice' || question.type === 'single_choice') {
            // Выбор из вариантов
            if (question.options && question.options.length > 0) {
              const randomIdx = Math.floor(Math.random() * question.options.length);
              answers[qId] = question.options[randomIdx];
            }
          } else if (question.type === 'multiple_choice') {
            // Множественный выбор
            if (question.options && question.options.length > 0) {
              const numChoices = Math.min(Math.floor(Math.random() * 2) + 1, question.options.length);
              const selected = [];
              while (selected.length < numChoices) {
                const idx = Math.floor(Math.random() * question.options.length);
                const option = question.options[idx];
                if (!selected.includes(option)) {
                  selected.push(option);
                }
              }
              answers[qId] = selected;
            }
          }
        });
        
        voteData.answers = answers;
        voteData.option_ids = [0]; // Заглушка для валидации
      } 
      // Если это простой опрос с options
      else if (hasOptions) {
        if (poll.type === 'rating') {
          // Для рейтинга - выставляем оценки всем вопросам
          const ratings = {};
          poll.options.forEach((_, idx) => {
            ratings[idx] = Math.floor(Math.random() * 3) + 3; // Оценки от 3 до 5
          });
          voteData.option_ids = poll.options.map((_, idx) => idx);
          voteData.ratings = ratings;
        } else if (poll.type === 'single') {
          // Для одиночного выбора - случайный вариант
          const randomOption = Math.floor(Math.random() * poll.options.length);
          voteData.option_ids = [randomOption];
        } else if (poll.type === 'multiple') {
          // Для множественного - 1-3 случайных варианта
          const numOptions = Math.min(Math.floor(Math.random() * 3) + 1, poll.options.length);
          const selectedOptions = [];
          while (selectedOptions.length < numOptions) {
            const option = Math.floor(Math.random() * poll.options.length);
            if (!selectedOptions.includes(option)) {
              selectedOptions.push(option);
            }
          }
          voteData.option_ids = selectedOptions.sort((a, b) => a - b);
        }
      }

      // Создаём голос
      const vote = await Vote.create(voteData);
      addedVotes.push(vote);
      earnedPoints += 10;
      
      // Обновляем счетчики в опросе
      poll.total_votes = (poll.total_votes || 0) + 1;
      
      // Обновляем счетчики конкретных опций (только для простых опросов)
      if (hasOptions && poll.type !== 'rating' && voteData.option_ids) {
        voteData.option_ids.forEach(optionIdx => {
          if (poll.options[optionIdx]) {
            poll.options[optionIdx].votes_count = (poll.options[optionIdx].votes_count || 0) + 1;
          }
        });
      }
      
      await poll.save();
      
      // Красивый вывод с обрезкой длинных названий
      const shortTitle = poll.title.length > 60 
        ? poll.title.substring(0, 60) + '...' 
        : poll.title;
      console.log(`  ✓ Проголосовали в: "${shortTitle}"`);
      console.log(`    📅 ${voteDates[i].toLocaleString('ru-RU', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })} | +10 баллов`);
    }

    // 3. Обновляем баллы пользователя
    if (earnedPoints > 0) {
      console.log('\n💰 Обновление баллов пользователя...');
      
      const totalVotes = await Vote.countDocuments({ user_id: user._id });
      
      if (user.role === 'student' && user.student_data) {
        const oldPoints = user.student_data.points || 0;
        user.student_data.points = oldPoints + earnedPoints;
        await user.save();
        console.log(`  ✓ Было: ${oldPoints} баллов`);
        console.log(`  ✓ Добавлено: ${earnedPoints} баллов`);
        console.log(`  ✓ Стало: ${user.student_data.points} баллов`);
      }

      // 4. Итоговая статистика
      console.log('\n📊 Итоговая статистика:');
      console.log(`  • Новых голосований: ${addedVotes.length}`);
      console.log(`  • Всего голосований: ${totalVotes}`);
      console.log(`  • Заработано баллов: +${earnedPoints}`);
      console.log(`  • Всего баллов: ${user.student_data?.points || 0}`);
      
      console.log('\n✅ Реальные данные успешно добавлены!');
      console.log('🌐 Обновите страницу профиля в браузере');
    } else {
      console.log('\n⚠️  Не удалось добавить новые голоса (возможно, уже проголосовали во всех доступных опросах)');
    }

  } catch (error) {
    console.error('❌ Ошибка при добавлении данных:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Соединение с БД закрыто');
    process.exit(0);
  }
};

// Запуск скрипта
addRealData();
