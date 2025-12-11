const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('MongoDB подключен успешно');
    console.log('База данных:', mongoose.connection.name);
    
  } catch (error) {
    console.error('Ошибка подключения к MongoDB:', error.message);
    process.exit(1); // Останавливаем сервер если БД не подключилась
  }
};

// События MongoDB
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB отключен');
});

mongoose.connection.on('error', (err) => {
  console.error('Ошибка MongoDB:', err);
});

module.exports = connectDB;