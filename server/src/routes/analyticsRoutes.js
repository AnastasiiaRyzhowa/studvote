const express = require('express');
const router = express.Router();
const Poll = require('../models/Poll');
const Vote = require('../models/Vote');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');
const mongoose = require('mongoose');

const NEGATIVE_ALERT_THRESHOLD = Number(process.env.NEGATIVE_ALERT_THRESHOLD || 3);

const calcStartDate = (timeRange) => {
  const now = new Date();
  const start = new Date();
  if (timeRange === 'week') {
    start.setDate(now.getDate() - 7);
  } else if (timeRange === 'quarter') {
    start.setMonth(now.getMonth() - 3);
  } else {
    // default month
    start.setMonth(now.getMonth() - 1);
  }
  return { now, start };
};

// GET /api/analytics/filters
router.get('/filters', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { faculty, course, program } = req.query;

    const facultyList = await User.distinct('faculty', { role: 'student' }).then(list => list.filter(Boolean).sort());

    let programs = [];
    const programFilter = { role: 'student' };
    if (faculty) programFilter.faculty = faculty;
    programs = await User.distinct('program', programFilter).then(list => list.filter(Boolean).sort());

    let courses = [];
    const courseFilter = { role: 'student' };
    if (faculty) courseFilter.faculty = faculty;
    if (program) courseFilter.program = program;
    courses = await User.distinct('course', courseFilter).then(list => list.filter(Number.isFinite).sort((a, b) => a - b));

    let groups = [];
    const groupFilter = { role: 'student' };
    if (faculty) groupFilter.faculty = faculty;
    if (program) groupFilter.program = program;
    if (course) groupFilter.course = Number(course);
    groups = await User.distinct('group', groupFilter).then(list => list.filter(Boolean).sort());

    const subjects = await Poll.distinct('subject_name').then(list => list.filter(Boolean).sort());
    const teachers = await Poll.distinct('teacher_name').then(list => list.filter(Boolean).sort());

    res.json({
      faculties: facultyList,
      programs,
      courses,
      groups,
      subjects,
      teachers
    });
  } catch (error) {
    console.error('Ошибка в /analytics/filters:', error);
    res.status(500).json({ error: 'Ошибка загрузки фильтров' });
  }
});

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

