// Скрипт для удаления тестовых данных
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

const cleanTestData = async () => {
  try {
    await connectDB();

    const userEmail = process.argv[2];
    
    if (!userEmail) {
      console.log('❌ Укажите email пользователя');
      console.log('Использование: node cleanTestData.js <email>');
      process.exit(1);
    }

    const user = await User.findOne({ email: userEmail });
    
    if (!user) {
      console.log(`❌ Пользователь с email ${userEmail} не найден`);
      process.exit(1);
    }

    console.log(`✅ Найден пользователь: ${user.full_name} (${user.email})`);

    // 1. Удаляем тестовые опросы
    console.log('\n🗑️  Удаление тестовых опросов...');
    
    const testPollTitles = [
      'Оценка качества преподавания',
      'Выбор старосты группы',
      'Предпочтения по времени консультаций'
    ];

    const deletedPolls = await Poll.deleteMany({
      creator_id: user._id,
      title: { $in: testPollTitles }
    });

    console.log(`  ✓ Удалено тестовых опросов: ${deletedPolls.deletedCount}`);

    // 2. Удаляем все голоса пользователя
    console.log('\n🗑️  Удаление голосов пользователя...');
    
    const deletedVotes = await Vote.deleteMany({
      user_id: user._id
    });

    console.log(`  ✓ Удалено голосов: ${deletedVotes.deletedCount}`);

    // 3. Сбрасываем баллы
    console.log('\n💰 Сброс баллов...');
    
    if (user.role === 'student' && user.student_data) {
      const oldPoints = user.student_data.points;
      user.student_data.points = 0;
      await user.save();
      console.log(`  ✓ Сброшено баллов: ${oldPoints} → 0`);
    }

    console.log('\n✅ Тестовые данные удалены!');
    console.log('💡 Теперь можно добавить реальные данные командой:');
    console.log(`   npm run add-real-data ${userEmail}`);

  } catch (error) {
    console.error('❌ Ошибка при очистке:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Соединение с БД закрыто');
    process.exit(0);
  }
};

cleanTestData();
