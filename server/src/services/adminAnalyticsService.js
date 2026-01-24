const Poll = require('../models/Poll');
const User = require('../models/User');
const Vote = require('../models/Vote');

/**
 * Получить статистику дашборда качества образования
 */
exports.getDashboardStatistics = async (filters = {}) => {
  const { faculty, program, course, group, discipline, teacher, period, dateFrom, dateTo } = filters;
  
  // Построение query для поиска опросов
  const query = {
    pollType: 'lesson_review',
    status: { $ne: 'deleted' }
  };
  
  // ✅ ДОБАВЛЕНО: Фильтрация по faculty/program/course на уровне Poll
  if (faculty && faculty !== 'all') {
    query.faculty = faculty;
  }
  if (program && program !== 'all') {
    query.program = program;
  }
  if (course && course !== 'all') {
    query.course = parseInt(course);
  }
  
  // Применяем фильтры по контексту занятия
  if (group && group !== 'all') {
    query['lessonContext.group'] = group;
  }
  if (discipline && discipline !== 'all') {
    query['lessonContext.subject'] = discipline;
  }
  if (teacher && teacher !== 'all') {
    query['lessonContext.teacher'] = teacher;
  }
  
  // Фильтр по периоду
  const dateFilter = buildDateFilter(period, dateFrom, dateTo);
  if (dateFilter) {
    // Для lesson_review используем дату занятия из lessonContext
    query['lessonContext.date'] = dateFilter;
  }
  
  // 🔍 DEBUG: Логирование query
  console.log('\n🔍 [getDashboardStatistics] MongoDB Query:', JSON.stringify(query, null, 2));
  
  // Загружаем опросы
  const polls = await Poll.find(query).lean();
  
  console.log('   📊 Найдено опросов:', polls.length);
  
  if (polls.length === 0) {
    return getEmptyStatistics();
  }
  
  // Извлекаем все ответы
  const allResponses = [];
  polls.forEach(poll => {
    if (poll.responses && poll.responses.length > 0) {
      poll.responses.forEach(response => {
        allResponses.push({
          ...response,
          pollId: poll._id,
          subject: poll.lessonContext?.subject || poll.subject_name,
          teacher: poll.lessonContext?.teacher || poll.teacher_name,
          group: poll.lessonContext?.group || poll.group_name,
          date: poll.lessonContext?.date || poll.created_at
        });
      });
    }
  });
  
  // Фильтруем пользователей по факультету, программе, курсу
  const userQuery = { role: 'student' };
  if (faculty && faculty !== 'all') userQuery.faculty = faculty;
  if (program && program !== 'all') userQuery.program = program;
  if (course && course !== 'all') userQuery.course = parseInt(course);
  
  const totalStudents = await User.countDocuments(userQuery);
  
  // Рассчитываем метрики
  const summary = calculateSummary(polls, allResponses, totalStudents);
  const ikopByCriteria = calculateIKOPByCriteria(allResponses);
  const ikopDynamics = calculateDynamics(allResponses, period);
  const problemAreas = findProblemAreas(polls, allResponses);
  const topDisciplines = getTopDisciplines(polls, allResponses);
  const topTeachers = getTopTeachers(polls, allResponses);
  const wordCloud = analyzeComments(allResponses);
  
  return {
    summary,
    ikopByCriteria,
    ikopDynamics,
    problemAreas,
    topDisciplines,
    topTeachers,
    wordCloud
  };
};

/**
 * Построить фильтр дат
 */