router.get('/dashboard', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { faculty, course, group, subject, teacher, pollType, timeRange = 'month' } = req.query;
    const { now, start } = calcStartDate(timeRange);
    const prevStart = new Date(start);
    if (timeRange === 'week') {
      prevStart.setDate(start.getDate() - 7);
    } else if (timeRange === 'quarter') {
      prevStart.setMonth(start.getMonth() - 3);
    } else {
      prevStart.setMonth(start.getMonth() - 1);
    }

    const userFilter = { role: 'student' };
    if (faculty) userFilter.faculty = faculty;
    if (course) userFilter.course = Number(course);
    if (group) userFilter.group = group;

    const studentDocs = await User.find(userFilter).select('_id group').lean();
    const studentIdList = studentDocs.map(u => u._id);
    const filteredStudents = studentIdList.length;
    const totalStudentsAll = await User.countDocuments({ role: 'student' });

    // build pollMatch early (subject/teacher/pollType filters)
    const pollAndConditions = [];
    if (subject) {
      pollAndConditions.push({
        $or: [
          { 'lessonContext.subject': subject },
          { subject_name: subject }
        ]
      });
    }
    if (teacher) {
      pollAndConditions.push({
        $or: [
          { 'lessonContext.teacher': teacher },
          { teacher_name: teacher }
        ]
      });
    }
    if (pollType) {
      pollAndConditions.push({ pollType });
    }
    const pollMatch = pollAndConditions.length ? { $and: pollAndConditions } : {};

    // overview stats
    const totalPolls = await Poll.countDocuments({ createdAt: { $gte: start }, ...pollMatch });
    const totalResponsesAgg = await Poll.aggregate([
      { $match: { ...pollMatch } },
      { $unwind: '$responses' },
      {
        $match: {
          'responses.submitted_at': { $gte: start },
          ...(filteredStudents ? { 'responses.user_id': { $in: studentIdList } } : {})
        }
      },
      { $count: 'cnt' }
    ]);
    const totalResponses = totalResponsesAgg.length ? totalResponsesAgg[0].cnt : 0;
    const totalStudents = filteredStudents;

    const activeStudentsNow = totalStudents > 0
      ? await Poll.aggregate([
          { $match: { ...pollMatch } },
          { $unwind: '$responses' },
          { $match: { 'responses.submitted_at': { $gte: start }, 'responses.user_id': { $in: studentIdList } } },
          { $group: { _id: '$responses.user_id' } }
        ])
      : [];
    const activeStudentsPrev = totalStudents > 0
      ? await Poll.aggregate([
          { $match: { ...pollMatch } },
          { $unwind: '$responses' },
          { $match: { 'responses.submitted_at': { $gte: prevStart, $lt: start }, 'responses.user_id': { $in: studentIdList } } },
          { $group: { _id: '$responses.user_id' } }
        ])
      : [];

    const averageActivity = totalStudents > 0 ? Math.round((activeStudentsNow.length / totalStudents) * 100) : 0;
    const prevActivity = totalStudents > 0 ? Math.round((activeStudentsPrev.length / totalStudents) * 100) : 0;
    const activityTrend = averageActivity - prevActivity;

    // average satisfaction (numeric answers in poll responses) with subject/teacher filter
    const ratingAgg = await Poll.aggregate([
      { $match: pollMatch },
      { $unwind: '$responses' },
      { $match: { 'responses.submitted_at': { $gte: start }, ...(filteredStudents ? { 'responses.user_id': { $in: studentIdList } } : {}) } },
      {
        $project: {
          val: '$responses.answers'
        }
      },
      {
        $addFields: {
          numericVal: {
            $cond: [
              { $isNumber: '$val' },
              '$val',
              {
                $cond: [
                  { $eq: [{ $type: '$val' }, 'object'] },
                  {
                    $let: {
                      vars: {
                        nums: {
                          $filter: {
                            input: { $objectToArray: '$val' },
                            as: 'el',
                            cond: { $isNumber: '$$el.v' }
                          }
                        }
                      },
                      in: {
                        $cond: [
                          { $gt: [{ $size: '$$nums' }, 0] },
                          {
                            $avg: '$$nums.v'
                          },
                          null
                        ]
                      }
                    }
                  },
                  null
                ]
              }
            ]
          }
        }
      },
      { $match: { numericVal: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$numericVal' } } }
    ]);
    const averageSatisfaction = ratingAgg.length ? Math.round(ratingAgg[0].avg * 10) / 10 : 0;
    const ikopNow = calcIkop(averageSatisfaction);

    const prevRatingAgg = await Poll.aggregate([
      { $match: pollMatch },
      { $unwind: '$responses' },
      { $match: { 'responses.submitted_at': { $gte: prevStart, $lt: start }, ...(filteredStudents ? { 'responses.user_id': { $in: studentIdList } } : {}) } },
      {
        $project: {
          val: '$responses.answers'
        }
      },
      {
        $addFields: {
          numericVal: {
            $cond: [
              { $isNumber: '$val' },
              '$val',
              {
                $cond: [
                  { $eq: [{ $type: '$val' }, 'object'] },
                  {
                    $let: {
                      vars: {
                        nums: {
                          $filter: {
                            input: { $objectToArray: '$val' },
                            as: 'el',
                            cond: { $isNumber: '$$el.v' }
                          }
                        }
                      },
                      in: {
                        $cond: [
                          { $gt: [{ $size: '$$nums' }, 0] },
                          {
                            $avg: '$$nums.v'
                          },
                          null
                        ]
                      }
                    }
                  },
                  null
                ]
              }
            ]
          }
        }
      },
      { $match: { numericVal: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$numericVal' } } }
    ]);
    const prevSatisfaction = prevRatingAgg.length ? Math.round(prevRatingAgg[0].avg * 10) / 10 : 0;
    const satisfactionTrend = Math.round((averageSatisfaction - prevSatisfaction) * 10) / 10;
    const ikopPrev = calcIkop(prevSatisfaction);

    // alerts: simple placeholder based on low ratings
    const alerts = [];
    const lowSubjects = await Poll.aggregate([
      { $match: { ...pollMatch, 'lessonContext.subject': { $exists: true } } },
      { $unwind: '$responses' },
      { $match: { 'responses.submitted_at': { $gte: start }, ...(filteredStudents ? { 'responses.user_id': { $in: studentIdList } } : {}) } },
      { $project: { subject: '$lessonContext.subject', val: '$responses.answers' } },
      { $addFields: { numericVal: { $cond: [{ $isNumber: '$val' }, '$val', null] } } },
      { $match: { numericVal: { $ne: null } } },
      { $group: { _id: '$subject', avg: { $avg: '$numericVal' }, count: { $sum: 1 } } },
      { $match: { avg: { $lt: 3.5 }, count: { $gte: 5 } } },
      { $limit: 5 }
    ]);
    lowSubjects.forEach(s => {
      alerts.push({
        type: 'warning',
        severity: 'medium',
        title: `Дисциплина "${s._id}": низкая оценка ${s.avg.toFixed(1)}`,
        description: `Получено ${s.count} оценок`,
        recommendation: 'Посмотрите комментарии студентов',
        actionUrl: `/analytics/comments?subject=${encodeURIComponent(s._id)}`
      });
    });

    // weekly trend based on votes
    const weeks = [];
    const weeksCount = timeRange === 'week' ? 1 : timeRange === 'quarter' ? 12 : 4;
    for (let i = weeksCount - 1; i >= 0; i--) {
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() - (i * 7));
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 7);
      const weekActiveAgg = await Poll.aggregate([
        { $match: { ...pollMatch } },
        { $unwind: '$responses' },
        {
          $match: {
            'responses.submitted_at': { $gte: weekStart, $lt: weekEnd },
            ...(filteredStudents ? { 'responses.user_id': { $in: studentIdList } } : {})
          }
        },
        { $group: { _id: '$responses.user_id' } }
      ]);
      const value = totalStudents > 0 ? Math.round((weekActiveAgg.length / totalStudents) * 100) : 0;
      weeks.push({ label: `Нед ${weeksCount - i}`, value });
    }
    const avgActivity = weeks.length ? Math.round(weeks.reduce((s, w) => s + w.value, 0) / weeks.length) : 0;
    const bestWeek = weeks.reduce((max, w) => w.value > (max?.value ?? -Infinity) ? w : max, null) || { label: '-', value: 0 };
    const worstWeek = weeks.reduce((min, w) => w.value < (min?.value ?? Infinity) ? w : min, null) || { label: '-', value: 0 };

    // top ratings (simplified)
    const topSubjects = await Poll.aggregate([
      { $match: { ...pollMatch, 'lessonContext.subject': { $exists: true } } },
      { $unwind: '$responses' },
      { $match: { 'responses.submitted_at': { $gte: start }, ...(filteredStudents ? { 'responses.user_id': { $in: studentIdList } } : {}) } },
      { $project: { subject: '$lessonContext.subject', val: '$responses.answers' } },
      { $addFields: { numericVal: { $cond: [{ $isNumber: '$val' }, '$val', null] } } },
      { $match: { numericVal: { $ne: null } } },
      { $group: { _id: '$subject', avg: { $avg: '$numericVal' }, count: { $sum: 1 } } },
      { $match: { count: { $gte: 3 } } },
      { $sort: { avg: -1 } },
      { $limit: 3 }
    ]);

    const topTeachers = await Poll.aggregate([
      { $match: { ...pollMatch, pollType: 'teacher_feedback', 'lessonContext.teacher': { $exists: true } } },
      { $unwind: '$responses' },
      { $match: { 'responses.submitted_at': { $gte: start }, ...(filteredStudents ? { 'responses.user_id': { $in: studentIdList } } : {}) } },
      { $project: { teacher: '$lessonContext.teacher', val: '$responses.answers' } },
      { $addFields: { numericVal: { $cond: [{ $isNumber: '$val' }, '$val', null] } } },
      { $match: { numericVal: { $ne: null } } },
      { $group: { _id: '$teacher', avg: { $avg: '$numericVal' }, count: { $sum: 1 } } },
      { $match: { count: { $gte: 5 } } },
      { $sort: { avg: -1 } },
      { $limit: 3 }
    ]);

    const groupActivityAgg = await Poll.aggregate([
      { $match: { ...pollMatch } },
      { $unwind: '$responses' },
      { $match: { 'responses.submitted_at': { $gte: start }, ...(filteredStudents ? { 'responses.user_id': { $in: studentIdList } } : {}) } },
      { $group: { _id: '$responses.user_group', votes: { $sum: 1 } } },
      { $sort: { votes: -1 } },
      { $limit: 3 }
    ]);

    res.json({
      filters: { faculty: faculty || null, course: course ? Number(course) : null, group: group || null },
      students: { matched: filteredStudents, total: totalStudentsAll },
      overview: {
        totalPolls,
        totalResponses,
        averageActivity,
        activityTrend,
        averageSatisfaction,
        satisfactionTrend,
        ikop: ikopNow.score,
        ikopZone: ikopNow.zone,
        ikopTrend: Number((ikopNow.score - ikopPrev.score).toFixed(3)),
        activeProblems: alerts.length
      },
      alerts: alerts.slice(0, 5),
      activityTrend: {
        labels: weeks.map(w => w.label),
        data: weeks.map(w => w.value),
        average: avgActivity,
        best: { week: bestWeek.label, value: bestWeek.value },
        worst: { week: worstWeek.label, value: worstWeek.value }
      },
      topRatings: {
        groups: groupActivityAgg.map(g => ({
          name: g._id || '—',
          value: g.votes,
          trend: 'stable'
        })),
        subjects: topSubjects.map(s => ({
          name: s._id,
          value: Math.round(s.avg * 10) / 10,
          count: s.count
        })),
        teachers: topTeachers.map(t => ({
          name: t._id,
          value: Math.round(t.avg * 10) / 10,
          count: t.count
        }))
      }
    });
  } catch (error) {
    console.error('Ошибка в /analytics/dashboard:', error);
    res.status(500).json({ error: 'Ошибка при загрузке дашборда' });
  }
});

router.get('/breakdown', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { faculty, timeRange = 'month' } = req.query;
    const { start } = calcStartDate(timeRange);
    // Простая заглушка пока без детальных срезов
    res.json({
      breadcrumb: ['Университет', faculty || 'Все', 'Обзор'],
      comparison: { groups: [], average: {} },
      insights: [],
      comparisonWithOthers: {},
      periodStart: start
    });
  } catch (error) {
    console.error('Ошибка в /analytics/breakdown:', error);
    res.status(500).json({ error: 'Ошибка при загрузке срезов' });
  }
});

// Build user filter based on query
const buildUserFilter = ({ faculty, program, course, group }) => {
  const filter = { role: 'student' };
  if (faculty) filter.faculty = faculty;
  if (program) filter.program = program;
  if (course) filter.course = Number(course);
  if (group) filter.group = group;
  return filter;
};

