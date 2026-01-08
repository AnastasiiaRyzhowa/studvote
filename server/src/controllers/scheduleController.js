const { getSubjectsByGroup, getDefaultRange, getGroupSchedule } = require('../services/scheduleService');

/**
 * GET /api/schedule/subjects?groupId=...&start=YYYY-MM-DD&finish=YYYY-MM-DD
 */
exports.getSubjects = async (req, res) => {
  try {
    const { groupId, start, finish } = req.query;
    if (!groupId) {
      return res.status(400).json({ success: false, message: 'groupId обязателен' });
    }

    const range = {
      ...(start && finish ? { start, finish } : getDefaultRange())
    };

    const subjects = await getSubjectsByGroup(groupId, {
      ...range,
      lng: 1
    });

    res.json({ success: true, subjects, range });
  } catch (error) {
    console.error('Ошибка в getSubjects:', error.message);
    res.status(500).json({ success: false, message: 'Ошибка при загрузке дисциплин' });
  }
};

/**
 * GET /api/schedule/group?groupId=...&start=YYYY-MM-DD&finish=YYYY-MM-DD
 */
exports.getGroupSchedule = async (req, res) => {
  try {
    const { groupId, start, finish } = req.query;
    if (!groupId) {
      return res.status(400).json({ success: false, message: 'groupId обязателен' });
    }

    const range = start && finish ? { start, finish } : getDefaultRange();
    const schedule = await getGroupSchedule(groupId, { ...range, lng: 1 });

    res.json({ success: true, schedule, range });
  } catch (error) {
    console.error('Ошибка в getGroupSchedule:', error.message);
    res.status(500).json({ success: false, message: 'Ошибка при загрузке расписания' });
  }
};