function buildDateFilter(period, dateFrom, dateTo) {
  const now = new Date();
  let startDate, endDate;
  
  switch (period) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'semester':
      // Текущий семестр (сентябрь-январь или февраль-июнь)
      const month = now.getMonth();
      const year = now.getFullYear();
      
      if (month >= 8) {
        // Сентябрь-декабрь: осенний семестр текущего года
        startDate = new Date(year, 8, 1);         // 1 сентября текущего года
        endDate = new Date(year + 1, 0, 31);      // 31 января следующего года
      } else if (month <= 0) {
        // Январь: осенний семестр прошлого года (сентябрь прошлого - январь текущего)
        startDate = new Date(year - 1, 8, 1);     // 1 сентября прошлого года
        endDate = new Date(year, 0, 31);          // 31 января текущего года
      } else {
        // Февраль-июнь: весенний семестр
        startDate = new Date(year, 1, 1);         // 1 февраля текущего года
        endDate = new Date(year, 5, 30);          // 30 июня текущего года
      }
      break;
    case 'custom':
      if (dateFrom) startDate = new Date(dateFrom);
      if (dateTo) endDate = new Date(dateTo);
      break;
    default:
      return null;
  }
  
  const filter = {};
  if (startDate) filter.$gte = startDate;
  if (endDate) filter.$lte = endDate;
  
  return Object.keys(filter).length > 0 ? filter : null;
}

/**
 * Рассчитать сводную статистику
 */
function calculateSummary(polls, responses, totalStudents) {
  const totalPolls = polls.length;
  const totalResponses = responses.length;
  
  // Уникальные студенты
  const uniqueStudents = new Set();
  responses.forEach(r => {
    if (r.user_id) uniqueStudents.add(r.user_id.toString());
  });
  
  const coverage = totalStudents > 0 
    ? Math.round((uniqueStudents.size / totalStudents) * 100)
    : 0;
  
  // Средний ИКОП
  const ikops = responses.filter(r => r.ikop != null).map(r => r.ikop);
  const avgIkop = ikops.length > 0
    ? Math.round(ikops.reduce((sum, val) => sum + val, 0) / ikops.length)
    : 0;
  
  // Проблемные дисциплины (ИКОП < 60)
  const disciplineStats = {};
  responses.forEach(r => {
    const subject = r.subject || 'Неизвестно';
    if (!disciplineStats[subject]) {
      disciplineStats[subject] = { total: 0, count: 0 };
    }
    if (r.ikop != null) {
      disciplineStats[subject].total += r.ikop;
      disciplineStats[subject].count++;
    }
  });
  
  const problemDisciplines = Object.values(disciplineStats)
    .filter(stat => stat.count > 0 && (stat.total / stat.count) < 60)
    .length;
  
  return {
    pollsCount: totalPolls,
    pollsChange: 0, // TODO: вычислить относительно предыдущего периода
    totalResponses,
    coverage,
    coverageChange: 0,
    avgIkop,
    ikopChange: 0,
    problemDisciplines,
    problemChange: 0
  };
}

/**
 * Рассчитать ИКОП по 5 критериям
 */
function calculateIKOPByCriteria(responses) {
  const criteria = [
    { key: 'q1_relevance', name: 'Актуальность' },
    { key: 'q2_clarity', name: 'Понятность' },
    { key: 'q3_practice', name: 'Практика' },
    { key: 'q4_engagement', name: 'Вовлеченность' },
    { key: 'q5_organization', name: 'Организация' }
  ];

  const result = [];

  criteria.forEach(({ key, name }) => {
    // ✅ Исправлено: ищем в answers, а не в ratings
    const values = responses
      .filter(r => r.answers && r.answers[key] != null)
      .map(r => r.answers[key]);

    if (values.length > 0) {
      const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
      // Нормализуем в 0-100 (предполагая, что ratings от 1 до 5)
      const score = Math.round(((avg - 1) / 4) * 100);
      result.push({ criterion: name, score });
    } else {
      result.push({ criterion: name, score: 0 });
    }
  });

  console.log('   📊 ИКОП по критериям:', result);

  return result;
}

/**
 * Рассчитать динамику ИКОП
 */