// GET /api/analytics/deep-dive
// level: faculty|course|group|subject|teacher
router.get('/deep-dive', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { level = 'faculty', id, faculty, program, course, group, timeRange = 'month' } = req.query;
    const { start } = calcStartDate(timeRange);

    const userFilter = buildUserFilter({ faculty, program, course, group });
    const students = await User.find(userFilter).select('_id faculty course group').lean();
    const studentIds = students.map(s => s._id);

    // votes by users in time range
    const voteMatch = { voted_at: { $gte: start } };
    if (studentIds.length) voteMatch.user_id = { $in: studentIds };

    // Aggregate by group
    const groupAgg = await Vote.aggregate([
      { $match: voteMatch },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $match: userFilter },
      {
        $group: {
          _id: '$user.group',
          votes: { $sum: 1 }
        }
      }
    ]);

    // Group sizes
    const groupSizes = students.reduce((acc, s) => {
      acc[s.group] = (acc[s.group] || 0) + 1;
      return acc;
    }, {});

    const groups = groupAgg.map(g => {
      const size = groupSizes[g._id] || 0;
      const activity = size ? Math.round((g.votes / size) * 100) : 0;
      return {
        name: g._id || 'Не указана',
        activity,
        votes: g.votes,
        size
      };
    }).sort((a, b) => b.activity - a.activity);

    const avgActivity = groups.length ? Math.round(groups.reduce((s, g) => s + g.activity, 0) / groups.length) : 0;
    const leader = groups[0];
    const laggard = groups[groups.length - 1];

    const insights = [];
    if (leader) {
      insights.push({
        type: 'leader',
        title: `Лидер: ${leader.name}`,
        details: [`Активность ${leader.activity}%`, `Размер группы: ${leader.size}`]
      });
    }
    if (laggard && laggard !== leader) {
      insights.push({
        type: 'problem',
        title: `Проблемная группа: ${laggard.name}`,
        details: [`Активность ${laggard.activity}%`, `Голоса: ${laggard.votes}`],
        recommendation: 'Проверить вовлеченность и провести дополнительный опрос'
      });
    }

    // Comparison with other courses (if course level)
    let comparisonWithOthers = {};
    if (level === 'course' && faculty) {
      const courseAgg = await Vote.aggregate([
        { $match: voteMatch },
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        { $match: { role: 'student', faculty } },
        {
          $group: {
            _id: '$user.course',
            votes: { $sum: 1 },
            students: { $addToSet: '$user_id' }
          }
        }
      ]);
      const courseStats = courseAgg.map(c => {
        const size = c.students.length;
        const activity = size ? Math.round((c.votes / size) * 100) : 0;
        return { name: `${c._id} курс`, value: activity };
      });
      comparisonWithOthers = { courses: courseStats };
    }

    res.json({
      breadcrumb: ['Университет', faculty || 'Все факультеты', program || 'Все программы', course ? `${course} курс` : 'Все курсы', group || 'Все группы'],
      comparison: {
        groups,
        average: { activity: avgActivity }
      },
      insights,
      comparisonWithOthers
    });
  } catch (error) {
    console.error('Ошибка в /analytics/deep-dive:', error);
    res.status(500).json({ error: 'Ошибка при загрузке детальной аналитики' });
  }
});

// GET /api/analytics/correlations
router.get('/correlations', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { faculty, program, course, group, timeRange = 'month', clarityQuestionId = 1, engagementQuestionId = 2 } = req.query;
    const { start } = calcStartDate(timeRange);
    const userFilter = buildUserFilter({ faculty, program, course, group });
    const students = await User.find(userFilter).select('_id group').lean();
    const studentIds = students.map(s => s._id);
    const voteMatch = { voted_at: { $gte: start } };
    if (studentIds.length) voteMatch.user_id = { $in: studentIds };

    // Размеры групп для расчёта явки
    const groupSizes = students.reduce((acc, s) => {
      if (!s.group) return acc;
      acc[s.group] = (acc[s.group] || 0) + 1;
      return acc;
    }, {});

    // Корреляция 1: явка (голоса/размер группы) vs средний рейтинг (по ответам Poll)
    const ratingAgg = await Poll.aggregate([
      { $match: {} },
      { $unwind: '$responses' },
      {
        $match: {
          'responses.submitted_at': { $gte: start },
          ...(studentIds.length ? { 'responses.user_id': { $in: studentIds } } : {})
        }
      },
      {
        $project: {
          group: '$responses.user_group',
          val: '$responses.answers'
        }
      },
      {
        $addFields: {
          numericVal: {
            $cond: [
              { $isNumber: '$val' },
              '$val',
              {
                $cond: [
                  { $eq: [{ $type: '$val' }, 'object'] },
                  {
                    $let: {
                      vars: {
                        nums: {
                          $filter: {
                            input: { $objectToArray: '$val' },
                            as: 'el',
                            cond: { $isNumber: '$$el.v' }
                          }
                        }
                      },
                      in: {
                        $cond: [
                          { $gt: [{ $size: '$$nums' }, 0] },
                          { $avg: '$$nums.v' },
                          null
                        ]
                      }
                    }
                  },
                  null
                ]
              }
            ]
          }
        }
      },
      { $match: { numericVal: { $ne: null }, group: { $ne: null } } },
      {
        $group: {
          _id: '$group',
          avgRating: { $avg: '$numericVal' },
          votes: { $sum: 1 }
        }
      }
    ]);

    const turnoutPoints = ratingAgg.map(r => {
      const size = groupSizes[r._id] || 0;
      const turnout = size ? Math.round((r.votes / size) * 100) : 0;
      return { group: r._id, x: turnout, y: Math.round(r.avgRating * 10) / 10, votes: r.votes, size };
    }).filter(p => p.size > 0);

    const turnoutCoeff = calculatePearson(turnoutPoints.map(p => p.x), turnoutPoints.map(p => p.y));

    // Корреляция 2: активность голосований (голоса/студент) vs размер группы
    const groupAgg = await Vote.aggregate([
      { $match: voteMatch },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $match: userFilter },
      {
        $group: {
          _id: '$user.group',
          votes: { $sum: 1 },
          students: { $addToSet: '$user_id' }
        }
      }
    ]);

    const activityPoints = groupAgg.map(g => {
      const size = g.students.length || 1;
      const activity = Math.round((g.votes / size) * 100);
      return { group: g._id, x: size, y: activity };
    });
    const activityCoeff = calculatePearson(activityPoints.map(p => p.x), activityPoints.map(p => p.y));

    // Корреляция 3: понятность (clarity) vs вовлечённость (engagement) в опросах teacher_feedback
    const clarityIdNum = Number(clarityQuestionId);
    const engagementIdNum = Number(engagementQuestionId);
    const teacherPolls = await Poll.aggregate([
      { $match: { pollType: 'teacher_feedback' } },
      { $unwind: '$responses' },
      {
        $match: {
          'responses.submitted_at': { $gte: start },
          ...(studentIds.length ? { 'responses.user_id': { $in: studentIds } } : {})
        }
      },
      {
        $project: {
          answers: '$responses.answers',
          group: '$responses.user_group'
        }
      }
    ]);

    const clarityEngagementPoints = [];
    teacherPolls.forEach(p => {
      const ans = p.answers;
      if (ans && typeof ans === 'object') {
        const clarity = ans[clarityIdNum] || ans[String(clarityIdNum)];
        const engage = ans[engagementIdNum] || ans[String(engagementIdNum)];
        if (isNumber(clarity) && isNumber(engage)) {
          clarityEngagementPoints.push({ x: clarity, y: engage, group: p.group });
        }
      }
    });
    const ceCoeff = calculatePearson(
      clarityEngagementPoints.map(p => p.x),
      clarityEngagementPoints.map(p => p.y)
    );

    const correlations = [
      {
        id: 'turnout_vs_rating',
        title: 'Явка группы и средний рейтинг',
        coefficient: turnoutCoeff,
        strength: interpretStrength(turnoutCoeff),
        direction: interpretDirection(turnoutCoeff),
        scatterData: { points: turnoutPoints, xLabel: 'Явка, %', yLabel: 'Средний рейтинг' },
        conclusion: turnoutPoints.length ? 'Явка = ответы / размер группы; рейтинг = среднее по числовым ответам' : 'Недостаточно данных',
        recommendation: turnoutPoints.length ? 'Отслеживайте группы с низкой явкой и низким рейтингом' : 'Добавьте данные за период'
      },
      {
        id: 'activity_vs_group_size',
        title: 'Активность (голоса на студента) и размер группы',
        coefficient: activityCoeff,
        strength: interpretStrength(activityCoeff),
        direction: interpretDirection(activityCoeff),
        scatterData: { points: activityPoints, xLabel: 'Размер группы', yLabel: 'Голоса на студента, %' },
        conclusion: activityPoints.length ? 'Активность = голоса / число студентов' : 'Недостаточно данных',
        recommendation: activityPoints.length ? 'Сравните активность в крупных и малых группах' : 'Добавьте данные за период'
      },
      {
        id: 'clarity_vs_engagement',
        title: 'Понятность объяснений vs вовлечённость',
        coefficient: ceCoeff,
        strength: interpretStrength(ceCoeff),
        direction: interpretDirection(ceCoeff),
        scatterData: { points: clarityEngagementPoints, xLabel: 'Понятность (1-5)', yLabel: 'Вовлечённость (1-5)' },
        conclusion: clarityEngagementPoints.length ? 'Точки рассчитаны по опросам teacher_feedback (вопросы 1 и 2 по умолчанию)' : 'Недостаточно данных',
        recommendation: clarityEngagementPoints.length ? 'Низкая понятность часто тянет вовлечённость вниз — сверяйте тренды' : 'Нужно больше ответов'
      }
    ];

    res.json({ correlations });
  } catch (error) {
    console.error('Ошибка в /analytics/correlations:', error);
    res.status(500).json({ error: 'Ошибка при загрузке корреляций' });
  }
});

