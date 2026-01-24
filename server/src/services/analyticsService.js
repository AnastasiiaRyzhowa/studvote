// server/src/services/analyticsService.js

const Poll = require('../models/Poll');

const IKOP_THRESHOLDS = {
  critical: 0.4,
  attention: 0.6,
  good: 0.8
};

const calcIkop = (avgRating) => {
  if (!avgRating || Number.isNaN(avgRating)) {
    return { score: 0, zone: 'no_data' };
  }
  const normalized = Math.max(0, Math.min(1, avgRating / 5));
  let zone = 'critical';
  if (normalized >= IKOP_THRESHOLDS.good) zone = 'excellent';
  else if (normalized >= IKOP_THRESHOLDS.attention) zone = 'satisfactory';
  else if (normalized >= IKOP_THRESHOLDS.critical) zone = 'attention';
  return { score: Number(normalized.toFixed(3)), zone };
};

/**
 * Анализ результатов опроса с группировкой по категориям
 */
const analyzePollResults = async (pollId) => {
  const poll = await Poll.findById(pollId).lean();
  
  if (!poll) {
    throw new Error('Опрос не найден');
  }
  
  if (poll.responses.length === 0) {
    return {
      overall: { total_responses: 0, average: 0 },
      byFaculty: {},
      byProgram: {},
      byCourse: {},
      insights: [],
      ikop: { score: 0, zone: 'no_data' }
    };
  }
  
  // ==================== 1. ОБЩИЙ РЕЗУЛЬТАТ ====================
  const overall = calculateOverall(poll);
  
  // ==================== 2. ГРУППИРОВКА ПО ФАКУЛЬТЕТАМ ====================
  const byFaculty = groupByFaculty(poll);
  
  // ==================== 3. ГРУППИРОВКА ПО ПРОГРАММАМ ====================
  const byProgram = groupByProgram(poll);
  
  // ==================== 4. ГРУППИРОВКА ПО КУРСАМ ====================
  const byCourse = groupByCourse(poll);
  
  // ==================== 5. ИКОП ====================
  const ikop = deriveIkop(overall, poll);
  
  // ==================== 6. ИНСАЙТЫ ====================
  const insights = generateInsights(overall, byFaculty, byProgram, byCourse, poll.type);
  
  return {
    overall,
    byFaculty,
    byProgram,
    byCourse,
    insights,
    ikop,
    poll_type: poll.type
  };
};

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Вычислить общий результат
 */
const calculateOverall = (poll) => {
  const total_responses = poll.responses.length;
  
  if (poll.type === 'topic') {
    // Для оценки темы - простой рейтинг
    const sum = poll.responses.reduce((acc, r) => acc + (r.answers || 0), 0);
    const average = (sum / total_responses).toFixed(1);
    
    return {
      total_responses,
      average: parseFloat(average),
      distribution: calculateDistribution(poll.responses.map(r => r.answers))
    };
    
  } else if (poll.type === 'teacher') {
    // Для оценки преподавателя - по каждому критерию
    const avgByQuestion = {};
    let overallSum = 0;
    let questionCount = 0;
    
    poll.questions.forEach(q => {
      if (q.type === 'rating_1_5') {
        const sum = poll.responses.reduce((acc, r) => acc + (r.answers[q.id] || 0), 0);
        avgByQuestion[q.id] = {
          question: q.text,
          average: parseFloat((sum / total_responses).toFixed(1))
        };
        overallSum += sum;
        questionCount++;
      } else if (q.type === 'yes_no') {
        const yesCount = poll.responses.filter(r => r.answers[q.id] === 'yes').length;
        avgByQuestion[q.id] = {
          question: q.text,
          yes_percent: Math.round((yesCount / total_responses) * 100),
          yes_count: yesCount,
          no_count: total_responses - yesCount
        };
      }
    });
    
    const overall_average = questionCount > 0 
      ? parseFloat((overallSum / (total_responses * questionCount)).toFixed(1))
      : 0;
    
    return {
      total_responses,
      average: overall_average,
      by_question: avgByQuestion
    };
    
  } else if (poll.type === 'subject') {
    // Для оценки дисциплины - по аспектам
    const avgByQuestion = {};
    
    poll.questions.forEach(q => {
      if (q.type === 'rating_1_5') {
        const sum = poll.responses.reduce((acc, r) => acc + (r.answers[q.id] || 0), 0);
        avgByQuestion[q.id] = {
          question: q.text,
          average: parseFloat((sum / total_responses).toFixed(1))
        };
      }
    });
    
    return {
      total_responses,
      by_question: avgByQuestion
    };
    
  } else if (poll.type === 'organization') {
    // Для организационных - распределение голосов
    const distribution = {};
    
    poll.responses.forEach(r => {
      const answer = r.answers;
      distribution[answer] = (distribution[answer] || 0) + 1;
    });
    
    // Сортируем по количеству голосов
    const sorted = Object.entries(distribution)
      .sort((a, b) => b[1] - a[1])
      .map(([option, count]) => ({
        option,
        count,
        percent: Math.round((count / total_responses) * 100)
      }));
    
    return {
      total_responses,
      distribution: sorted,
      winner: sorted[0]
    };
  } else if (poll.type === 'form') {
    // Для форм (новые опросы) - анализ по вопросам
    const avgRatings = {};
    const distributionPerQuestion = {};
    const questionTexts = {};
    const overallDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRatings = 0;
    
    // Обрабатываем каждый вопрос
    poll.questions?.forEach(q => {
      questionTexts[q.id] = q.text;
      
      if (q.type === 'rating' || q.type === 'rating_1_5') {
        // Собираем все оценки по этому вопросу
        const ratings = [];
        poll.responses.forEach(r => {
          const value = r.answers?.[q.id];
          if (value && typeof value === 'number' && value >= 1 && value <= 5) {
            ratings.push(value);
          }
        });
        
        if (ratings.length > 0) {
          // Средняя оценка
          const sum = ratings.reduce((acc, val) => acc + val, 0);
          avgRatings[q.id] = parseFloat((sum / ratings.length).toFixed(2));
          
          // Распределение для этого вопроса
          const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
          ratings.forEach(val => {
            dist[val]++;
          });
          distributionPerQuestion[q.id] = dist;
          
          // Добавляем в общее распределение
          ratings.forEach(val => {
            overallDistribution[val]++;
            totalRatings++;
          });
        }
      }
    });
    
    return {
      total_responses,
      totalResponses: total_responses,
      targetStudents: poll.target_groups?.length > 0 ? null : null,
      avgRatings,
      distribution: overallDistribution,
      distributionPerQuestion,
      questionTexts
    };
  }
  
  return { total_responses };
};

