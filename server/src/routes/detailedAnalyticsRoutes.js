const express = require('express');
const router = express.Router();
const Poll = require('../models/Poll');
const User = require('../models/User');
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

// GET /api/admin/analytics/detailed - детальная аналитика
router.get('/detailed', async (req, res) => {
  try {
    const { disciplineId, teacherId, period, dateFrom, dateTo, group, topic, faculty, program, course } = req.query;
    
    // Построение фильтра
    const filter = {
      pollType: 'lesson_review',
      status: { $ne: 'deleted' }
    };
    
    // ✅ ДОБАВЛЕНО: Фильтрация по faculty/program/course
    if (faculty && faculty !== 'all' && faculty !== '') {
      filter.faculty = faculty;
    }
    if (program && program !== 'all' && program !== '') {
      filter.program = program;
    }
    if (course && course !== 'all' && course !== '') {
      filter.course = parseInt(course);
    }
    
    // Существующие фильтры
    if (disciplineId && disciplineId !== '') {
      filter['lessonContext.subject'] = disciplineId;
    }
    if (teacherId && teacherId !== '') {
      filter['lessonContext.teacher'] = teacherId;
    }
    if (group && group !== 'all') {
      filter['lessonContext.group'] = group;
    }
    if (topic) {
      filter.title = { $regex: topic, $options: 'i' };
    }
    
    // Фильтр по периоду
    applyPeriodFilter(filter, period, dateFrom, dateTo);
    
    const polls = await Poll.find(filter).sort({ created_at: -1 }).lean();
    
    if (polls.length === 0) {
      return res.json(getEmptyAnalytics());
    }
    
    // Вычисляем все метрики
    const header = buildHeader(disciplineId, teacherId, polls);
    const summary = calculateSummary(polls);
    const ikopDynamics = calculateIKOPDynamics(polls);
    const criteriaDistributions = calculateCriteriaDistributions(polls);
    const comparison = calculateComparison(polls);
    const topicsRanking = rankTopics(polls);
    const lessons = prepareLessonsList(polls);
    const comments = prepareComments(polls);
    const availableGroups = getAvailableGroups(polls);
    
    res.json({
      header,
      summary,
      ikopDynamics,
      criteriaDistributions,
      comparison,
      topTopics: topicsRanking.top,
      bottomTopics: topicsRanking.bottom,
      lessons,
      comments,
      availableGroups
    });
  } catch (error) {
    console.error('Detailed analytics error:', error);
    res.status(500).json({ error: 'Ошибка получения детальной аналитики' });
  }
});

// POST /api/admin/analytics/export-lessons - экспорт списка занятий
router.post('/export-lessons', async (req, res) => {
  try {
    res.status(501).json({
      success: false,
      message: 'Экспорт занятий временно недоступен'
    });
  } catch (error) {
    console.error('Export lessons error:', error);
    res.status(500).json({ error: 'Ошибка экспорта' });
  }
});

// POST /api/admin/analytics/export-detailed - экспорт детального отчета
router.post('/export-detailed', async (req, res) => {
  try {
    res.status(501).json({
      success: false,
      message: 'Экспорт детального отчета временно недоступен'
    });
  } catch (error) {
    console.error('Export detailed error:', error);
    res.status(500).json({ error: 'Ошибка экспорта' });
  }
});

// Вспомогательные функции

function applyPeriodFilter(filter, period, dateFrom, dateTo) {
  const now = new Date();
  let from, to;
  
  switch (period) {
    case 'week':
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      break;
    case 'semester':
      const month = now.getMonth();
      if (month >= 8 || month <= 0) {
        from = new Date(now.getFullYear(), 8, 1);
        to = new Date(now.getFullYear() + 1, 0, 31);
      } else {
        from = new Date(now.getFullYear(), 1, 1);
        to = new Date(now.getFullYear(), 5, 30);
      }
      break;
    case 'custom':
      if (dateFrom) from = new Date(dateFrom);
      if (dateTo) to = new Date(dateTo);
      break;
  }
  
  if (from || to) {
    filter.created_at = {};
    if (from) filter.created_at.$gte = from;
    if (to) filter.created_at.$lte = to;
  }
}

function buildHeader(disciplineId, teacherId, polls) {
  if (polls.length === 0) {
    return {
      type: disciplineId ? 'discipline' : 'teacher',
      name: 'Не найдено',
      avgIkop: 0,
      period: 'Не задан'
    };
  }
  
  const firstPoll = polls[0];
  let totalIkop = 0;
  let count = 0;
  
  polls.forEach(poll => {
    if (poll.responses && poll.responses.length > 0) {
      poll.responses.forEach(r => {
        if (r.ikop) {
          totalIkop += r.ikop;
          count++;
        }
      });
    }
  });
  
  const startDate = polls[polls.length - 1].created_at || new Date();
  const endDate = polls[0].created_at || new Date();
  
  return {
    type: disciplineId ? 'discipline' : 'teacher',
    name: disciplineId 
      ? (firstPoll.lessonContext?.subject || firstPoll.subject_name || 'Дисциплина')
      : (firstPoll.lessonContext?.teacher || firstPoll.teacher_name || 'Преподаватель'),
    teacher: disciplineId ? (firstPoll.lessonContext?.teacher || firstPoll.teacher_name) : null,
    discipline: teacherId ? (firstPoll.lessonContext?.subject || firstPoll.subject_name) : null,
    faculty: firstPoll.faculty || null,
    program: firstPoll.program || null,
    avgIkop: count > 0 ? Math.round(totalIkop / count) : 0,
    period: `${formatDate(startDate)} - ${formatDate(endDate)}`
  };
}

