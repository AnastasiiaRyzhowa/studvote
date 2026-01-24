const Poll = require('../models/Poll');

/**
 * Стоп-слова для русского языка (фильтруем при анализе текста)
 */
const STOP_WORDS = new Set([
  'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то',
  'все', 'она', 'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за',
  'бы', 'по', 'только', 'ее', 'мне', 'было', 'вот', 'от', 'меня', 'еще',
  'нет', 'о', 'из', 'ему', 'теперь', 'когда', 'даже', 'ну', 'вдруг', 'ли',
  'если', 'уже', 'или', 'ни', 'быть', 'был', 'него', 'до', 'вас', 'нибудь',
  'опять', 'уж', 'вам', 'ведь', 'там', 'потом', 'себя', 'ничего', 'ей',
  'может', 'они', 'тут', 'где', 'есть', 'надо', 'ней', 'для', 'мы', 'тебя',
  'их', 'чем', 'была', 'сам', 'чтоб', 'без', 'будто', 'чего', 'раз', 'тоже',
  'себе', 'под', 'будет', 'ж', 'тогда', 'кто', 'этот', 'того', 'потому',
  'этого', 'какой', 'совсем', 'ним', 'здесь', 'этом', 'один', 'почти', 'мой',
  'тем', 'чтобы', 'нее', 'сейчас', 'были', 'куда', 'зачем', 'всех', 'никогда',
  'можно', 'при', 'наконец', 'два', 'об', 'другой', 'хоть', 'после', 'над',
  'больше', 'тот', 'через', 'эти', 'нас', 'про', 'всего', 'них', 'какая',
  'много', 'разве', 'три', 'эту', 'моя', 'впрочем', 'хорошо', 'свою', 'этой',
  'перед', 'иногда', 'лучше', 'чуть', 'том', 'нельзя', 'такой', 'им', 'более',
  'всегда', 'конечно', 'всю', 'между'
]);

/**
 * 1. ОПИСАТЕЛЬНАЯ СТАТИСТИКА
 */
exports.getDescriptiveStatistics = async (filters = {}) => {
  const polls = await getPollsWithFilters(filters);
  
  if (polls.length === 0) {
    return { questions: [] };
  }

  const questionIds = ['q1_relevance', 'q2_clarity', 'q3_practice', 'q4_engagement', 'q5_organization'];
  const questionNames = {
    q1_relevance: 'Актуальность темы',
    q2_clarity: 'Понятность объяснения',
    q3_practice: 'Достаточность практики',
    q4_engagement: 'Вовлеченность',
    q5_organization: 'Организация пары'
  };

  const statistics = [];

  questionIds.forEach(qId => {
    const ratings = [];
    
    polls.forEach(poll => {
      poll.responses.forEach(r => {
        const answer = r.answers?.[qId];
        if (answer && typeof answer === 'number' && answer >= 1 && answer <= 5) {
          ratings.push(answer);
        }
      });
    });

    if (ratings.length === 0) return;

    const stats = calculateDetailedStats(ratings);
    const distribution = calculateDistribution(ratings);
    const histogram = calculateHistogram(ratings);

    statistics.push({
      id: qId,
      name: questionNames[qId],
      count: ratings.length,
      ...stats,
      distribution,
      histogram
    });
  });

  return { questions: statistics };
};

/**
 * 2. ТЕКСТОВЫЙ АНАЛИЗ
 */
exports.getTextAnalysis = async (filters = {}) => {
  const polls = await getPollsWithFilters(filters);
  
  const comments = [];
  
  polls.forEach(poll => {
    poll.responses.forEach(r => {
      const comment = r.answers?.q6_comment;
      if (comment && typeof comment === 'string' && comment.trim().length > 0) {
        comments.push({
          text: comment.trim(),
          date: r.submitted_at || poll.created_at,
          subject: poll.lessonContext?.subject,
          teacher: poll.lessonContext?.teacher
        });
      }
    });
  });

  if (comments.length === 0) {
    return {
      totalComments: 0,
      topWords: [],
      topBigrams: [],
      sentiment: { positive: 0, neutral: 0, negative: 0 },
      categories: []
    };
  }

  // Анализ слов
  const wordFrequency = analyzeWords(comments.map(c => c.text));
  const topWords = Object.entries(wordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  // Анализ биграмм (словосочетаний)
  const bigramFrequency = analyzeBigrams(comments.map(c => c.text));
  const topBigrams = Object.entries(bigramFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([bigram, count]) => ({ bigram, count }));

  // Анализ тональности
  const sentiment = analyzeSentiment(comments.map(c => c.text));

  // Категоризация проблем
  const categories = categorizeProblems(comments.map(c => c.text));

  return {
    totalComments: comments.length,
    topWords,
    topBigrams,
    sentiment,
    categories,
    recentComments: comments
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20)
      .map(c => ({
        text: c.text.substring(0, 200),
        date: c.date,
        subject: c.subject
      }))
  };
};

/**
 * 3. СРАВНИТЕЛЬНЫЙ АНАЛИЗ
 */