const deriveIkop = (overall, poll) => {
  if (!overall || !overall.total_responses) {
    return { score: 0, zone: 'no_data' };
  }
  
  if (typeof overall.average === 'number') {
    return calcIkop(overall.average);
  }
  
  if (overall.by_question) {
    const values = Object.values(overall.by_question)
      .map(q => q.average)
      .filter(v => typeof v === 'number' && !Number.isNaN(v));
    if (!values.length) return { score: 0, zone: 'no_data' };
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    return calcIkop(avg);
  }
  
  return { score: 0, zone: 'no_data' };
};

/**
 * Группировка по факультетам
 */
const groupByFaculty = (poll) => {
  const grouped = {};
  
  poll.responses.forEach(response => {
    const faculty = response.user_faculty;
    const facultyName = response.user_faculty_name;
    
    if (!grouped[faculty]) {
      grouped[faculty] = {
        name: facultyName,
        responses: [],
        count: 0
      };
    }
    
    grouped[faculty].responses.push(response.answers);
    grouped[faculty].count++;
  });
  
  // Вычисляем средние для каждого факультета
  Object.keys(grouped).forEach(faculty => {
    const data = grouped[faculty];
    
    if (poll.type === 'topic') {
      const sum = data.responses.reduce((acc, ans) => acc + (ans || 0), 0);
      data.average = parseFloat((sum / data.count).toFixed(1));
      
    } else if (poll.type === 'teacher') {
      const avgByQuestion = {};
      let overallSum = 0;
      let questionCount = 0;
      
      poll.questions.forEach(q => {
        if (q.type === 'rating_1_5') {
          const sum = data.responses.reduce((acc, ans) => acc + (ans[q.id] || 0), 0);
          avgByQuestion[q.id] = parseFloat((sum / data.count).toFixed(1));
          overallSum += sum;
          questionCount++;
        }
      });
      
      data.average = questionCount > 0
        ? parseFloat((overallSum / (data.count * questionCount)).toFixed(1))
        : 0;
      data.by_question = avgByQuestion;
    }
  });
  
  return grouped;
};

/**
 * Группировка по программам
 */
const groupByProgram = (poll) => {
  const grouped = {};
  
  poll.responses.forEach(response => {
    const program = response.user_program;
    const programName = response.user_program_name;
    const facultyName = response.user_faculty_name;
    
    if (!grouped[program]) {
      grouped[program] = {
        name: programName,
        faculty: facultyName,
        responses: [],
        count: 0
      };
    }
    
    grouped[program].responses.push(response.answers);
    grouped[program].count++;
  });
  
  // Вычисляем средние (аналогично факультетам)
  Object.keys(grouped).forEach(program => {
    const data = grouped[program];
    
    if (poll.type === 'topic') {
      const sum = data.responses.reduce((acc, ans) => acc + (ans || 0), 0);
      data.average = parseFloat((sum / data.count).toFixed(1));
    } else if (poll.type === 'teacher') {
      const avgByQuestion = {};
      let overallSum = 0;
      let questionCount = 0;
      
      poll.questions.forEach(q => {
        if (q.type === 'rating_1_5') {
          const sum = data.responses.reduce((acc, ans) => acc + (ans[q.id] || 0), 0);
          avgByQuestion[q.id] = parseFloat((sum / data.count).toFixed(1));
          overallSum += sum;
          questionCount++;
        }
      });
      
      data.average = questionCount > 0
        ? parseFloat((overallSum / (data.count * questionCount)).toFixed(1))
        : 0;
      data.by_question = avgByQuestion;
    }
  });
  
  return grouped;
};