function calculateDynamics(responses, period) {
  // Группируем ответы по периодам
  const buckets = {};
  
  responses.forEach(r => {
    if (!r.date || r.ikop == null) return;
    
    const date = new Date(r.date);
    let key;
    
    if (period === 'week' || period === 'month') {
      // По месяцам
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    } else {
      // По месяцам для семестра
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    if (!buckets[key]) {
      buckets[key] = { total: 0, count: 0 };
    }
    buckets[key].total += r.ikop;
    buckets[key].count++;
  });
  
  // Преобразуем в массив для графика
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  
  const monthly = Object.entries(buckets)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, data]) => {
      const [year, month] = key.split('-');
      return {
        period: monthNames[parseInt(month) - 1],
        ikop: Math.round(data.total / data.count)
      };
    });
  
  // Статистика
  const ikops = monthly.map(m => m.ikop);
  const stats = {
    avg: ikops.length > 0 ? Math.round(ikops.reduce((a, b) => a + b, 0) / ikops.length) : 0,
    trend: ikops.length > 1 ? ikops[ikops.length - 1] - ikops[0] : 0,
    best: ikops.length > 0 ? {
      period: monthly[ikops.indexOf(Math.max(...ikops))].period,
      value: Math.max(...ikops)
    } : { period: '', value: 0 },
    worst: ikops.length > 0 ? {
      period: monthly[ikops.indexOf(Math.min(...ikops))].period,
      value: Math.min(...ikops)
    } : { period: '', value: 0 }
  };
  
  return {
    weekly: monthly, // TODO: реализовать группировку по неделям
    monthly,
    semester: monthly,
    stats
  };
}

/**
 * Найти проблемные области (ИКОП < 60)
 */
function findProblemAreas(polls, responses) {
  const stats = {};
  
  responses.forEach(r => {
    if (!r.ikop) return;
    
    const key = `${r.subject || 'Неизвестно'}-${r.teacher || 'Неизвестно'}-${r.group || 'Неизвестно'}`;
    
    if (!stats[key]) {
      stats[key] = {
        discipline: r.subject || 'Неизвестно',
        teacher: r.teacher || 'Неизвестно',
        group: r.group || 'Неизвестно',
        totalIkop: 0,
        count: 0,
        totalStudents: 0
      };
    }
    
    stats[key].totalIkop += r.ikop;
    stats[key].count++;
  });
  
  // Фильтруем только проблемные (ИКОП < 60) и сортируем
  return Object.values(stats)
    .filter(stat => stat.count > 0 && (stat.totalIkop / stat.count) < 60)
    .map(stat => ({
      discipline: stat.discipline,
      teacher: stat.teacher,
      group: stat.group,
      ikop: Math.round(stat.totalIkop / stat.count),
      coverage: stat.totalStudents > 0 
        ? Math.round((stat.count / stat.totalStudents) * 100)
        : 0
    }))
    .sort((a, b) => a.ikop - b.ikop)
    .slice(0, 10);
}

/**
 * Получить топ дисциплин
 */
function getTopDisciplines(polls, responses) {
  const stats = {};
  
  responses.forEach(r => {
    if (!r.ikop || !r.subject) return;
    
    const subject = r.subject;
    if (!stats[subject]) {
      stats[subject] = { totalIkop: 0, count: 0 };
    }
    stats[subject].totalIkop += r.ikop;
    stats[subject].count++;
  });
  
  return Object.entries(stats)
    .filter(([_, data]) => data.count >= 3) // Минимум 3 оценки
    .map(([name, data]) => ({
      name,
      ikop: Math.round(data.totalIkop / data.count)
    }))
    .sort((a, b) => b.ikop - a.ikop)
    .slice(0, 3);
}

/**
 * Получить топ преподавателей
 */
function getTopTeachers(polls, responses) {
  const stats = {};
  
  responses.forEach(r => {
    if (!r.ikop || !r.teacher) return;
    
    const teacher = r.teacher;
    if (!stats[teacher]) {
      stats[teacher] = { totalIkop: 0, count: 0 };
    }
    stats[teacher].totalIkop += r.ikop;
    stats[teacher].count++;
  });
  
  return Object.entries(stats)
    .filter(([_, data]) => data.count >= 3) // Минимум 3 оценки
    .map(([name, data]) => ({
      name,
      ikop: Math.round(data.totalIkop / data.count)
    }))
    .sort((a, b) => b.ikop - a.ikop)
    .slice(0, 3);
}

