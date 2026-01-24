/**
 * ИКОП Service - Расчет Индекса Качества Образовательного Процесса
 * 
 * Формула: ИКОП = Σ(нормализованная_оценка × вес_вопроса) × 100
 * 
 * Нормализация: (оценка - 1) / 4
 * 1 звезда → 0.0
 * 3 звезды → 0.5
 * 5 звезд → 1.0
 * 
 * Веса вопросов (фиксированные):
 * - Q1 (актуальность): 25%
 * - Q2 (понятность): 30%
 * - Q3 (практика): 20%
 * - Q4 (вовлеченность): 15%
 * - Q5 (организация): 10%
 */

/**
 * Рассчитывает ИКОП на основе ответов и вопросов
 * @param {Object} answers - Ответы студента { q1_relevance: 5, q2_clarity: 4, ... }
 * @param {Array} questions - Массив вопросов с весами
 * @returns {Number} - ИКОП от 0 до 100
 */
function calculateIKOP(answers, questions) {
  if (!answers || !questions || questions.length === 0) {
    return null;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  // Проходим по всем вопросам с весом
  questions.forEach((q) => {
    if (q.type === 'rating' && q.weight && q.weight > 0) {
      const questionId = q.id;
      const rating = answers[questionId];

      if (rating && typeof rating === 'number' && rating >= 1 && rating <= 5) {
        // Нормализация: (rating - 1) / 4
        // 1 → 0.0, 2 → 0.25, 3 → 0.5, 4 → 0.75, 5 → 1.0
        const normalized = (rating - 1) / 4;

        // Взвешенная сумма
        weightedSum += normalized * q.weight;
        totalWeight += q.weight;
      }
    }
  });

  // Если ни один вопрос не был отвечен
  if (totalWeight === 0) {
    return null;
  }

  // ИКОП = (взвешенная сумма / общий вес) × 100
  const ikop = Math.round((weightedSum / totalWeight) * 100);

  return Math.max(0, Math.min(100, ikop)); // Ограничиваем 0-100
}

/**
 * Определяет зону качества по ИКОП
 * @param {Number} ikop - Значение ИКОП (0-100)
 * @returns {Object} - { zone, color, description }
 */
function getIKOPZone(ikop) {
  if (ikop === null || ikop === undefined) {
    return {
      zone: 'Нет данных',
      color: '#e5e7eb',
      description: 'Недостаточно данных для оценки'
    };
  }

  if (ikop >= 80) {
    return {
      zone: 'Отлично',
      color: '#58D9F9',
      description: 'Высокое качество образовательного процесса'
    };
  }

  if (ikop >= 60) {
    return {
      zone: 'Хорошо',
      color: '#7CFFB2',
      description: 'Качество выше среднего, есть потенциал для улучшения'
    };
  }

  if (ikop >= 40) {
    return {
      zone: 'Требует внимания',
      color: '#FDDD60',
      description: 'Необходимо обратить внимание на проблемные области'
    };
  }

  return {
    zone: 'Критично',
    color: '#FF6E76',
    description: 'Требуются срочные меры по улучшению качества'
  };
}

/**
 * Определяет сильные стороны и области роста на основе ответов
 * @param {Object} answers - Ответы студента
 * @param {Array} questions - Вопросы с весами
 * @returns {Object} - { strengths: [], weaknesses: [] }
 */
function analyzeIKOPComponents(answers, questions) {
  const strengths = [];
  const weaknesses = [];

  questions.forEach((q) => {
    if (q.type === 'rating' && q.weight) {
      const rating = answers[q.id];
      if (rating && typeof rating === 'number') {
        if (rating >= 4) {
          strengths.push({
            question: q.text,
            rating: rating,
            weight: q.weight
          });
        } else if (rating <= 2) {
          weaknesses.push({
            question: q.text,
            rating: rating,
            weight: q.weight
          });
        }
      }
    }
  });

  // Сортируем по весу (более важные вопросы выше)
  strengths.sort((a, b) => b.weight - a.weight);
  weaknesses.sort((a, b) => b.weight - a.weight);

  return { strengths, weaknesses };
}

/**
 * Рассчитывает средний ИКОП по всем ответам
 * @param {Array} responses - Массив ответов с ИКОП
 * @returns {Number} - Средний ИКОП
 */
function calculateAverageIKOP(responses) {
  if (!responses || responses.length === 0) {
    return null;
  }

  const validIKOPs = responses
    .filter((r) => r.ikop !== null && r.ikop !== undefined)
    .map((r) => r.ikop);

  if (validIKOPs.length === 0) {
    return null;
  }

  const sum = validIKOPs.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / validIKOPs.length);
}

/**
 * Генерирует рекомендации на основе ИКОП и анализа компонентов
 * @param {Number} ikop - Значение ИКОП
 * @param {Object} analysis - Результат analyzeIKOPComponents
 * @returns {Array} - Массив рекомендаций
 */
function generateRecommendations(ikop, analysis) {
  const recommendations = [];

  if (ikop >= 80) {
    recommendations.push({
      type: 'success',
      text: 'Продолжайте в том же духе! Студенты высоко оценивают качество занятий.'
    });
  }

  if (analysis.weaknesses.length > 0) {
    analysis.weaknesses.slice(0, 3).forEach((weakness) => {
      recommendations.push({
        type: 'warning',
        text: `Обратите внимание: "${weakness.question}" получила низкую оценку (${weakness.rating}/5)`
      });
    });
  }

  if (ikop < 60) {
    recommendations.push({
      type: 'error',
      text: 'Рекомендуется провести детальный анализ и разработать план улучшений'
    });
  }

  return recommendations;
}

module.exports = {
  calculateIKOP,
  getIKOPZone,
  analyzeIKOPComponents,
  calculateAverageIKOP,
  generateRecommendations
};