exports.getComparativeAnalysis = async (filters = {}) => {
  const polls = await getPollsWithFilters(filters);

  if (polls.length === 0) {
    return {
      byGroup: [],
      bySubject: [],
      byTimeOfDay: []
    };
  }

  // Сравнение по группам
  const byGroup = compareByGroup(polls);
  
  // Сравнение по дисциплинам
  const bySubject = compareBySubject(polls);
  
  // Сравнение по времени проведения
  const byTimeOfDay = compareByTimeOfDay(polls);

  return {
    byGroup,
    bySubject,
    byTimeOfDay
  };
};

/**
 * 4. ТЕХНИЧЕСКИЕ ИНЦИДЕНТЫ
 */
exports.getTechnicalIncidents = async (filters = {}) => {
  const polls = await getPollsWithFilters(filters);

  const incidents = [];
  
  polls.forEach(poll => {
    poll.responses.forEach(r => {
      if (r.technical_issues?.has_issues) {
        incidents.push({
          date: poll.lessonContext?.date || poll.created_at,
          subject: poll.lessonContext?.subject,
          teacher: poll.lessonContext?.teacher,
          auditorium: poll.lessonContext?.auditorium,
          types: r.technical_issues.selected || [],
          description: r.technical_issues.description || ''
        });
      }
    });
  });

  if (incidents.length === 0) {
    return {
      total: 0,
      byType: [],
      byAuditorium: [],
      recent: []
    };
  }

  // Группировка по типам
  const typeCount = {};
  incidents.forEach(inc => {
    inc.types.forEach(type => {
      typeCount[type] = (typeCount[type] || 0) + 1;
    });
  });

  const byType = Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  // Группировка по аудиториям
  const auditoriumCount = {};
  incidents.forEach(inc => {
    if (inc.auditorium) {
      auditoriumCount[inc.auditorium] = (auditoriumCount[inc.auditorium] || 0) + 1;
    }
  });

  const byAuditorium = Object.entries(auditoriumCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([auditorium, count]) => ({ auditorium, count }));

  // Последние инциденты
  const recent = incidents
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 20)
    .map(inc => ({
      date: inc.date,
      subject: inc.subject,
      auditorium: inc.auditorium,
      types: inc.types.join(', '),
      description: inc.description.substring(0, 150)
    }));

  return {
    total: incidents.length,
    byType,
    byAuditorium,
    recent
  };
};

/**
 * ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
 */

async function getPollsWithFilters(filters) {
  const query = {
    pollType: 'lesson_review',
    status: { $ne: 'deleted' }
  };

  // ✅ ДОБАВЛЕНО: Фильтрация по faculty/program/course
  if (filters.faculty) query.faculty = filters.faculty;
  if (filters.program) query.program = filters.program;
  if (filters.course) query.course = parseInt(filters.course);
  
  // Существующие фильтры
  if (filters.group) query['lessonContext.group'] = filters.group;
  if (filters.subject) query['lessonContext.subject'] = filters.subject;
  if (filters.teacher) query['lessonContext.teacher'] = filters.teacher;

  if (filters.period) {
    const now = new Date();
    let startDate;
    
    switch (filters.period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'semester':
        startDate = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    }
    
    query.created_at = { $gte: startDate };
  }

  return await Poll.find(query).lean();
}

function calculateDetailedStats(values) {
  if (!values || values.length === 0) {
    return { mean: 0, median: 0, mode: 0, min: 0, max: 0, stdDev: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  
  // Среднее
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  
  // Медиана
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  
  // Мода
  const frequency = {};
  values.forEach(val => {
    frequency[val] = (frequency[val] || 0) + 1;
  });
  const mode = parseInt(
    Object.keys(frequency).reduce((a, b) => 
      frequency[a] > frequency[b] ? a : b
    )
  );
  
  // Мин/Макс
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  // Стандартное отклонение
  const variance = values.reduce((sum, val) => 
    sum + Math.pow(val - mean, 2), 0
  ) / values.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean: parseFloat(mean.toFixed(2)),
    median,
    mode,
    min,
    max,
    stdDev: parseFloat(stdDev.toFixed(2))
  };
}

function calculateDistribution(values) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  values.forEach(val => {
    if (val >= 1 && val <= 5) dist[val]++;
  });
  
  const total = values.length;
  return Object.keys(dist).map(key => ({
    rating: parseInt(key),
    count: dist[key],
    percent: Math.round((dist[key] / total) * 100)
  }));
}

function calculateHistogram(values) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  values.forEach(val => {
    if (val >= 1 && val <= 5) dist[val]++;
  });
  
  return Object.keys(dist).map(key => ({
    rating: parseInt(key),
    count: dist[key]
  }));
}

function analyzeWords(texts) {
  const wordFreq = {};
  
  texts.forEach(text => {
    const words = text
      .toLowerCase()
      .replace(/[^\wа-яё\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word));
    
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });
  });
  
  return wordFreq;
}