/**
 * Анализ комментариев (облако слов)
 */
function analyzeComments(responses) {
  // Собираем все комментарии
  const comments = [];
  responses.forEach(r => {
    if (r.comment && typeof r.comment === 'string' && r.comment.trim().length > 3) {
      comments.push(r.comment.trim());
    }
  });
  
  if (comments.length === 0) {
    return { frequencies: [] };
  }
  
  // Токенизация и подсчет частот
  const stopwords = new Set([
    'и', 'в', 'на', 'с', 'по', 'для', 'не', 'что', 'это', 
    'как', 'все', 'у', 'был', 'была', 'было', 'были', 'о',
    'от', 'из', 'к', 'за', 'до', 'при', 'а', 'но', 'же',
    'бы', 'ли', 'уже', 'или', 'да', 'нет', 'так', 'вот',
    'еще', 'ещё', 'даже', 'вся', 'весь', 'всё', 'мы', 'вы',
    'он', 'она', 'они', 'оно', 'я', 'ты', 'мне', 'меня',
    'тебя', 'его', 'её', 'их', 'нас', 'вас'
  ]);
  
  const frequency = {};
  
  comments.forEach(comment => {
    const words = comment
      .toLowerCase()
      .replace(/[^\wа-яё\s]/gi, '')
      .split(/\s+/);
    
    words.forEach(word => {
      if (word.length > 3 && !stopwords.has(word)) {
        frequency[word] = (frequency[word] || 0) + 1;
      }
    });
  });
  
  // Определяем sentiment (упрощенно)
  const negativeWords = new Set([
    'непонятно', 'скучно', 'сложно', 'плохо', 'теории', 
    'неинтересно', 'слишком', 'мало', 'много', 'тяжело'
  ]);
  
  // Сортируем и берем топ
  const sorted = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);
  
  return {
    frequencies: sorted.map(([word, count]) => ({
      word,
      count,
      sentiment: negativeWords.has(word) ? 'negative' : 'neutral'
    }))
  };
}

/**
 * Пустая статистика (когда нет данных)
 */
function getEmptyStatistics() {
  return {
    summary: {
      pollsCount: 0,
      pollsChange: 0,
      totalResponses: 0,
      coverage: 0,
      coverageChange: 0,
      avgIkop: 0,
      ikopChange: 0,
      problemDisciplines: 0,
      problemChange: 0
    },
    ikopByCriteria: [
      { criterion: 'Актуальность', score: 0 },
      { criterion: 'Понятность', score: 0 },
      { criterion: 'Практика', score: 0 },
      { criterion: 'Вовлеченность', score: 0 },
      { criterion: 'Организация', score: 0 }
    ],
    ikopDynamics: {
      weekly: [],
      monthly: [],
      semester: [],
      stats: { avg: 0, trend: 0, best: { period: '', value: 0 }, worst: { period: '', value: 0 } }
    },
    problemAreas: [],
    topDisciplines: [],
    topTeachers: [],
    wordCloud: { frequencies: [] }
  };
}

/**
 * Получить статистику свободных опросов
 */
exports.getCustomPollsStatistics = async (filters = {}) => {
  const { faculty, program, course, group, discipline, teacher, period, dateFrom, dateTo } = filters;
  
  // Построение query для поиска свободных опросов
  const query = {
    pollType: { $ne: 'lesson_review' }, // Все опросы кроме шаблонных
    status: { $ne: 'deleted' }
  };

  // ✅ ДОБАВЛЕНО: Фильтрация по faculty/program/course
  if (faculty && faculty !== 'all') {
    query.faculty = faculty;
  }
  if (program && program !== 'all') {
    query.program = program;
  }
  if (course && course !== 'all') {
    query.course = parseInt(course);
  }

  // Применяем фильтры
  if (group && group !== 'all') {
    query['target_group'] = group;
  }
  if (discipline && discipline !== 'all') {
    query['discipline'] = discipline;
  }

  // Фильтр по периоду
  const dateFilter = buildDateFilter(period, dateFrom, dateTo);
  if (dateFilter) {
    query.created_at = dateFilter;
  }

  // Загружаем опросы
  const polls = await Poll.find(query).populate('creator').lean();
  
  if (polls.length === 0) {
    return getEmptyCustomPollsStatistics();
  }
  
  // Рассчитываем метрики
  const summary = calculateCustomPollsSummary(polls);
  const categoryDistribution = calculateCategoryDistribution(polls);
  const categoryStats = calculateCategoryStats(polls);
  const creatorStats = calculateCreatorStats(polls);
  const popularTags = getPopularTags(polls);
  const pollsList = getCustomPollsList(polls);
  
  return {
    summary,
    categoryDistribution,
    categoryStats,
    creatorStats,
    popularTags,
    polls: pollsList
  };
};