function calculateSummary(polls) {
  let totalIkop = 0;
  let responseCount = 0;
  const uniqueStudents = new Set();
  let commentsCount = 0;
  
  polls.forEach(poll => {
    if (poll.responses && poll.responses.length > 0) {
      poll.responses.forEach(r => {
        if (r.ikop) {
          totalIkop += r.ikop;
          responseCount++;
        }
        if (r.user_id) uniqueStudents.add(r.user_id.toString());
        if (r.comment && r.comment.trim()) commentsCount++;
      });
    }
  });
  
  return {
    avgIkop: responseCount > 0 ? Math.round(totalIkop / responseCount) : 0,
    ikopTrend: 0,
    lessonsCount: polls.length,
    lessonsTrend: 0,
    coverage: 0,
    coverageTrend: 0,
    commentsCount
  };
}

function calculateIKOPDynamics(polls) {
  const points = polls.map(poll => {
    let totalIkop = 0;
    let count = 0;
    
    if (poll.responses && poll.responses.length > 0) {
      poll.responses.forEach(r => {
        if (r.ikop) {
          totalIkop += r.ikop;
          count++;
        }
      });
    }
    
    return {
      date: formatDate(poll.created_at),
      topic: poll.title || poll.lessonContext?.subject || 'Без темы',
      group: poll.lessonContext?.group || poll.group_name || 'Без группы',
      ikop: count > 0 ? Math.round(totalIkop / count) : 0,
      responses: count,
      average: 73
    };
  }).reverse();
  
  const ikops = points.map(p => p.ikop).filter(i => i > 0);
  
  if (ikops.length === 0) {
    return {
      points: [],
      stats: { avg: 0, max: 0, min: 0, maxDate: '', minDate: '', trend: 0 }
    };
  }
  
  const avg = Math.round(ikops.reduce((a, b) => a + b, 0) / ikops.length);
  const max = Math.max(...ikops);
  const min = Math.min(...ikops);
  const maxPoint = points.find(p => p.ikop === max);
  const minPoint = points.find(p => p.ikop === min);
  const trend = points.length > 1 ? points[points.length - 1].ikop - points[0].ikop : 0;
  
  return {
    points,
    stats: {
      avg,
      max,
      min,
      maxDate: maxPoint ? maxPoint.date : '',
      minDate: minPoint ? minPoint.date : '',
      trend
    }
  };
}

function calculateCriteriaDistributions(polls) {
  const criteria = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
  const result = {};
  
  criteria.forEach(q => {
    const distribution = [
      { rating: '1 ⭐', count: 0, percentage: 0 },
      { rating: '2 ⭐', count: 0, percentage: 0 },
      { rating: '3 ⭐', count: 0, percentage: 0 },
      { rating: '4 ⭐', count: 0, percentage: 0 },
      { rating: '5 ⭐', count: 0, percentage: 0 }
    ];
    
    let total = 0;
    let sum = 0;
    
    polls.forEach(poll => {
      if (poll.responses && poll.responses.length > 0) {
        poll.responses.forEach(r => {
          if (r.ratings && r.ratings[q.toLowerCase() + '_relevance'] !== undefined) {
            const ratingKey = q.toLowerCase() + '_relevance';
            const rating = r.ratings[ratingKey];
            if (rating >= 1 && rating <= 5) {
              distribution[rating - 1].count++;
              sum += rating;
              total++;
            }
          } else if (r.ratings && r.ratings[q]) {
            const rating = r.ratings[q];
            if (rating >= 1 && rating <= 5) {
              distribution[rating - 1].count++;
              sum += rating;
              total++;
            }
          }
        });
      }
    });
    
    distribution.forEach(d => {
      d.percentage = total > 0 ? Math.round((d.count / total) * 100) : 0;
    });
    
    result[q] = distribution;
    result[q + '_avg'] = total > 0 ? (sum / total).toFixed(2) : '0.00';
    result[q + '_total'] = total;
  });
  
  return result;
}

