const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Vote = require('../models/Vote');
const Poll = require('../models/Poll');
const User = require('../models/User');
const GroupReliabilityEvent = require('../models/GroupReliabilityEvent');

const isTeacher = (req, res, next) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ success: false, message: 'Доступ только для преподавателей' });
  }
  next();
};

// Helper for teacher analytics
async function buildTeacherAnalytics(user) {
  const teacherName = user.ruz_teacher_name || user.full_name || '';
  if (!teacherName) {
    return {
      success: true,
      data: {
        mode: 'teacher',
        subject: null,
        course: user.course || null,
        groups: [],
        overall: { rating: 0, trend: 0, totalResponses: 0 },
        criteria: [],
        groupComparison: [],
        reliability: { list: [], history: [] },
        mentions: { positive: [], neutral: [], negative: [] },
        recommendations: []
      }
    };
  }

  const polls = await Poll.find({
    pollType: { $in: ['teacher_feedback', 'subject_feedback', 'teacher_lesson_review'] },
    'lessonContext.teacher': { $regex: new RegExp(`^${teacherName}`, 'i') }
  }).lean();

  const feedbackPolls = polls.filter(p => p.pollType === 'teacher_feedback' || p.pollType === 'subject_feedback');
  const reviewPolls = polls.filter(p => p.pollType === 'teacher_lesson_review');

  const criteriaMap = {
    1: 'Понятность объяснений',
    2: 'Вовлечённость',
    3: 'Отношение к студентам',
    4: 'Связь с практикой'
  };

  let overallSum = 0;
  let overallCnt = 0;
  const criteriaAgg = new Map(); // key -> {sum,count}
  const groupAgg = new Map(); // group -> {sum,count,responses}

  const addRating = (qid, val, groupName) => {
    if (typeof val !== 'number') return;
    overallSum += val;
    overallCnt += 1;
    if (criteriaMap[qid]) {
      const curr = criteriaAgg.get(qid) || { sum: 0, count: 0 };
      curr.sum += val;
      curr.count += 1;
      criteriaAgg.set(qid, curr);
    }
    if (groupName) {
      const g = groupAgg.get(groupName) || { sum: 0, count: 0, responses: 0 };
      g.sum += val;
      g.count += 1;
      g.responses += 1;
      groupAgg.set(groupName, g);
    }
  };

  feedbackPolls.forEach((poll) => {
    const groupNameFromLesson = poll.lessonContext?.group || poll.lessonContext?.groupId || null;
    (poll.responses || []).forEach((resp) => {
      const answers = resp.answers || {};
      const groupName = resp.user_group_name || resp.user_group || groupNameFromLesson || 'Не указана';
      Object.entries(criteriaMap).forEach(([qid]) => {
        addRating(Number(qid), Number(answers[qid]), groupName);
      });
    });
  });

  // Reliability
  const reliabilityList = new Map(); // group -> {score, deltas}
  const history = [];
  const deltaByOption = {
    'Повысить (+5 баллов) - группа работала отлично': 5,
    'Оставить без изменений': 0,
    'Понизить (-5 баллов) - низкая посещаемость/активность': -5,
    'Значительно понизить (-10 баллов) - серьёзные проблемы': -10
  };

  reviewPolls.forEach((poll) => {
    const groupFromLesson = poll.lessonContext?.group || poll.lessonContext?.groupId || 'Не указана';
    (poll.responses || []).forEach((resp) => {
      const answers = resp.answers || {};
      const groupName = groupFromLesson || resp.user_group_name || resp.user_group || 'Не указана';
      const choice = answers[4];
      const delta = deltaByOption[choice] ?? 0;
      const current = reliabilityList.get(groupName) || { score: 90, deltas: [] };
      current.score += delta;
      current.deltas.push(delta);
      reliabilityList.set(groupName, current);
      if (delta !== 0) {
        history.push({
          date: resp.submitted_at || poll.created_at || new Date(),
          group: groupName,
          delta,
          reason: answers[5] || ''
        });
      }
    });
  });

  const overall = {
    rating: overallCnt ? Math.round((overallSum / overallCnt) * 10) / 10 : 0,
    trend: 0,
    totalResponses: overallCnt
  };

  const criteria = Array.from(criteriaAgg.entries()).map(([qid, obj]) => ({
    key: qid,
    title: criteriaMap[qid],
    value: obj.count ? Math.round((obj.sum / obj.count) * 10) / 10 : 0
  }));

  const groupComparison = Array.from(groupAgg.entries()).map(([name, obj]) => ({
    group: name,
    rating: obj.count ? Math.round((obj.sum / obj.count) * 10) / 10 : 0,
    reliability: reliabilityList.get(name)?.score ?? 90,
    responses: obj.responses
  }));

  const reliability = {
    list: Array.from(reliabilityList.entries()).map(([group, obj]) => ({
      group,
      score: obj.score
    })),
    history: history.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20)
  };

  return {
    success: true,
    data: {
      mode: 'teacher',
      subject: feedbackPolls[0]?.lessonContext?.subject || null,
      course: user.course || null,
      groups: Array.from(new Set(groupComparison.map(g => g.group))),
      overall,
      criteria,
      groupComparison,
      reliability,
      mentions: { positive: [], neutral: [], negative: [] },
      recommendations: []
    }
  };
}