// ----------------- helpers -----------------
const calculatePearson = (xs, ys) => {
  if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length || xs.length < 2) {
    return 0;
  }
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  if (denom === 0) return 0;
  const r = num / denom;
  return Number(r.toFixed(3));
};

const interpretStrength = (r) => {
  const val = Math.abs(r);
  if (val >= 0.7) return 'strong';
  if (val >= 0.4) return 'medium';
  if (val >= 0.2) return 'weak';
  return 'very_weak';
};

const interpretDirection = (r) => {
  if (r > 0.05) return 'positive';
  if (r < -0.05) return 'negative';
  return 'no_clear_trend';
};

const isNumber = (v) => typeof v === 'number' && !Number.isNaN(v);

// ====================== SIMPLE STUDENT STATS ======================
router.get('/my-stats', authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Все ответы этого студента
    const responses = await Poll.aggregate([
      { $unwind: '$responses' },
      { $match: { 'responses.user_id': new mongoose.Types.ObjectId(userId) } },
      {
        $project: {
          subject: { $ifNull: ['$lessonContext.subject', '$subject_name'] },
          teacher: { $ifNull: ['$lessonContext.teacher', '$teacher_name'] },
          answers: '$responses.answers',
          submitted_at: '$responses.submitted_at'
        }
      }
    ]);

    let mySum = 0;
    let myCount = 0;
    const bySubject = {};

    const extractNumber = (val) => {
      if (typeof val === 'number') return val;
      if (val && typeof val === 'object') {
        const nums = Object.values(val).filter((v) => typeof v === 'number' && !Number.isNaN(v));
        if (nums.length) return nums.reduce((s, v) => s + v, 0) / nums.length;
      }
      return null;
    };

    responses.forEach((r) => {
      const num = extractNumber(r.answers);
      if (num !== null) {
        mySum += num;
        myCount += 1;
      }
      const subj = r.subject || 'Без дисциплины';
      if (!bySubject[subj]) {
        bySubject[subj] = {
          subject: subj,
          teacher: r.teacher || '',
          myRatings: [],
          myLessons: 0,
          groupAvg: null,
          groupCount: 0
        };
      }
      if (num !== null) {
        bySubject[subj].myRatings.push(num);
      }
      bySubject[subj].myLessons += 1;
    });

    // Рассчитать групповой средний по тем же дисциплинам
    const subjectKeys = Object.keys(bySubject);
    if (subjectKeys.length && user.group) {
      const groupAgg = await Poll.aggregate([
        { $unwind: '$responses' },
        {
          $match: {
            $and: [
              { 'responses.user_group': user.group },
              {
                $or: [
                  { 'lessonContext.subject': { $in: subjectKeys } },
                  { subject_name: { $in: subjectKeys } }
                ]
              }
            ]
          }
        },
        {
          $project: {
            subject: { $ifNull: ['$lessonContext.subject', '$subject_name'] },
            val: '$responses.answers'
          }
        },
        {
          $addFields: {
            num: {
              $cond: [
                { $isNumber: '$val' },
                '$val',
                {
                  $cond: [
                    { $eq: [{ $type: '$val' }, 'object'] },
                    {
                      $let: {
                        vars: {
                          nums: {
                            $filter: {
                              input: { $objectToArray: '$val' },
                              as: 'el',
                              cond: { $isNumber: '$$el.v' }
                            }
                          }
                        },
                        in: {
                          $cond: [
                            { $gt: [{ $size: '$$nums' }, 0] },
                            { $avg: '$$nums.v' },
                            null
                          ]
                        }
                      }
                    },
                    null
                  ]
                }
              ]
            }
          }
        },
        { $match: { num: { $ne: null } } },
        {
          $group: {
            _id: '$subject',
            avg: { $avg: '$num' },
            count: { $sum: 1 }
          }
        }
      ]);

      groupAgg.forEach((g) => {
        if (bySubject[g._id]) {
          bySubject[g._id].groupAvg = Number(g.avg.toFixed(2));
          bySubject[g._id].groupCount = g.count;
        }
      });
    }

    const subjects = Object.values(bySubject).map((s) => {
      const myAvg = s.myRatings.length
        ? Number((s.myRatings.reduce((a, b) => a + b, 0) / s.myRatings.length).toFixed(2))
        : 0;
      return {
        subject: s.subject,
        teacher: s.teacher,
        myAvg,
        lessonsCount: s.myLessons,
        groupAvg: s.groupAvg,
        groupCount: s.groupCount
      };
    });

    res.json({
      totalVoted: myCount,
      myAvgRating: myCount ? Number((mySum / myCount).toFixed(2)) : 0,
      subjects
    });
  } catch (error) {
    console.error('Error /my-stats:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// ====================== GROUP ANALYTICS (ADMIN) ======================
router.get('/group/:groupName', authenticate, authorize('admin'), async (req, res) => {
  try {
    const groupName = req.params.groupName;
    const students = await User.find({ role: 'student', group: groupName }).select('_id').lean();
    const totalStudents = students.length;

    const agg = await Poll.aggregate([
      { $unwind: '$responses' },
      { $match: { 'responses.user_group': groupName } },
      {
        $project: {
          subject: { $ifNull: ['$lessonContext.subject', '$subject_name'] },
          teacher: { $ifNull: ['$lessonContext.teacher', '$teacher_name'] },
          val: '$responses.answers'
        }
      },
      {
        $addFields: {
          num: {
            $cond: [
              { $isNumber: '$val' },
              '$val',
              {
                $cond: [
                  { $eq: [{ $type: '$val' }, 'object'] },
                  {
                    $let: {
                      vars: {
                        nums: {
                          $filter: {
                            input: { $objectToArray: '$val' },
                            as: 'el',
                            cond: { $isNumber: '$$el.v' }
                          }
                        }
                      },
                      in: {
                        $cond: [
                          { $gt: [{ $size: '$$nums' }, 0] },
                          { $avg: '$$nums.v' },
                          null
                        ]
                      }
                    }
                  },
                  null
                ]
              }
            ]
          }
        }
      },
      { $match: { num: { $ne: null } } },
      {
        $group: {
          _id: '$subject',
          teacher: { $first: '$teacher' },
          avg: { $avg: '$num' },
          responses: { $sum: 1 }
        }
      }
    ]);

    const subjects = agg.map((s) => {
      const avg = Number(s.avg.toFixed(2));
      let status = 'problem';
      if (avg >= 4.5) status = 'excellent';
      else if (avg >= 4.0) status = 'good';
      else if (avg >= 3.5) status = 'ok';
      return {
        subject: s._id || 'Без дисциплины',
        teacher: s.teacher || '',
        avgRating: avg,
        responses: s.responses,
        status
      };
    }).sort((a, b) => b.avgRating - a.avgRating);

    // Проблемная дисциплина — первая со статусом problem или минимальной оценкой
    const problemSubject = subjects.find((s) => s.status === 'problem') || (subjects.length ? subjects[subjects.length - 1] : null);

    // Активность: уникальные студенты, ответившие
    const activeStudentsAgg = await Poll.aggregate([
      { $unwind: '$responses' },
      { $match: { 'responses.user_group': groupName } },
      { $group: { _id: '$responses.user_id' } }
    ]);
    const activeStudents = activeStudentsAgg.length;
    const activity = totalStudents > 0 ? Math.round((activeStudents / totalStudents) * 100) : 0;

    res.json({
      groupName,
      totalStudents,
      activeStudents,
      activity,
      subjects,
      problemSubject
    });
  } catch (error) {
    console.error('Error /group/:groupName', error);
    res.status(500).json({ error: 'Ошибка получения аналитики' });
  }
});

// GET /api/analytics/text-analysis
router.get('/text-analysis', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { faculty, program, course, group, subject, teacher, timeRange = 'month' } = req.query;
    const { start } = calcStartDate(timeRange);

    const userFilter = buildUserFilter({ faculty, program, course, group });
    const students = await User.find(userFilter).select('_id').lean();
    const studentIds = students.map(s => s._id);

    const pollMatch = {};
    if (subject) pollMatch['lessonContext.subject'] = subject;
    if (teacher) pollMatch['lessonContext.teacher'] = teacher;

    const polls = await Poll.find(pollMatch).lean();
    const texts = [];
    const positiveWords = ['хорошо', 'понравилось', 'отлично', 'нравится', 'понятно', 'интересно', 'актуально', 'полезно'];
    const negativeWords = ['плохо', 'непонятно', 'сложно', 'не нравится', 'хуже', 'плохо объяснил', 'устаревший', 'скучно', 'нет примеров'];

    polls.forEach(p => {
      (p.responses || []).forEach(r => {
        if (r.submitted_at && new Date(r.submitted_at) < start) return;
        if (studentIds.length && !studentIds.find(id => id.toString() === (r.user_id || '').toString())) return;
        if (typeof r.answers === 'string' && r.answers.trim()) {
          texts.push(r.answers.trim());
        } else if (r.raw_responses && Array.isArray(r.raw_responses)) {
          r.raw_responses.forEach(ans => {
            if (ans && ans.type === 'text' && typeof ans.value === 'string' && ans.value.trim()) {
              texts.push(ans.value.trim());
            }
          });
        }
      });
    });

    // word frequency + ngrams
    const freq = {};
    const bigrams = {};
    const trigrams = {};
    const tokenize = (t) => t.toLowerCase().replace(/[.,!?;:()"]/g, '').split(/\s+/).filter(Boolean);
    texts.forEach(t => {
      const tokens = tokenize(t);
      tokens.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
      for (let i = 0; i < tokens.length - 1; i++) {
        const bi = `${tokens[i]} ${tokens[i + 1]}`;
        bigrams[bi] = (bigrams[bi] || 0) + 1;
      }
      for (let i = 0; i < tokens.length - 2; i++) {
        const tri = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
        trigrams[tri] = (trigrams[tri] || 0) + 1;
      }
    });
    const topN = (obj, n = 10) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([text, weight]) => ({ text, weight }));
    const wordCloud = topN(freq, 30);
    const topBigrams = topN(bigrams, 10);
    const topTrigrams = topN(trigrams, 10);

    // sentiment
    let pos = 0, neg = 0;
    texts.forEach(t => {
      const tokens = tokenize(t);
      const hasPos = tokens.some(tok => positiveWords.includes(tok));
      const hasNeg = tokens.some(tok => negativeWords.includes(tok));
      if (hasPos && !hasNeg) pos += 1;
      else if (hasNeg && !hasPos) neg += 1;
    });
    const totalSent = pos + neg;
    const sentiment = {
      positive: { count: pos, percentage: totalSent ? Math.round((pos / totalSent) * 100) : 0 },
      negative: { count: neg, percentage: totalSent ? Math.round((neg / totalSent) * 100) : 0 },
      neutral: { count: texts.length - totalSent, percentage: texts.length ? Math.round(((texts.length - totalSent) / texts.length) * 100) : 0 }
    };

    // alerts on negatives
    const negativeAlert = neg >= NEGATIVE_ALERT_THRESHOLD;
    const alerts = negativeAlert ? [{
      type: 'warning',
      severity: 'medium',
      title: 'Повышено количество негативных комментариев',
      description: `Негативных комментариев: ${neg} из ${texts.length}`,
      recommendation: 'Проверьте последние ответы и свяжитесь с группой/преподавателем'
    }] : [];

    res.json({
      totalComments: texts.length,
      wordCloud,
      sentiment,
      topMentions: wordCloud.slice(0, 10),
      topBigrams,
      topTrigrams,
      alerts
    });
  } catch (error) {
    console.error('Ошибка в /analytics/text-analysis:', error);
    res.status(500).json({ error: 'Ошибка при загрузке текстовой аналитики' });
  }
});

// GET /api/analytics/subject-detail
router.get('/subject-detail', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { subject, faculty, program, course, group, timeRange = 'month' } = req.query;
    if (!subject) {
      return res.status(400).json({ error: 'subject is required' });
    }
    const { start } = calcStartDate(timeRange);
    const userFilter = buildUserFilter({ faculty, program, course, group });
    const students = await User.find(userFilter).select('_id group course').lean();
    const studentIds = students.map(s => s._id);
    const groupCourses = students.reduce((acc, s) => { acc[s.group] = s.course; return acc; }, {});

    const match = {
      $or: [
        { 'lessonContext.subject': subject },
        { subject_name: subject }
      ]
    };

    const responses = await Poll.aggregate([
      { $match: match },
      { $unwind: '$responses' },
      {
        $match: {
          'responses.submitted_at': { $gte: start },
          ...(studentIds.length ? { 'responses.user_id': { $in: studentIds } } : {})
        }
      },
      {
        $project: {
          answers: '$responses.answers',
          raw: '$responses.raw_responses',
          group: '$responses.user_group'
        }
      }
    ]);

    let totalResponses = 0;
    let sum = 0;
    const byGroupsMap = {};
    const textBucket = [];
    // criteria buckets if answers contain question ids: relevance(1), clarity(2), practical(3)
    let relevanceSum = 0, claritySum = 0, practicalSum = 0;
    let relevanceCount = 0, clarityCount = 0, practicalCount = 0;

    responses.forEach(r => {
      const val = normalizeNumeric(r.answers);
      if (val !== null) {
        totalResponses += 1;
        sum += val;
        if (!byGroupsMap[r.group]) byGroupsMap[r.group] = { ratingSum: 0, count: 0 };
        byGroupsMap[r.group].ratingSum += val;
        byGroupsMap[r.group].count += 1;
      }
      // criteria: try to extract by question ids if present
      if (r.answers && typeof r.answers === 'object') {
        const rel = r.answers[1];
        const cla = r.answers[2];
        const pra = r.answers[3];
        if (isNumber(rel)) { relevanceSum += rel; relevanceCount++; }
        if (isNumber(cla)) { claritySum += cla; clarityCount++; }
        if (isNumber(pra)) { practicalSum += pra; practicalCount++; }
      }
      collectTexts(r, textBucket);
    });

    const avgRating = totalResponses ? Number((sum / totalResponses).toFixed(2)) : 0;
    const byGroups = Object.entries(byGroupsMap).map(([g, data]) => ({
      group: g,
      course: groupCourses[g] || null,
      rating: Number((data.ratingSum / data.count).toFixed(2)),
      activity: null
    }));

    const topProblems = buildTopPhrases(textBucket, 3);
    const recommendations = deriveRecommendations(avgRating, topProblems);

    const criteria = {
      relevance: relevanceCount ? Number((relevanceSum / relevanceCount).toFixed(2)) : avgRating,
      clarity: clarityCount ? Number((claritySum / clarityCount).toFixed(2)) : avgRating,
      practical: practicalCount ? Number((practicalSum / practicalCount).toFixed(2)) : avgRating,
      technical: avgRating
    };

    res.json({
      name: subject,
      avgRating,
      totalResponses,
      groupCount: byGroups.length,
      criteria,
      byGroups,
      topProblems,
      recommendations
    });
  } catch (error) {
    console.error('Ошибка в /analytics/subject-detail:', error);
    res.status(500).json({ error: 'Ошибка при загрузке деталей дисциплины' });
  }
});