function calculateComparison(polls) {
  const current = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Q5: 0 };
  let count = 0;
  
  polls.forEach(poll => {
    if (poll.responses && poll.responses.length > 0) {
      poll.responses.forEach(r => {
        if (r.ratings) {
          ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'].forEach(q => {
            if (r.ratings[q]) {
              current[q] += r.ratings[q];
              count++;
            }
          });
        }
      });
    }
  });
  
  const currentScores = Object.keys(current).map(key => 
    count > 0 ? Math.round(((current[key] / count - 1) / 4) * 100) : 0
  );
  
  const averageScores = [72, 75, 68, 74, 76];
  
  const criteria = [
    { criterion: 'Актуальность', current: currentScores[0], average: averageScores[0] },
    { criterion: 'Понятность', current: currentScores[1], average: averageScores[1] },
    { criterion: 'Практика', current: currentScores[2], average: averageScores[2] },
    { criterion: 'Вовлеченность', current: currentScores[3], average: averageScores[3] },
    { criterion: 'Организация', current: currentScores[4], average: averageScores[4] }
  ];
  
  const insights = [];
  criteria.forEach(c => {
    const diff = c.current - c.average;
    if (diff > 10) {
      insights.push(`${c.criterion}: выше среднего на ${diff} пунктов - сильная сторона`);
    } else if (diff < -10) {
      insights.push(`${c.criterion}: ниже среднего на ${Math.abs(diff)} пунктов - требует улучшения`);
    }
  });
  
  if (insights.length === 0) {
    insights.push('Показатели соответствуют среднему уровню');
  }
  
  return { criteria, insights };
}

function rankTopics(polls) {
  const topics = polls.map(poll => {
    let totalIkop = 0;
    let count = 0;
    
    if (poll.responses && poll.responses.length > 0) {
      poll.responses.forEach(r => {
        if (r.ikop) {
          totalIkop += r.ikop;
          count++;
        }
      });
    }
    
    return {
      name: poll.title || poll.lessonContext?.subject || 'Без темы',
      date: formatDate(poll.created_at),
      group: poll.lessonContext?.group || poll.group_name || 'Без группы',
      ikop: count > 0 ? Math.round(totalIkop / count) : 0
    };
  });
  
  const top = topics.filter(t => t.ikop >= 80).sort((a, b) => b.ikop - a.ikop).slice(0, 5);
  const bottom = topics.filter(t => t.ikop < 60 && t.ikop > 0).sort((a, b) => a.ikop - b.ikop).slice(0, 5);
  
  return { top, bottom };
}

function prepareLessonsList(polls) {
  return polls.map(poll => {
    let totalIkop = 0;
    let count = 0;
    let commentsCount = 0;
    
    if (poll.responses && poll.responses.length > 0) {
      poll.responses.forEach(r => {
        if (r.ikop) {
          totalIkop += r.ikop;
          count++;
        }
        if (r.comment && r.comment.trim()) commentsCount++;
      });
    }
    
    return {
      date: formatDate(poll.created_at),
      topic: poll.title || poll.lessonContext?.subject || 'Без темы',
      group: poll.lessonContext?.group || poll.group_name || 'Без группы',
      ikop: count > 0 ? Math.round(totalIkop / count) : 0,
      responses: count,
      coverage: 0,
      commentsCount,
      note: poll.description || null
    };
  });
}

function prepareComments(polls) {
  const comments = [];
  
  polls.forEach(poll => {
    if (poll.responses && poll.responses.length > 0) {
      poll.responses.forEach(r => {
        if (r.comment && r.comment.trim() !== '') {
          const lowerComment = r.comment.toLowerCase();
          const negativeWords = ['непонятно', 'скучно', 'сложно', 'плохо', 'мало', 'теории'];
          const isNegative = negativeWords.some(word => lowerComment.includes(word));
          
          comments.push({
            date: formatDate(poll.created_at),
            topic: poll.title || 'Без темы',
            group: poll.lessonContext?.group || poll.group_name || 'Без группы',
            text: r.comment,
            ikop: r.ikop || 0,
            sentiment: isNegative ? 'negative' : 'positive',
            ratings: r.ratings || { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Q5: 0 }
          });
        }
      });
    }
  });
  
  return comments;
}

function getAvailableGroups(polls) {
  const groups = new Set();
  
  polls.forEach(poll => {
    const group = poll.lessonContext?.group || poll.group_name;
    if (group) groups.add(group);
  });
  
  return Array.from(groups).map(name => ({ id: name, name }));
}

function formatDate(date) {
  if (!date) return 'Не указано';
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU');
}

function getEmptyAnalytics() {
  return {
    header: {
      type: 'discipline',
      name: 'Нет данных',
      avgIkop: 0,
      period: 'Не задан'
    },
    summary: {
      avgIkop: 0,
      ikopTrend: 0,
      lessonsCount: 0,
      lessonsTrend: 0,
      coverage: 0,
      coverageTrend: 0,
      commentsCount: 0
    },
    ikopDynamics: {
      points: [],
      stats: { avg: 0, max: 0, min: 0, maxDate: '', minDate: '', trend: 0 }
    },
    criteriaDistributions: {
      Q1: [], Q2: [], Q3: [], Q4: [], Q5: [],
      Q1_avg: 0, Q2_avg: 0, Q3_avg: 0, Q4_avg: 0, Q5_avg: 0,
      Q1_total: 0, Q2_total: 0, Q3_total: 0, Q4_total: 0, Q5_total: 0
    },
    comparison: {
      criteria: [],
      insights: ['Нет данных для сравнения']
    },
    topTopics: [],
    bottomTopics: [],
    lessons: [],
    comments: [],
    availableGroups: []
  };
}

module.exports = router;
