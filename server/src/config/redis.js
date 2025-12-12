const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  }
});

redis.on('connect', () => {
  console.log('✅ Redis подключен успешно');
});

redis.on('error', (err) => {
  console.error('❌ Ошибка Redis:', err.message);
});

redis.on('ready', () => {
  console.log('✅ Redis готов к работе');
});

redis.on('reconnecting', () => {
  console.log('🔄 Переподключение к Redis...');
});

module.exports = redis;