/**
 * Рассчитать сводную статистику свободных опросов
 */
function calculateCustomPollsSummary(polls) {
  const totalPolls = polls.length;
  
  // Средний охват
  let totalCoverage = 0;
  polls.forEach(poll => {
    const targetCount = poll.max_responses || 50; // Предположим, целевое количество
    const actualCount = poll.responses ? poll.responses.length : 0;
    const coverage = targetCount > 0 ? (actualCount / targetCount) * 100 : 0;
    totalCoverage += coverage;
  });
  const averageCoverage = totalPolls > 0 ? Math.round(totalCoverage / totalPolls) : 0;
  
  // Завершенные опросы
  const completedPolls = polls.filter(p => p.status === 'closed').length;
  
  return {
    totalPolls,
    pollsChange: 0, // TODO: вычислить относительно предыдущего периода
    averageCoverage,
    coverageChange: 0,
    completedPolls,
    completedChange: 0
  };
}

/**
 * Рассчитать распределение по категориям
 */
function calculateCategoryDistribution(polls) {
  const distribution = {
    organizational: { count: 0, percentage: 0 },
    academic: { count: 0, percentage: 0 },
    extracurricular: { count: 0, percentage: 0 },
    feedback: { count: 0, percentage: 0 }
  };
  
  polls.forEach(poll => {
    const category = poll.category || 'organizational'; // По умолчанию
    if (distribution[category]) {
      distribution[category].count++;
    }
  });
  
  const total = polls.length;
  Object.keys(distribution).forEach(key => {
    distribution[key].percentage = total > 0 
      ? Math.round((distribution[key].count / total) * 100) 
      : 0;
  });
  
  return distribution;
}

/**
 * Рассчитать статистику по категориям
 */
function calculateCategoryStats(polls) {
  const stats = {
    organizational: { count: 0, totalVotes: 0, totalCoverage: 0 },
    academic: { count: 0, totalVotes: 0, totalCoverage: 0 },
    extracurricular: { count: 0, totalVotes: 0, totalCoverage: 0 },
    feedback: { count: 0, totalVotes: 0, totalCoverage: 0 }
  };
  
  polls.forEach(poll => {
    const category = poll.category || 'organizational';
    if (stats[category]) {
      stats[category].count++;
      const actualCount = poll.responses ? poll.responses.length : 0;
      stats[category].totalVotes += actualCount;
      
      const targetCount = poll.max_responses || 50;
      const coverage = targetCount > 0 ? (actualCount / targetCount) * 100 : 0;
      stats[category].totalCoverage += coverage;
    }
  });
  
  // Вычисляем средние значения
  Object.keys(stats).forEach(key => {
    const count = stats[key].count;
    stats[key].avgVotes = count > 0 
      ? Math.round(stats[key].totalVotes / count) 
      : 0;
    stats[key].avgCoverage = count > 0 
      ? Math.round(stats[key].totalCoverage / count) 
      : 0;
  });
  
  return stats;
}

/**
 * Рассчитать статистику по создателям
 */
