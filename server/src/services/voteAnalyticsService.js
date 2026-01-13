const buildVoteAnalytics = (poll, userId, includeGroup = true) => {
  if (!poll) return null;

  const totalResponses = poll.responses?.length || 0;
  // Предполагаем, что размер группы неизвестен — оставляем null, фронт может не использовать
  const totalStudents = null;

  const myEntry = poll.responses.find(r => r.user_id && r.user_id.toString() === userId.toString());
  const myAnswers = myEntry?.answers;

  const questionIds = new Set();
  const questionTexts = {};
  if (poll.questions && poll.questions.length) {
    poll.questions.forEach(q => {
      if (q.type && q.type.includes('rating')) {
        questionIds.add(String(q.id));
        questionTexts[String(q.id)] = q.text || `Вопрос ${q.id}`;
      }
    });
  } else if (typeof myAnswers === 'object' && !Array.isArray(myAnswers)) {
    Object.keys(myAnswers).forEach(k => questionIds.add(k));
  }

  const myRatings = {};
  const avgRatings = {};
  const distributionPerQuestion = {};

  // Собираем средние и распределения по вопросам
  questionIds.forEach((qid) => {
    const ratings = [];
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    poll.responses.forEach(resp => {
      const ans = resp.answers;
      if (ans && typeof ans === 'object' && !Array.isArray(ans)) {
        const val = ans[qid] ?? ans[Number(qid)];
        if (typeof val === 'number' && val >= 1 && val <= 5) {
          ratings.push(val);
          dist[val] += 1;
        }
      } else if (typeof ans === 'number' && questionIds.size === 1) {
        ratings.push(ans);
        if (ans >= 1 && ans <= 5) dist[ans] += 1;
      }
    });
    if (ratings.length) {
      avgRatings[qid] = Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2));
    }
    distributionPerQuestion[qid] = dist;
  });

  if (myAnswers && typeof myAnswers === 'object' && !Array.isArray(myAnswers)) {
    Object.keys(myAnswers).forEach(k => {
      const val = myAnswers[k];
      if (typeof val === 'number' && val >= 1 && val <= 5) {
        myRatings[k] = val;
      }
    });
  } else if (typeof myAnswers === 'number' && questionIds.size === 1) {
    const only = Array.from(questionIds)[0];
    myRatings[only] = myAnswers;
  }

  // Распределение оценок 1-5
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  poll.responses.forEach(r => {
    const ans = r.answers;
    if (typeof ans === 'number') {
      if (ans >= 1 && ans <= 5) distribution[ans] += 1;
    } else if (ans && typeof ans === 'object') {
      Object.values(ans).forEach(v => {
        if (typeof v === 'number' && v >= 1 && v <= 5) {
          distribution[v] += 1;
        }
      });
    }
  });

  return {
    totalResponses,
    totalStudents,
    myRatings,
    avgRatings,
    distribution,
    distributionPerQuestion,
    questionTexts
  };
};

module.exports = { buildVoteAnalytics };
