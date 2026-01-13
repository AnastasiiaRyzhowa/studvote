const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Poll = require('../models/Poll');
const Vote = require('../models/Vote');
const GroupReliabilityEvent = require('../models/GroupReliabilityEvent');
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

// POST /api/admin/reliability/:groupId/event - Добавить событие надёжности (админ)
router.post('/reliability/:groupId/event', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { delta, reason = '', evidence_url = null } = req.body;

    const parsedDelta = Number(delta);
    if (!Number.isFinite(parsedDelta) || parsedDelta === 0) {
      return res.status(400).json({
        success: false,
        message: 'delta должен быть ненулевым числом'
      });
    }

    const event = await GroupReliabilityEvent.create({
      group_id: groupId,
      delta: parsedDelta,
      reason,
      source: 'admin',
      actor_id: req.user.userId,
      evidence_url
    });

    res.json({
      success: true,
      event
    });
  } catch (error) {
    console.error('Ошибка добавления события надёжности:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка добавления события надёжности'
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

// GET /api/admin/filters - Списки для фильтров (из имеющихся данных)
router.get('/filters', async (req, res) => {
  try {
    const [
      faculties,
      programs,
      courses,
      groups,
      teachers,
      subjects
    ] = await Promise.all([
      User.distinct('faculty'),
      User.distinct('program'),
      User.distinct('course'),
      User.distinct('group'),
      User.find({ role: 'teacher' })
        .select('_id full_name department ruz_teacher_id')
        .lean(),
      Poll.distinct('subject_name')
    ]);

    res.json({
      success: true,
      filters: {
        faculties: faculties.filter(Boolean).sort(),
        programs: programs.filter(Boolean).sort(),
        courses: courses.filter(Boolean).sort(),
        groups: groups.filter(Boolean).sort(),
        teachers: teachers.map(t => ({
          id: t._id,
          name: t.full_name,
          department: t.department,
          ruz_teacher_id: t.ruz_teacher_id
        })),
        subjects: subjects.filter(Boolean).sort()
      }
    });
  } catch (error) {
    console.error('Ошибка получения фильтров:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения фильтров'
    });
  }
});

// GET /api/admin/analytics/group/:groupId - Агрегация по группе
router.get('/analytics/group/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { period = 'week' } = req.query;

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - (period === 'month' ? 30 : 7));

    // Число студентов в группе (для расчёта активности)
    const studentsCount = await User.countDocuments({
      role: 'student',
      $or: [
        { group: groupId },
        { group_id: groupId },
        { group_name: groupId }
      ]
    });

    // Ответы за период по группе
    const responses = await Poll.aggregate([
      { $unwind: '$responses' },
      {
        $match: {
          $and: [
            {
              $or: [
                { 'responses.user_group': groupId },
                { 'responses.user_group_name': groupId }
              ]
            },
            { 'responses.submitted_at': { $gte: startDate } }
          ]
        }
      },
      {
        $project: {
          answers: '$responses.answers',
          submitted_at: '$responses.submitted_at',
          user_id: '$responses.user_id',
          subject_name: '$subject_name',
          lesson_subject: '$lessonContext.subject',
          poll_type: '$type',
          teacher_name: '$teacher_name',
          poll_title: '$title'
        }
      }
    ]);

    const uniqueRespondents = new Set();
    const numericScores = [];
    const disciplineStats = {};
    const comments = [];
    const trendBuckets = new Map();

    const extractNumbers = (answer) => {
      if (typeof answer === 'number') return [answer];
      if (answer && typeof answer === 'object') {
        return Object.values(answer)
          .filter(v => typeof v === 'number')
          .map(v => v);
      }
      return [];
    };

    const maybePushComment = (answer) => {
      if (typeof answer === 'string' && answer.trim().length > 3) {
        comments.push(answer.trim());
      } else if (answer && typeof answer === 'object') {
        Object.values(answer).forEach(v => {
          if (typeof v === 'string' && v.trim().length > 3) {
            comments.push(v.trim());
          }
        });
      }
    };

    const getWeekKey = (date) => {
      const d = new Date(date);
      const onejan = new Date(d.getFullYear(), 0, 1);
      const millis = d - onejan;
      const day = 86400000;
      const week = Math.ceil(((millis / day) + onejan.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${week}`;
    };

    responses.forEach((resp) => {
      if (resp.user_id) uniqueRespondents.add(resp.user_id.toString());

      const nums = extractNumbers(resp.answers);
      nums.forEach(n => numericScores.push(n));

      maybePushComment(resp.answers);

      const disciplineName = resp.subject_name || resp.lesson_subject || 'Без дисциплины';
      if (!disciplineStats[disciplineName]) {
        disciplineStats[disciplineName] = { count: 0, scores: [] };
      }
      disciplineStats[disciplineName].count += 1;
      disciplineStats[disciplineName].scores.push(...nums);

      const weekKey = getWeekKey(resp.submitted_at);
      trendBuckets.set(weekKey, (trendBuckets.get(weekKey) || 0) + 1);
    });

    const activityPercent = studentsCount > 0
      ? Math.round((uniqueRespondents.size / studentsCount) * 100)
      : null;

    const averageScore = numericScores.length > 0
      ? parseFloat((numericScores.reduce((a, b) => a + b, 0) / numericScores.length).toFixed(1))
      : null;

    const disciplines = Object.entries(disciplineStats).map(([name, data]) => ({
      name,
      responses: data.count,
      averageScore: data.scores.length > 0
        ? parseFloat((data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1))
        : null
    })).sort((a, b) => (b.responses || 0) - (a.responses || 0));

    // Тренд по неделям (последние 6 недель)
    const trend = Array.from(trendBuckets.entries())
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .slice(-6)
      .map(([label, value]) => ({ label, value }));

    // Надёжность группы из событий
    const reliabilityEvents = await GroupReliabilityEvent.find({ group_id: groupId })
      .sort({ created_at: 1 })
      .lean();
    const reliabilityScore = reliabilityEvents.reduce((acc, ev) => acc + (ev.delta || 0), 100);
    const reliabilityHistory = reliabilityEvents.slice(-10).map(ev => ({
      date: ev.created_at,
      delta: ev.delta,
      reason: ev.reason,
      source: ev.source,
      actor_id: ev.actor_id
    }));

    res.json({
      success: true,
      analytics: {
        groupId,
        period,
        studentsCount,
        sampleSize: uniqueRespondents.size,
        activityPercent,
        averageScore,
        disciplines,
        trend,
        reliability: {
          score: reliabilityScore,
          history: reliabilityHistory
        },
        comments: comments.slice(-30) // последние 30 комментов
      }
    });
  } catch (error) {
    console.error('Ошибка получения аналитики по группе:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения аналитики по группе'
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





















