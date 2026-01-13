const redis = require('../config/redis');
const { fetchJson } = require('./ruzService');

/**
 * Форматирует Date в YYYY-MM-DD (БЕЗ UTC смещения!)
 * Использует локальное время вместо UTC
 */
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDateString = (dateStr) => {
  if (!dateStr) return dateStr;
  // допускаем YYYY.MM.DD -> YYYY-MM-DD
  return dateStr.replace(/\./g, '-');
};

/**
 * Загружает расписание группы из RUZ с кешированием.
 * @param {number|string} groupId
 * @param {object} options { start, finish, lng }
 * @returns {Promise<Array>}
 */
async function getGroupSchedule(groupId, { start, finish, lng = 1 }) {
  const normStart = normalizeDateString(start);
  const normFinish = normalizeDateString(finish);
  const cacheKey = `ruz:schedule:group:${groupId}:${start}:${finish}:${lng}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return { data: JSON.parse(cached), stale: false };
    } catch (e) {
      // ignore broken cache
    }
  }

  try {
    const data = await fetchJson(`/schedule/group/${groupId}`, { start: normStart, finish: normFinish, lng });
    // Кешируем на 30 минут
    await redis.setex(cacheKey, 60 * 30, JSON.stringify(data));
    return { data, stale: false };
  } catch (error) {
    console.error('Ошибка загрузки расписания из RUZ:', error.message);
    // попытка отдать старые данные из кэша
    if (cached) {
      try {
        return { data: JSON.parse(cached), stale: true };
      } catch (e) {
        // ignore
      }
    }
    return { data: [], stale: true };
  }
}

/**
 * Загружает расписание преподавателя из RUZ с кешированием.
 * @param {number|string} teacherId
 * @param {object} options { start, finish, lng }
 * @returns {Promise<Array>}
 */
async function getTeacherSchedule(teacherId, { start, finish, lng = 1 }) {
  const normStart = normalizeDateString(start);
  const normFinish = normalizeDateString(finish);
  const cacheKey = `ruz:schedule:teacher:${teacherId}:${start}:${finish}:${lng}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return { data: JSON.parse(cached), stale: false };
    } catch (e) {}
  }

  try {
    const data = await fetchJson(`/schedule/teacher/${teacherId}`, { start: normStart, finish: normFinish, lng });
    await redis.setex(cacheKey, 60 * 30, JSON.stringify(data));
    return { data, stale: false };
  } catch (error) {
    console.error('Ошибка загрузки расписания преподавателя из RUZ:', error.message);
    if (cached) {
      try {
        return { data: JSON.parse(cached), stale: true };
      } catch (e) {}
    }
    return { data: [], stale: true };
  }
}

/**
 * Загружает расписание по personId (RUZ search type=person) с кешированием.
 */
async function getPersonSchedule(personId, { start, finish, lng = 1 }) {
  const normStart = normalizeDateString(start);
  const normFinish = normalizeDateString(finish);
  const cacheKey = `ruz:schedule:person:${personId}:${start}:${finish}:${lng}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return { data: JSON.parse(cached), stale: false };
    } catch (e) {}
  }

  try {
    const data = await fetchJson(`/schedule/person/${personId}`, { start: normStart, finish: normFinish, lng });
    await redis.setex(cacheKey, 60 * 30, JSON.stringify(data));
    return { data, stale: false };
  } catch (error) {
    console.error('Ошибка загрузки расписания person из RUZ:', error.message);
    if (cached) {
      try {
        return { data: JSON.parse(cached), stale: true };
      } catch (e) {}
    }
    return { data: [], stale: true, error: error.message };
  }
}

/**
 * Извлекает список дисциплин/преподавателей из расписания группы.
 * @param {number|string} groupId
 * @param {object} options { start, finish, lng }
 * @returns {Promise<Array<{subjectId,name,teachers:Array,lessonsCount:number}>>}
 */
async function getSubjectsByGroup(groupId, { start, finish, lng = 1 }) {
  const { data: schedule } = await getGroupSchedule(groupId, { start, finish, lng });
  const subjectsMap = new Map();

  schedule.forEach((lesson) => {
    const subjectId = lesson.disciplineOid;
    const subjectName = lesson.discipline || `Дисциплина ${lesson.disciplineOid || ''}`;
    if (!subjectId) return;

    const teacherId = lesson.lecturerOid || lesson.lecturerGUID || lesson.lecturerUID;
    const teacherName = lesson.lecturer_title || lesson.lecturer || 'Преподаватель';
    const teacherShort = lesson.lecturer || '';
    const teacherEmail = lesson.lecturerEmail || '';

    if (!subjectsMap.has(subjectId)) {
      subjectsMap.set(subjectId, {
        subjectId,
        name: subjectName,
        teachers: new Map(),
        lessonsCount: 0
      });
    }

    const subj = subjectsMap.get(subjectId);
    subj.lessonsCount += 1;

    if (teacherId || teacherName) {
      const key = teacherId || teacherName;
      if (!subj.teachers.has(key)) {
        subj.teachers.set(key, {
          id: teacherId || null,
          name: teacherName,
          short: teacherShort,
          email: teacherEmail
        });
      }
    }
  });

  return Array.from(subjectsMap.values()).map((s) => ({
    subjectId: s.subjectId,
    name: s.name,
    teachers: Array.from(s.teachers.values()),
    lessonsCount: s.lessonsCount
  }));
}

/**
 * Возвращает диапазон по умолчанию: прошлые 30 дней и будущие 30 дней.
 */
function getDefaultRange() {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 30);
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 30);
  return {
    start: formatDate(startDate),
    finish: formatDate(endDate)
  };
}

module.exports = {
  getGroupSchedule,
  getSubjectsByGroup,
  getDefaultRange,
  formatDate,
  getTeacherSchedule,
  getPersonSchedule
};