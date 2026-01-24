const Poll = require('../models/Poll');
const User = require('../models/User');

/**
 * Получить полную статистику студента
 */
exports.getMyStatistics = async (userId, userGroup) => {
  // Получаем все опросы, в которых студент участвовал
  const polls = await Poll.find({
    pollType: 'lesson_review',
    voted_users: userId
  }).lean();

  if (polls.length === 0) {
    return getEmptyStatistics();
  }

  // Извлекаем ответы студента
  const myResponses = [];
  const allGroupResponses = []; // Ответы всей группы для сравнения

  polls.forEach(poll => {
    // Мои ответы
    const myResponse = poll.responses.find(r => 
      r.user_id && r.user_id.toString() === userId.toString()
    );
    
    if (myResponse) {
      myResponses.push({
        ...myResponse,
        subject: poll.lessonContext?.subject,
        teacher: poll.lessonContext?.teacher,
        date: poll.lessonContext?.date || poll.created_at,
        topic: poll.lessonContext?.topic
      });
    }

    // Ответы группы (для сравнения)
    poll.responses.forEach(r => {
      if (r.user_group === userGroup) {
        allGroupResponses.push({
          ...r,
          subject: poll.lessonContext?.subject,
          date: poll.lessonContext?.date || poll.created_at
        });
      }
    });
  });

  // Рассчитываем метрики
  const summary = calculateSummary(myResponses, allGroupResponses, userGroup);
  const bySubject = calculateBySubject(myResponses, allGroupResponses);
  const avgRatings = calculateAvgRatings(myResponses, allGroupResponses);
  const dynamics = calculateDynamics(myResponses, allGroupResponses);
  const myComments = extractComments(myResponses);

  return {
    summary,
    bySubject,
    avgRatings,
    dynamics,
    myComments
  };
};

/**
 * Рассчитать сводку
 */
function calculateSummary(myResponses, groupResponses, userGroup) {
  // Количество опросов
  const pollsCompleted = myResponses.length;

  // Мой средний ИКОП
  const myIkops = myResponses.filter(r => r.ikop != null).map(r => r.ikop);
  const myAvgIkop = myIkops.length > 0
    ? Math.round(myIkops.reduce((sum, v) => sum + v, 0) / myIkops.length)
    : 0;

  // Средний ИКОП группы
  const groupIkops = groupResponses.filter(r => r.ikop != null).map(r => r.ikop);
  const groupAvgIkop = groupIkops.length > 0
    ? Math.round(groupIkops.reduce((sum, v) => sum + v, 0) / groupIkops.length)
    : 0;

  // Место в группе (по среднему ИКОП)
  const userIkopsByUser = {};
  groupResponses.forEach(r => {
    if (r.ikop != null && r.user_id) {
      const userId = r.user_id.toString();
      if (!userIkopsByUser[userId]) {
        userIkopsByUser[userId] = [];
      }
      userIkopsByUser[userId].push(r.ikop);
    }
  });

  const avgsByUser = Object.entries(userIkopsByUser)
    .map(([userId, ikops]) => ({
      userId,
      avgIkop: ikops.reduce((sum, v) => sum + v, 0) / ikops.length
    }))
    .sort((a, b) => b.avgIkop - a.avgIkop);

  const myUserId = myResponses[0]?.user_id?.toString();
  const myRank = avgsByUser.findIndex(u => u.userId === myUserId) + 1;
  const totalStudents = avgsByUser.length;

  return {
    pollsCompleted,
    myAvgIkop,
    groupAvgIkop,
    myRank: myRank > 0 ? myRank : null,
    totalStudents
  };
}

/**
 * Рассчитать статистику по дисциплинам
 */
function calculateBySubject(myResponses, groupResponses) {
  const subjects = {};

  // Мои оценки по дисциплинам
  myResponses.forEach(r => {
    const subject = r.subject || 'Неизвестно';
    if (!subjects[subject]) {
      subjects[subject] = {
        subject,
        myIkops: [],
        groupIkops: [],
        count: 0
      };
    }
    if (r.ikop != null) {
      subjects[subject].myIkops.push(r.ikop);
      subjects[subject].count++;
    }
  });

  // Оценки группы по дисциплинам
  groupResponses.forEach(r => {
    const subject = r.subject || 'Неизвестно';
    if (subjects[subject] && r.ikop != null) {
      subjects[subject].groupIkops.push(r.ikop);
    }
  });

  // Формируем итоговый массив
  const result = Object.values(subjects).map(s => ({
    subject: s.subject,
    myAvgIkop: Math.round(s.myIkops.reduce((sum, v) => sum + v, 0) / s.myIkops.length),
    groupAvgIkop: s.groupIkops.length > 0
      ? Math.round(s.groupIkops.reduce((sum, v) => sum + v, 0) / s.groupIkops.length)
      : 0,
    lessonsCompleted: s.count
  }));

  return result.sort((a, b) => b.myAvgIkop - a.myAvgIkop);
}

