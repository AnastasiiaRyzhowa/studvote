// backend/src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const redis = require('./config/redis');

const app = express();

// Подключение к базам данных
connectDB();

// Логирование всех запросов (ДО CORS чтобы видеть все запросы)
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

// Middleware - CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
});

app.use(express.json());

// Роуты
const authRoutes = require('./routes/authRoutes');
const pollRoutes = require('./routes/pollRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adminUsersRoutes = require('./routes/admin/usersRoutes');
const directoryRoutes = require('./routes/directoryRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const userRoutes = require('./routes/userRoutes');
const detailedAnalyticsRoutes = require('./routes/detailedAnalyticsRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/analytics', detailedAnalyticsRoutes);
app.use('/api/directory', directoryRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', userRoutes);

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