// GET /api/analytics/teacher-detail
router.get('/teacher-detail', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { teacher, faculty, program, course, group, timeRange = 'month' } = req.query;
    if (!teacher) {
      return res.status(400).json({ error: 'teacher is required' });
    }
    const { start } = calcStartDate(timeRange);
    const userFilter = buildUserFilter({ faculty, program, course, group });
    const students = await User.find(userFilter).select('_id group').lean();
    const studentIds = students.map(s => s._id);

    const match = {
      $or: [
        { 'lessonContext.teacher': teacher },
        { teacher_name: teacher }
      ]
    };

    const responses = await Poll.aggregate([
      { $match: match },
      { $unwind: '$responses' },
      {
        $match: {
          'responses.submitted_at': { $gte: start },
          ...(studentIds.length ? { 'responses.user_id': { $in: studentIds } } : {})
        }
      },
      {
        $project: {
          answers: '$responses.answers',
          raw: '$responses.raw_responses',
          group: '$responses.user_group',
          subject: '$lessonContext.subject'
        }
      }
    ]);

    // Self-evaluations (teacher_lesson_review)
    const selfMatch = {
      pollType: 'teacher_lesson_review',
      $or: [
        { 'lessonContext.teacher': teacher },
        { teacher_name: teacher }
      ]
    };
    const selfEvals = await Poll.aggregate([
      { $match: selfMatch },
      { $unwind: '$responses' },
      {
        $match: {
          'responses.submitted_at': { $gte: start }
        }
      },
      {
        $project: {
          answers: '$responses.answers',
          group: '$responses.user_group',
          raw: '$responses.raw_responses'
        }
      }
    ]);

    let selfAttendanceSum = 0;
    let selfActivitySum = 0;
    let selfCount = 0;
    const selfTexts = [];
    selfEvals.forEach(ev => {
      // question id 1: attendance text, 2: activity rating
      const att = ev.answers && ev.answers[1];
      const act = ev.answers && ev.answers[2];
      if (isNumber(act)) {
        selfActivitySum += act;
      }
      if (typeof att === 'string') {
        selfAttendanceSum += Number(att.replace(/[^\d]/g, '')) || 0;
      } else if (isNumber(att)) {
        selfAttendanceSum += att;
      }
      if (ev.raw && Array.isArray(ev.raw)) {
        ev.raw.forEach(r => {
          if (r && r.type === 'text' && typeof r.value === 'string' && r.value.trim()) {
            selfTexts.push(r.value.trim());
          }
        });
      }
      selfCount += 1;
    });

    const selfEval = selfCount ? {
      avgAttendance: Math.round(selfAttendanceSum / selfCount),
      avgActivity: Number((selfActivitySum / selfCount).toFixed(2)),
      recentComments: selfTexts.slice(0, 10)
    } : null;

    let totalResponses = 0;
    let sum = 0;
    const bySubjectsMap = {};
    const byGroupsMap = {};
    const textBucket = [];

    responses.forEach(r => {
      const val = normalizeNumeric(r.answers);
      if (val !== null) {
        totalResponses += 1;
        sum += val;
        if (r.subject) {
          if (!bySubjectsMap[r.subject]) bySubjectsMap[r.subject] = { ratingSum: 0, count: 0 };
          bySubjectsMap[r.subject].ratingSum += val;
          bySubjectsMap[r.subject].count += 1;
        }
        if (r.group) {
          if (!byGroupsMap[r.group]) byGroupsMap[r.group] = { ratingSum: 0, count: 0 };
          byGroupsMap[r.group].ratingSum += val;
          byGroupsMap[r.group].count += 1;
        }
      }
      collectTexts(r, textBucket);
    });

    const avgRating = totalResponses ? Number((sum / totalResponses).toFixed(2)) : 0;
    const bySubjects = Object.entries(bySubjectsMap).map(([name, data]) => ({
      name,
      rating: Number((data.ratingSum / data.count).toFixed(2)),
      responses: data.count
    }));
    const byGroups = Object.entries(byGroupsMap).map(([name, data]) => ({
      group: name,
      rating: Number((data.ratingSum / data.count).toFixed(2)),
      responses: data.count
    }));
    const topProblems = buildTopPhrases(textBucket, 3);
    const recommendations = deriveRecommendations(avgRating, topProblems);

    res.json({
      name: teacher,
      avgRating,
      totalResponses,
      fromStudents: {
        avgRating,
        totalResponses,
        criteria: {
          clarity: avgRating,
          engagement: avgRating,
          attitude: avgRating,
          continuePercent: null
        },
        bySubjects,
        byGroups,
        comments: {
          negative: topProblems.map(p => `${p.text} (${p.weight})`),
          positive: []
        }
      },
      recommendations
      ,
      selfEval
    });
  } catch (error) {
    console.error('Ошибка в /analytics/teacher-detail:', error);
    res.status(500).json({ error: 'Ошибка при загрузке деталей преподавателя' });
  }
});