/**
 * Рассчитать средние оценки по 5 критериям (для radar chart)
 */
function calculateAvgRatings(myResponses, groupResponses) {
  const questionIds = ['q1_relevance', 'q2_clarity', 'q3_practice', 'q4_engagement', 'q5_organization'];
  const questionNames = {
    q1_relevance: 'Актуальность',
    q2_clarity: 'Понятность',
    q3_practice: 'Практика',
    q4_engagement: 'Вовлеченность',
    q5_organization: 'Организация'
  };

  const myRatings = {};
  const groupRatings = {};

  questionIds.forEach(qId => {
    myRatings[qId] = [];
    groupRatings[qId] = [];
  });

  // Собираем мои оценки
  myResponses.forEach(r => {
    questionIds.forEach(qId => {
      const rating = r.answers?.[qId];
      if (rating && typeof rating === 'number' && rating >= 1 && rating <= 5) {
        myRatings[qId].push(rating);
      }
    });
  });

  // Собираем оценки группы
  groupResponses.forEach(r => {
    questionIds.forEach(qId => {
      const rating = r.answers?.[qId];
      if (rating && typeof rating === 'number' && rating >= 1 && rating <= 5) {
        groupRatings[qId].push(rating);
      }
    });
  });

  // Рассчитываем средние
  const result = questionIds.map(qId => ({
    criterion: questionNames[qId],
    myAvg: myRatings[qId].length > 0
      ? parseFloat((myRatings[qId].reduce((sum, v) => sum + v, 0) / myRatings[qId].length).toFixed(1))
      : 0,
    groupAvg: groupRatings[qId].length > 0
      ? parseFloat((groupRatings[qId].reduce((sum, v) => sum + v, 0) / groupRatings[qId].length).toFixed(1))
      : 0
  }));

  return result;
}

/**
 * Рассчитать динамику ИКОП во времени
 */
function calculateDynamics(myResponses, groupResponses) {
  // Группируем по месяцам
  const myByMonth = {};
  const groupByMonth = {};

  myResponses.forEach(r => {
    if (r.ikop != null && r.date) {
      const date = new Date(r.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!myByMonth[monthKey]) {
        myByMonth[monthKey] = [];
      }
      myByMonth[monthKey].push(r.ikop);
    }
  });

  groupResponses.forEach(r => {
    if (r.ikop != null && r.date) {
      const date = new Date(r.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!groupByMonth[monthKey]) {
        groupByMonth[monthKey] = [];
      }
      groupByMonth[monthKey].push(r.ikop);
    }
  });

  // Получаем все уникальные месяцы
  const allMonths = new Set([...Object.keys(myByMonth), ...Object.keys(groupByMonth)]);
  
  const result = Array.from(allMonths)
    .sort()
    .map(month => ({
      period: formatMonth(month),
      myIkop: myByMonth[month]
        ? Math.round(myByMonth[month].reduce((sum, v) => sum + v, 0) / myByMonth[month].length)
        : null,
      groupIkop: groupByMonth[month]
        ? Math.round(groupByMonth[month].reduce((sum, v) => sum + v, 0) / groupByMonth[month].length)
        : null
    }))
    .filter(item => item.myIkop !== null || item.groupIkop !== null);

  return result;
}

/**
 * Извлечь комментарии студента
 */
function extractComments(myResponses) {
  const comments = [];

  myResponses.forEach(r => {
    const comment = r.answers?.q6_comment;
    if (comment && typeof comment === 'string' && comment.trim().length > 0) {
      comments.push({
        text: comment.trim(),
        subject: r.subject,
        date: r.submitted_at || r.date,
        topic: r.topic
      });
    }
  });

  return comments.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * Вспомогательные функции
 */
function formatMonth(monthKey) {
  const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const [year, month] = monthKey.split('-');
  return `${months[parseInt(month) - 1]} ${year}`;
}

function getEmptyStatistics() {
  return {
    summary: {
      pollsCompleted: 0,
      myAvgIkop: 0,
      groupAvgIkop: 0,
      myRank: null,
      totalStudents: 0
    },
    bySubject: [],
    avgRatings: [
      { criterion: 'Актуальность', myAvg: 0, groupAvg: 0 },
      { criterion: 'Понятность', myAvg: 0, groupAvg: 0 },
      { criterion: 'Практика', myAvg: 0, groupAvg: 0 },
      { criterion: 'Вовлеченность', myAvg: 0, groupAvg: 0 },
      { criterion: 'Организация', myAvg: 0, groupAvg: 0 }
    ],
    dynamics: [],
    myComments: []
  };
}