// GET /api/users/me/participation
router.get('/me/participation', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    // Преподаватель — возвращаем аналитику преподавателя
    if (user.role === 'teacher') {
      const teacherData = await buildTeacherAnalytics(user);
      return res.json(teacherData);
    }

    const votes = await Vote.find({ user_id: userId })
      .sort({ voted_at: -1 })
      .populate('poll_id', 'title reward_points end_date lessonContext status');

    const completed = votes.length;

    // Доступные активные опросы для этого пользователя (приблизительно по таргетингу)
    const visibilityFilters = [{ visibility: 'public' }];
    if (user.group) visibilityFilters.push({ target_groups: user.group });
    if (user.faculty) visibilityFilters.push({ target_faculties: user.faculty });
    if (user.program) visibilityFilters.push({ target_programs: user.program });
    if (user.course) visibilityFilters.push({ target_courses: user.course });

    const accessiblePolls = await Poll.find({
      status: { $in: ['active', 'completed'] },
      $or: visibilityFilters
    }).select('_id');

    const available = accessiblePolls.length || completed; // fallback чтобы не делить на 0
    const completionRate = available > 0 ? Math.round((completed / available) * 100) : 100;

    // Дни активности и стрик
    const uniqueDays = Array.from(
      new Set(
        votes.map((v) => new Date(v.voted_at || v.createdAt).toISOString().slice(0, 10))
      )
    ).sort();

    const daysActive = uniqueDays.length;

    const calcStreak = (days) => {
      if (days.length === 0) return { current: 0, best: 0 };
      let current = 1;
      let best = 1;
      for (let i = days.length - 2; i >= 0; i--) {
        const cur = new Date(days[i]);
        const next = new Date(days[i + 1]);
        const diff = (next - cur) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          current += 1;
        } else {
          best = Math.max(best, current);
          current = 1;
        }
      }
      best = Math.max(best, current);
      // Текущий стрик — от последней даты к сегодня
      const today = new Date();
      const last = new Date(days[days.length - 1]);
      const diffToday = Math.floor((today - last) / (1000 * 60 * 60 * 24));
      const currentStreak = diffToday === 0 ? current : 0;
      return { current: currentStreak, best };
    };

    const streak = calcStreak(uniqueDays);

    // Динамика по неделям (последние 8 недель)
    const weeks = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(now.getDate() - i * 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      const count = votes.filter(
        (v) => v.voted_at >= start && v.voted_at < end
      ).length;
      weeks.push({ label: `Нед${8 - i}`, value: count });
    }

    // История последних 50 ответов
    const history = votes.slice(0, 50).map((v) => ({
      date: v.voted_at || v.createdAt,
      title: v.poll_id?.title || 'Опрос',
      pollId: v.poll_id?._id || null,
      points: v.points_earned ?? v.poll_id?.reward_points ?? 0
    }));

    res.json({
      success: true,
      data: {
        completed,
        available,
        completionRate,
        daysActive,
        streak,
        myRate: completionRate,
        groupRate: null, // можно заполнить позже, когда появятся данные по группе в голосах
        timeline: weeks,
        history
      }
    });
  } catch (error) {
    console.error('Ошибка участия пользователя:', error);
    res.status(500).json({ success: false, message: 'Не удалось загрузить статистику участия' });
  }
});

// POST /api/users/reliability/:groupId/event - событие надёжности от преподавателя
router.post('/reliability/:groupId/event', authenticate, isTeacher, async (req, res) => {
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
      source: 'teacher',
      actor_id: req.user.userId,
      evidence_url
    });

    res.json({
      success: true,
      event
    });
  } catch (error) {
    console.error('Ошибка добавления события надёжности (teacher):', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка добавления события надёжности'
    });
  }
});

module.exports = router;