/**
 * Группировка по курсам
 */
const groupByCourse = (poll) => {
  const grouped = {};
  
  poll.responses.forEach(response => {
    const course = response.user_course;
    
    if (!grouped[course]) {
      grouped[course] = {
        responses: [],
        count: 0
      };
    }
    
    grouped[course].responses.push(response.answers);
    grouped[course].count++;
  });
  
  // Вычисляем средние
  Object.keys(grouped).forEach(course => {
    const data = grouped[course];
    
    if (poll.type === 'topic') {
      const sum = data.responses.reduce((acc, ans) => acc + (ans || 0), 0);
      data.average = parseFloat((sum / data.count).toFixed(1));
    } else if (poll.type === 'teacher') {
      const avgByQuestion = {};
      let overallSum = 0;
      let questionCount = 0;
      
      poll.questions.forEach(q => {
        if (q.type === 'rating_1_5') {
          const sum = data.responses.reduce((acc, ans) => acc + (ans[q.id] || 0), 0);
          avgByQuestion[q.id] = parseFloat((sum / data.count).toFixed(1));
          overallSum += sum;
          questionCount++;
        }
      });
      
      data.average = questionCount > 0
        ? parseFloat((overallSum / (data.count * questionCount)).toFixed(1))
        : 0;
      data.by_question = avgByQuestion;
    }
  });
  
  return grouped;
};

/**
 * Генерация инсайтов (выводов)
 */
const generateInsights = (overall, byFaculty, byProgram, byCourse, pollType) => {
  const insights = [];
  
  // Инсайт 1: Лидер среди факультетов
  const facultyEntries = Object.entries(byFaculty);
  if (facultyEntries.length > 1 && pollType !== 'organization') {
    const sorted = facultyEntries.sort((a, b) => (b[1].average || 0) - (a[1].average || 0));
    const leader = sorted[0];
    const lowest = sorted[sorted.length - 1];
    
    if (leader[1].average) {
      insights.push({
        type: 'leader',
        icon: '🏆',
        text: `Самая высокая оценка у ${leader[1].name}: ${leader[1].average} ⭐`
      });
    }
    
    // Инсайт 2: Большая разница между факультетами
    if (leader[1].average && lowest[1].average && 
        (leader[1].average - lowest[1].average) >= 1.0) {
      insights.push({
        type: 'gap',
        icon: '📊',
        text: `Большая разница между ${leader[1].name} (${leader[1].average}) и ${lowest[1].name} (${lowest[1].average})`
      });
    }
  }
  
  // Инсайт 3: Тренд по курсам
  const courseEntries = Object.entries(byCourse).sort((a, b) => a[0] - b[0]);
  if (courseEntries.length >= 3 && pollType !== 'organization') {
    const averages = courseEntries.map(c => c[1].average).filter(Boolean);
    if (averages.length >= 3) {
      const isGrowing = averages.every((val, i, arr) => i === 0 || val >= arr[i - 1] - 0.3);
      const isDecreasing = averages.every((val, i, arr) => i === 0 || val <= arr[i - 1] + 0.3);
      
      if (isGrowing) {
        insights.push({
          type: 'trend',
          icon: '📈',
          text: 'Оценка растет от младших к старшим курсам'
        });
      } else if (isDecreasing) {
        insights.push({
          type: 'trend',
          icon: '📉',
          text: 'Оценка снижается от младших к старшим курсам'
        });
      }
    }
  }
  
  // Инсайт 4: Явка
  if (overall.total_responses) {
    let estimatedTotal = 25; // примерная численность группы
    
    // Для множественных групп
    const targetGroupsCount = 1; // можно получить из poll.target_groups.length
    estimatedTotal *= targetGroupsCount;
    
    const turnout = Math.round((overall.total_responses / estimatedTotal) * 100);
    
    if (turnout >= 70) {
      insights.push({
        type: 'turnout',
        icon: '✅',
        text: `Высокая явка: ${turnout}% студентов проголосовали`
      });
    } else if (turnout < 40) {
      insights.push({
        type: 'turnout',
        icon: '⚠️',
        text: `Низкая явка: только ${turnout}% студентов проголосовали`
      });
    }
  }
  
  return insights;
};

/**
 * Распределение оценок (для гистограммы)
 */
const calculateDistribution = (values) => {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  
  values.forEach(val => {
    if (val >= 1 && val <= 5) {
      dist[val]++;
    }
  });
  
  return dist;
};

module.exports = {
  analyzePollResults
};




