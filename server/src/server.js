// backend/src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const redis = require('./config/redis');

const app = express();

// Подключение к базам данных
connectDB();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Роуты
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'StudVote работает!',
    timestamp: new Date(),
    services: {
      mongodb: 'connected',
      redis: redis.status === 'ready' ? 'connected' : 'connecting'
    }
  });
});

// Обработка несуществующих роутов (Express 5.x compatible)
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'Роут не найден'
  });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Глобальная ошибка:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Внутренняя ошибка сервера'
  });
});

// Запуск сервера
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('\n🚀 ═══════════════════════════════════════════════════');
  console.log(`   Сервер StudVote запущен на порту ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('═══════════════════════════════════════════════════\n');
});