function calculateCreatorStats(polls) {
  const students = {
    count: 0,
    totalCoverage: 0,
    active: 0
  };
  
  const admins = {
    count: 0,
    totalCoverage: 0,
    active: 0
  };
  
  polls.forEach(poll => {
    const targetCount = poll.max_responses || 50;
    const actualCount = poll.responses ? poll.responses.length : 0;
    const coverage = targetCount > 0 ? (actualCount / targetCount) * 100 : 0;
    
    const creatorRole = poll.creator && poll.creator.role ? poll.creator.role : 
                       (poll.creator_role || 'student');
    
    if (creatorRole === 'student') {
      students.count++;
      students.totalCoverage += coverage;
      if (poll.status === 'active') students.active++;
    } else if (creatorRole === 'admin') {
      admins.count++;
      admins.totalCoverage += coverage;
      if (poll.status === 'active') admins.active++;
    }
  });
  
  const totalPolls = polls.length;
  
  return {
    students: {
      count: students.count,
      percentage: totalPolls > 0 ? Math.round((students.count / totalPolls) * 100) : 0,
      avgCoverage: students.count > 0 ? Math.round(students.totalCoverage / students.count) : 0,
      active: students.active
    },
    admins: {
      count: admins.count,
      percentage: totalPolls > 0 ? Math.round((admins.count / totalPolls) * 100) : 0,
      avgCoverage: admins.count > 0 ? Math.round(admins.totalCoverage / admins.count) : 0,
      active: admins.active
    }
  };
}

/**
 * Получить популярные теги
 */
function getPopularTags(polls) {
  const tagFrequency = {};
  
  polls.forEach(poll => {
    if (poll.tags && Array.isArray(poll.tags)) {
      poll.tags.forEach(tag => {
        if (tag && typeof tag === 'string') {
          tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
        }
      });
    }
  });
  
  return Object.entries(tagFrequency)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

/**
 * Получить список свободных опросов
 */
function getCustomPollsList(polls) {
  return polls.map(poll => {
    const targetCount = poll.max_responses || 50;
    const actualCount = poll.responses ? poll.responses.length : 0;
    const coverage = targetCount > 0 ? Math.round((actualCount / targetCount) * 100) : 0;
    
    const creatorRole = poll.creator && poll.creator.role ? poll.creator.role : 
                       (poll.creator_role || 'student');
    const creatorName = poll.creator && poll.creator.full_name ? poll.creator.full_name :
                       (poll.creator_name || 'Неизвестно');
    
    return {
      _id: poll._id,
      title: poll.title || 'Без названия',
      category: poll.category || 'organizational',
      tags: poll.tags || [],
      creator_role: creatorRole,
      creator_name: creatorName,
      discipline_name: poll.subject_name || poll.lessonContext?.subject || null,
      target_audience: poll.target_audience || { type: 'all' },
      votes: actualCount,
      target_count: targetCount,
      coverage,
      status: poll.status || 'active',
      created_at: poll.created_at
    };
  }).slice(0, 100); // Ограничиваем 100 опросами
}

/**
 * Пустая статистика свободных опросов
 */
function getEmptyCustomPollsStatistics() {
  return {
    summary: {
      totalPolls: 0,
      pollsChange: 0,
      averageCoverage: 0,
      coverageChange: 0,
      completedPolls: 0,
      completedChange: 0
    },
    categoryDistribution: {
      organizational: { count: 0, percentage: 0 },
      academic: { count: 0, percentage: 0 },
      extracurricular: { count: 0, percentage: 0 },
      feedback: { count: 0, percentage: 0 }
    },
    categoryStats: {
      organizational: { count: 0, avgVotes: 0, avgCoverage: 0 },
      academic: { count: 0, avgVotes: 0, avgCoverage: 0 },
      extracurricular: { count: 0, avgVotes: 0, avgCoverage: 0 },
      feedback: { count: 0, avgVotes: 0, avgCoverage: 0 }
    },
    creatorStats: {
      students: { count: 0, percentage: 0, avgCoverage: 0, active: 0 },
      admins: { count: 0, percentage: 0, avgCoverage: 0, active: 0 }
    },
    popularTags: [],
    polls: []
  };
}

module.exports = exports;