function analyzeBigrams(texts) {
  const bigramFreq = {};
  
  texts.forEach(text => {
    const words = text
      .toLowerCase()
      .replace(/[^\wа-яё\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word));
    
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      bigramFreq[bigram] = (bigramFreq[bigram] || 0) + 1;
    }
  });
  
  return bigramFreq;
}

function analyzeSentiment(texts) {
  const positiveWords = ['отлично', 'хорошо', 'замечательно', 'понравилось', 'интересно', 
    'супер', 'круто', 'класс', 'прекрасно', 'чудесно', 'полезно', 'понятно', 'ясно'];
  const negativeWords = ['плохо', 'ужасно', 'непонятно', 'скучно', 'неинтересно', 
    'сложно', 'трудно', 'мало', 'недостаточно', 'слабо'];
  
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  
  texts.forEach(text => {
    const lower = text.toLowerCase();
    let score = 0;
    
    positiveWords.forEach(word => {
      if (lower.includes(word)) score++;
    });
    
    negativeWords.forEach(word => {
      if (lower.includes(word)) score--;
    });
    
    if (score > 0) positive++;
    else if (score < 0) negative++;
    else neutral++;
  });
  
  const total = texts.length;
  return {
    positive: Math.round((positive / total) * 100),
    neutral: Math.round((neutral / total) * 100),
    negative: Math.round((negative / total) * 100),
    positiveCount: positive,
    neutralCount: neutral,
    negativeCount: negative
  };
}

function categorizeProblems(texts) {
  const categories = {
    'Методика преподавания': ['методика', 'объяснял', 'объясняет', 'непонятно', 'сложно'],
    'Недостаток практики': ['практика', 'практики', 'мало практики', 'примеров', 'задач'],
    'Темп/организация': ['темп', 'быстро', 'медленно', 'организация', 'время', 'структура'],
    'Материал устарел': ['устарел', 'неактуально', 'старый', 'новый'],
    'Технические проблемы': ['проектор', 'звук', 'микрофон', 'доска', 'техника']
  };
  
  const counts = {};
  
  Object.keys(categories).forEach(category => {
    counts[category] = 0;
  });
  
  texts.forEach(text => {
    const lower = text.toLowerCase();
    
    Object.entries(categories).forEach(([category, keywords]) => {
      keywords.forEach(keyword => {
        if (lower.includes(keyword)) {
          counts[category]++;
        }
      });
    });
  });
  
  return Object.entries(counts)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));
}

function compareByGroup(polls) {
  const byGroup = {};
  
  polls.forEach(poll => {
    const group = poll.lessonContext?.group;
    if (!group) return;
    
    if (!byGroup[group]) {
      byGroup[group] = [];
    }
    
    poll.responses.forEach(r => {
      if (r.ikop != null) {
        byGroup[group].push(r.ikop);
      }
    });
  });
  
  return Object.entries(byGroup)
    .map(([group, ikops]) => ({
      group,
      avgIkop: Math.round(ikops.reduce((sum, v) => sum + v, 0) / ikops.length),
      count: ikops.length
    }))
    .sort((a, b) => b.avgIkop - a.avgIkop);
}

function compareBySubject(polls) {
  const bySubject = {};
  
  polls.forEach(poll => {
    const subject = poll.lessonContext?.subject;
    if (!subject) return;
    
    if (!bySubject[subject]) {
      bySubject[subject] = [];
    }
    
    poll.responses.forEach(r => {
      if (r.ikop != null) {
        bySubject[subject].push(r.ikop);
      }
    });
  });
  
  return Object.entries(bySubject)
    .map(([subject, ikops]) => ({
      subject,
      avgIkop: Math.round(ikops.reduce((sum, v) => sum + v, 0) / ikops.length),
      count: ikops.length
    }))
    .sort((a, b) => b.avgIkop - a.avgIkop);
}

function compareByTimeOfDay(polls) {
  const byTime = {
    'Утро (8:00-10:00)': [],
    'День (10:00-14:00)': [],
    'После обеда (14:00-16:00)': [],
    'Вечер (16:00-18:00)': []
  };
  
  polls.forEach(poll => {
    const time = poll.lessonContext?.time;
    if (!time) return;
    
    const hour = parseInt(time.split(':')[0]);
    let timeSlot;
    
    if (hour >= 8 && hour < 10) timeSlot = 'Утро (8:00-10:00)';
    else if (hour >= 10 && hour < 14) timeSlot = 'День (10:00-14:00)';
    else if (hour >= 14 && hour < 16) timeSlot = 'После обеда (14:00-16:00)';
    else if (hour >= 16 && hour < 18) timeSlot = 'Вечер (16:00-18:00)';
    
    if (!timeSlot) return;
    
    poll.responses.forEach(r => {
      if (r.ikop != null) {
        byTime[timeSlot].push(r.ikop);
      }
    });
  });
  
  return Object.entries(byTime)
    .filter(([_, ikops]) => ikops.length > 0)
    .map(([timeSlot, ikops]) => ({
      timeSlot,
      avgIkop: Math.round(ikops.reduce((sum, v) => sum + v, 0) / ikops.length),
      count: ikops.length
    }));
}