// GET /api/analytics/detailed/:pollId
router.get('/detailed/:pollId', authenticate, async (req, res) => {
  try {
    const { pollId } = req.params;
    const poll = await Poll.findById(pollId).lean();
    if (!poll) {
      return res.status(404).json({ error: 'Опрос не найден' });
    }

    const responses = poll.responses || [];
    if (!responses.length) {
      return res.json({
        error: 'Недостаточно данных',
        ikop: 0,
        ikopPercent: 0,
        zone: 'no_data',
        color: '#e5e7eb',
        avgRatings: {},
        topWords: [],
        comments: [],
        correlation: 0,
        recommendations: []
      });
    }

    const ratingsByQuestion = {};
    const comments = [];
    const questionTypeMap = {};
    const questionTextMap = {};
    (poll.questions || []).forEach((q) => {
      if (q && q.id !== undefined) {
        questionTypeMap[q.id] = q.type;
        questionTextMap[q.id] = q.text;
      }
    });

    const pushRating = (qId, val) => {
      if (!ratingsByQuestion[qId]) ratingsByQuestion[qId] = [];
      ratingsByQuestion[qId].push(val);
    };

    responses.forEach((resp) => {
      const ans = resp.answers;
      if (typeof ans === 'number' && ans >= 1 && ans <= 5) {
        pushRating('overall', ans);
      } else if (ans && typeof ans === 'object') {
        Object.entries(ans).forEach(([qId, val]) => {
          if (typeof val === 'number' && val >= 1 && val <= 5) {
            pushRating(qId, val);
          } else if (
            typeof val === 'string' &&
            val.trim().length > 3 &&
            questionTypeMap[qId] &&
            questionTypeMap[qId].startsWith('text')
          ) {
            // Берём только свободный текст из текстовых вопросов
            comments.push(val.trim());
          }
        });
      }

      if (Array.isArray(resp.raw_responses)) {
        resp.raw_responses.forEach((raw) => {
          if (
            raw &&
            raw.type === 'text' &&
            typeof raw.value === 'string' &&
            raw.value.trim()
          ) {
            comments.push(raw.value.trim());
          }
        });
      } else if (
        typeof resp.raw_responses === 'string' &&
        resp.raw_responses.trim().length > 3
      ) {
        comments.push(resp.raw_responses.trim());
      }
    });

    const avgRatings = {};
    Object.keys(ratingsByQuestion).forEach((qId) => {
      const arr = ratingsByQuestion[qId];
      if (arr.length) {
        avgRatings[qId] = Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2));
      }
    });

    const weights = {
      1: 0.25,
      2: 0.30,
      3: 0.20,
      4: 0.15,
      5: 0.10
    };

    const normalize = (x) => (x - 1) / 4;
    let ikop = 0;
    Object.keys(weights).forEach((qId) => {
      const rating = avgRatings[qId] || 3;
      ikop += weights[qId] * normalize(rating);
    });

    let zone = 'Критично';
    let color = '#FF6E76';
    if (ikop >= 0.8) {
      zone = 'Отлично';
      color = '#58D9F9';
    } else if (ikop >= 0.6) {
      zone = 'Хорошо';
      color = '#7CFFB2';
    } else if (ikop >= 0.4) {
      zone = 'Требует внимания';
      color = '#FDDD60';
    }

    const stopWords = new Set(['это', 'что', 'как', 'для', 'все', 'или', 'было', 'есть', 'при', 'они', 'них', 'том', 'нас', 'вас', 'был', 'была', 'были', 'которые', 'который', 'которая', 'также', 'этот', 'эту', 'этой', 'когда', 'где', 'там', 'тут']);
    const wordFreq = {};
    const bigramFreq = {};
    const positiveLex = new Set(['хорошо', 'понятно', 'ясно', 'полезно', 'интересно', 'отлично', 'нравится', 'классно']);
    const negativeLex = new Set(['плохо', 'непонятно', 'сложно', 'трудно', 'мало', 'слабо', 'ужасно', 'хуже']);
    let sentiment = { positive: 0, negative: 0, neutral: 0 };

    const tokenize = (text) =>
      text
        .toLowerCase()
        .replace(/[^\wа-яё\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w));

    comments.forEach((comment) => {
      const tokens = tokenize(comment);
      // частоты слов
      tokens.forEach((w) => {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
      });
      // биграммы
      for (let i = 0; i < tokens.length - 1; i++) {
        const bg = `${tokens[i]} ${tokens[i + 1]}`;
        bigramFreq[bg] = (bigramFreq[bg] || 0) + 1;
      }
      // простая тональность
      const posHits = tokens.filter((w) => positiveLex.has(w)).length;
      const negHits = tokens.filter((w) => negativeLex.has(w)).length;
      if (posHits > negHits && posHits > 0) sentiment.positive += 1;
      else if (negHits > posHits && negHits > 0) sentiment.negative += 1;
      else sentiment.neutral += 1;
    });

    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));

    const topBigrams = Object.entries(bigramFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([text, count]) => ({ text, count }));

    const isNeg = (w) => negativeLex.has(w);
    const isPos = (w) => positiveLex.has(w);
    const bigramTone = (bg) => {
      const parts = bg.split(' ');
      const neg = parts.filter(isNeg).length;
      const pos = parts.filter(isPos).length;
      if (neg > pos) return 'neg';
      if (pos > neg) return 'pos';
      return 'neutral';
    };

    const problems = topBigrams
      .filter((b) => bigramTone(b.text) === 'neg')
      .map((b) => b.text)
      .slice(0, 3);
    const strengthPhrases = topBigrams
      .filter((b) => bigramTone(b.text) === 'pos')
      .map((b) => b.text)
      .slice(0, 3);

    // === РАСШИРЕННЫЙ КОРРЕЛЯЦИОННЫЙ АНАЛИЗ ===
    
    // Вспомогательная функция для получения текста вопроса
    const labelFor = (q) => questionTextMap[q] || `Вопрос ${q}`;
    
    // Функция для вычисления корреляции Пирсона между двумя массивами
    const pearsonArrays = (x, y) => {
      const n = x.length;
      if (n < 3 || n !== y.length) return null;
      
      const sumX = x.reduce((s, v) => s + v, 0);
      const sumY = y.reduce((s, v) => s + v, 0);
      const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
      const sumX2 = x.reduce((s, v) => s + v * v, 0);
      const sumY2 = y.reduce((s, v) => s + v * v, 0);
      
      const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
      if (!denom || Number.isNaN(denom) || denom === 0) return null;
      
      const r = (n * sumXY - sumX * sumY) / denom;
      return Number.isNaN(r) ? null : Number(r.toFixed(3));
    };

    // 1. МАТРИЦА КОРРЕЛЯЦИЙ между всеми числовыми параметрами
    const questionIds = Object.keys(ratingsByQuestion).filter(q => ratingsByQuestion[q].length >= 3);
    const correlationMatrix = {};
    
    questionIds.forEach((qId1) => {
      correlationMatrix[qId1] = {};
      questionIds.forEach((qId2) => {
        if (qId1 === qId2) {
          correlationMatrix[qId1][qId2] = 1.0;
        } else {
          // Собираем пары оценок от одних и тех же студентов
          const pairs = [];
          responses.forEach((resp) => {
            const ans = resp.answers;
            let val1 = null, val2 = null;
            
            if (ans && typeof ans === 'object') {
              if (typeof ans[qId1] === 'number') val1 = ans[qId1];
              if (typeof ans[qId2] === 'number') val2 = ans[qId2];
            }
            
            if (val1 !== null && val2 !== null) {
              pairs.push({ x: val1, y: val2 });
            }
          });
          
          if (pairs.length >= 3) {
            const xArr = pairs.map(p => p.x);
            const yArr = pairs.map(p => p.y);
            correlationMatrix[qId1][qId2] = pearsonArrays(xArr, yArr);
          } else {
            correlationMatrix[qId1][qId2] = null;
          }
        }
      });
    });

    // 2. КОРРЕЛЯЦИЯ между оценками и тональностью комментариев
    const ratingsWithSentiment = [];
    responses.forEach((resp, idx) => {
      const ans = resp.answers;
      const numericValues = [];
      
      if (ans && typeof ans === 'object') {
        Object.values(ans).forEach((v) => {
          if (typeof v === 'number') numericValues.push(v);
        });
      } else if (typeof ans === 'number') {
        numericValues.push(ans);
      }
      
      if (numericValues.length > 0) {
        const avgRating = numericValues.reduce((s, v) => s + v, 0) / numericValues.length;
        
        // Найти комментарий этого респондента
        let commentText = '';
        if (ans && typeof ans === 'object') {
          Object.entries(ans).forEach(([qId, val]) => {
            if (typeof val === 'string' && val.trim().length > 3) {
              commentText += ' ' + val.trim();
            }
          });
        }
        
        if (Array.isArray(resp.raw_responses)) {
          resp.raw_responses.forEach((raw) => {
            if (raw && raw.type === 'text' && typeof raw.value === 'string') {
              commentText += ' ' + raw.value.trim();
            }
          });
        }
        
        if (commentText.trim()) {
          const tokens = tokenize(commentText);
          const posHits = tokens.filter((w) => positiveLex.has(w)).length;
          const negHits = tokens.filter((w) => negativeLex.has(w)).length;
          
          // Sentiment score: +1 = positive, 0 = neutral, -1 = negative
          let sentimentScore = 0;
          if (posHits > negHits && posHits > 0) sentimentScore = 1;
          else if (negHits > posHits && negHits > 0) sentimentScore = -1;
          
          ratingsWithSentiment.push({ rating: avgRating, sentiment: sentimentScore });
        }
      }
    });

    const ratingsSentimentCorr = ratingsWithSentiment.length >= 3
      ? pearsonArrays(
          ratingsWithSentiment.map(r => r.rating),
          ratingsWithSentiment.map(r => r.sentiment)
        )
      : null;

    // 3. ТОП-3 самых сильных корреляций
    const allCorrelations = [];
    questionIds.forEach((qId1) => {
      questionIds.forEach((qId2) => {
        if (qId1 < qId2) { // избегаем дублей
          const r = correlationMatrix[qId1]?.[qId2];
          if (r !== null && r !== undefined && Math.abs(r) > 0.3) {
            allCorrelations.push({
              q1: qId1,
              q2: qId2,
              label1: labelFor(qId1),
              label2: labelFor(qId2),
              value: r
            });
          }
        }
      });
    });
    
    const topCorrelations = allCorrelations
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 3);

    // Для обратной совместимости - оставляем старое поле correlation
    const correlation = correlationMatrix['2']?.['overall'] || null;

    const recommendations = [];
    if ((avgRatings[2] || 0) < 4) recommendations.push('Добавить больше примеров и пояснений');
    if ((avgRatings[3] || 0) < 4) recommendations.push('Увеличить долю практических заданий и кейсов');
    if ((avgRatings[4] || 0) < 4) recommendations.push('Повысить интерактивность: опросы, дискуссии, работа в группах');
    if ((avgRatings[5] || 0) < 4) recommendations.push('Проверить организационные моменты и оснащение');
    if (!recommendations.length) recommendations.push('Продолжайте в том же духе! Занятие получило высокие оценки.');

    const entriesSorted = Object.entries(avgRatings).sort((a, b) => b[1] - a[1]);
    let metricStrengths = entriesSorted
      .filter(([, v]) => v >= 4)
      .map(([q]) => labelFor(q));

    // fallback: если нет >=4, берем топ-2
    if (!metricStrengths.length && entriesSorted.length) {
      metricStrengths = entriesSorted.slice(0, 2).map(([q]) => labelFor(q));
    }

    const strengthSet = new Set(metricStrengths);
    const weaknesses = entriesSorted
      .filter(([, v]) => v < 4)
      .map(([q]) => labelFor(q))
      .filter((name) => !strengthSet.has(name)); // убираем дубли если попали в топ как fallback

    const bestLabel = metricStrengths[0] || '—';
    const worstLabel = weaknesses[0] || '—';

    // Человеко-понятный вывод без внешнего ИИ
    const ikopScore = Math.round(ikop * 100);
    let zoneText = '';
    if (zone === 'Отлично') zoneText = 'Отлично';
    else if (zone === 'Хорошо') zoneText = 'Хорошо';
    else if (zone === 'Требует внимания') zoneText = 'Требует внимания';
    else zoneText = 'Критично';

    const bestPair = entriesSorted.length ? `${labelFor(entriesSorted[0][0])} (${entriesSorted[0][1].toFixed(1)}/5)` : '—';
    const worstPair = entriesSorted.length ? `${labelFor(entriesSorted[entriesSorted.length - 1][0])} (${entriesSorted[entriesSorted.length - 1][1].toFixed(1)}/5)` : '—';

    const readableAnalysis =
      `ИКОП ${ikopScore}/100 (${zoneText}). ` +
      `Лучшее: ${bestPair}. ` +
      `Слабее: ${worstPair}. ` +
      `Рекомендации: ${recommendations.slice(0, 2).join('; ') || '—'}.`;

    const suggestions = [];
    suggestions.push(readableAnalysis);
    if (problems.length) suggestions.push(`Проблемы: ${problems.join(', ')}`);
    if (strengthPhrases.length) suggestions.push(`Сильные стороны: ${strengthPhrases.join(', ')}`);
    suggestions.push(...recommendations.slice(0, 3));

    // Рассчитываем общее распределение оценок (1-5)
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    Object.values(ratingsByQuestion).flat().forEach(rating => {
      if (rating >= 1 && rating <= 5) {
        distribution[rating]++;
      }
    });

    // Рассчитываем распределение по каждому вопросу
    const distributionPerQuestion = {};
    Object.keys(ratingsByQuestion).forEach(qId => {
      distributionPerQuestion[qId] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      ratingsByQuestion[qId].forEach(rating => {
        if (rating >= 1 && rating <= 5) {
          distributionPerQuestion[qId][rating]++;
        }
      });
    });

    res.json({
      poll, // добавляем объект опроса
      totalResponses: responses.length, // количество ответов
      ikop,
      ikopPercent: Math.round(ikop * 100),
      zone,
      color,
      avgRatings,
      distribution, // общее распределение оценок
      distributionPerQuestion, // распределение по каждому вопросу
      topWords,
      topBigrams,
      sentiment,
      insights: {
        problems,
        strengths: strengthPhrases
      },
      comments,
      correlation: correlation || 0, // старое поле для совместимости
      correlationMatrix,
      topCorrelations,
      ratingsSentimentCorr,
      ratingSentimentCorrelation: ratingsSentimentCorr || 0, // для нового дашборда
      questionLabels: questionTextMap, // старое поле
      questionTexts: questionTextMap, // для нового дашборда
      aiAnalysis: readableAnalysis,
      recommendations,
      suggestions,
      responses // массив ответов для scatter plot
    });
  } catch (error) {
    console.error('Ошибка в /analytics/detailed/:pollId', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// helpers for detail endpoints
const normalizeNumeric = (val) => {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (val && typeof val === 'object') {
    const nums = Object.values(val).filter((v) => typeof v === 'number' && !Number.isNaN(v));
    if (nums.length) return nums.reduce((s, v) => s + v, 0) / nums.length;
  }
  return null;
};

const collectTexts = (resp, bucket) => {
  if (typeof resp.answers === 'string' && resp.answers.trim()) bucket.push(resp.answers.trim());
  if (Array.isArray(resp.raw)) {
    resp.raw.forEach((ans) => {
      if (ans && ans.type === 'text' && typeof ans.value === 'string' && ans.value.trim()) {
        bucket.push(ans.value.trim());
      }
    });
  }
};

const buildTopPhrases = (texts, limit = 5) => {
  const freq = {};
  const tokenize = (t) => t.toLowerCase().replace(/[.,!?;:()"]/g, '').split(/\s+/).filter(Boolean);
  texts.forEach(t => tokenize(t).forEach(w => { freq[w] = (freq[w] || 0) + 1; }));
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text, weight]) => ({ text, weight }));
};

const deriveRecommendations = (avgRating, problems) => {
  const recos = [];
  if (avgRating < 3.5) {
    recos.push('⚠️ Срочно: разбор проблемных тем с преподавателем/группой');
    recos.push('📚 Добавить примеры и практику по сложным темам');
  } else if (avgRating < 4) {
    recos.push('💡 Усилить понятность и вовлечённость (больше примеров)');
  }
  if (problems && problems.length) {
    recos.push(`Проверьте частые жалобы: ${problems.slice(0, 2).map(p => p.text).join(', ')}`);
  }
  if (!recos.length) recos.push('Отличные показатели, держать планку');
  return recos;
};
module.exports = router;

