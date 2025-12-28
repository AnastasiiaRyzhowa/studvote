const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Poll = require('../models/Poll');
const Vote = require('../models/Vote');
const { authenticate } = require('../middleware/auth');

// Middleware проверки роли админа
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Доступ запрещен. Требуются права администратора.' 
    });
  }
  next();
};

// Применяем authenticate и isAdmin ко всем маршрутам
router.use(authenticate);
router.use(isAdmin);

// GET /api/admin/stats - Общая статистика
router.get('/stats', async (req, res) => {
  try {
    // Подсчет пользователей
    const totalUsers = await User.countDocuments();
    
    // Подсчет по ролям
    const usersByRole = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const roleStats = {
      student: 0,
      teacher: 0,
      admin: 0
    };
    
    usersByRole.forEach(item => {
      roleStats[item._id] = item.count;
    });
    
    // Подсчет опросов
    const totalPolls = await Poll.countDocuments();
    const activePolls = await Poll.countDocuments({ status: 'active' });
    
    // Подсчет голосов
    const totalVotes = await Vote.countDocuments();
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        totalPolls,
        totalVotes,
        activePolls,
        usersByRole: roleStats
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка получения статистики' 
    });
  }
});

// GET /api/admin/polls - Все опросы
router.get('/polls', async (req, res) => {
  try {
    const polls = await Poll.find()
      .populate('creator_id', 'full_name email role')
      .sort({ created_at: -1 })
      .lean();
    
    res.json({
      success: true,
      polls
    });
    
  } catch (error) {
    console.error('Ошибка получения опросов:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка получения опросов' 
    });
  }
});

// GET /api/admin/users - Все пользователи
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ created_at: -1 })
      .lean();
    
    res.json({
      success: true,
      users
    });
    
  } catch (error) {
    console.error('Ошибка получения пользователей:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка получения пользователей' 
    });
  }
});

// DELETE /api/admin/polls/:id - Удалить опрос
router.delete('/polls/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const poll = await Poll.findById(id);
    
    if (!poll) {
      return res.status(404).json({ 
        success: false, 
        message: 'Опрос не найден' 
      });
    }
    
    // Удаляем все голоса связанные с опросом
    await Vote.deleteMany({ poll_id: id });
    
    // Удаляем опрос
    await Poll.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'Опрос успешно удален'
    });
    
  } catch (error) {
    console.error('Ошибка удаления опроса:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка удаления опроса' 
    });
  }
});

module.exports = router;














