const {
  getStructure,
  getFaculties,
  getGroups,
  findFaculty,
  findProgram,
  findCourse
} = require('../services/academicStructureService');
const { searchTeachers } = require('../services/ruzService');

exports.getStructure = async (req, res) => {
  const structure = await getStructure();
  res.json({ success: true, structure });
};

exports.getFaculties = async (req, res) => {
  const faculties = await getFaculties();
  res.json({ success: true, faculties });
};

exports.getPrograms = async (req, res) => {
  const { facultyId } = req.query;
  if (!facultyId) {
    return res.status(400).json({ success: false, message: 'facultyId обязателен' });
  }
  const structure = await getStructure();
  const faculty = findFaculty(structure, facultyId);
  if (!faculty) {
    return res.status(404).json({ success: false, message: 'Факультет не найден' });
  }
  res.json({ success: true, programs: faculty.programs });
};

exports.getCourses = async (req, res) => {
  const { programId } = req.query;
  if (!programId) {
    return res.status(400).json({ success: false, message: 'programId обязателен' });
  }
  const structure = await getStructure();
  const faculty = structure.find((f) => findProgram(f, programId));
  const program = faculty ? findProgram(faculty, programId) : null;
  if (!program) {
    return res.status(404).json({ success: false, message: 'Направление не найдено' });
  }
  const courses = program.courses.map((c) => c.number);
  res.json({ success: true, courses });
};

exports.getGroups = async (req, res) => {
  const { programId, course } = req.query;
  if (!programId || !course) {
    return res.status(400).json({ success: false, message: 'programId и course обязательны' });
  }
  const structure = await getStructure();
  const faculty = structure.find((f) => findProgram(f, programId));
  const program = faculty ? findProgram(faculty, programId) : null;
  const courseNode = findCourse(program, course);
  if (!courseNode) {
    return res.status(404).json({ success: false, message: 'Курс не найден' });
  }
  res.json({ success: true, groups: courseNode.groups });
};

/**
 * GET /api/directory/teachers?q=Иванов
 */
exports.searchTeachers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'q обязателен (минимум 2 символа)' });
    }
    const raw = await searchTeachers(q);
    const teachers = Array.isArray(raw) ? raw : (raw?.teachers || raw?.items || []);
    // нормализация под автокомплит
    const normalized = teachers
      .map((t) => {
        const id = t?.oid || t?.teacherOid || t?.id || t?.lecturerOid || t?.guid;
        const label = t?.fio || t?.name || t?.title || t?.label || '';
        const department = t?.chair || t?.department || t?.cathedra || t?.description || '';
        return { id, label, department, raw: t };
      })
      .filter((t) => t.id && t.label);

    const uniq = new Map();
    normalized.forEach((t, idx) => {
      const key = `${t.id}-${t.label}`;
      if (!uniq.has(key)) uniq.set(key, { ...t, key });
      else {
        // в случае дубля добавим индекс для уникальности
        uniq.set(`${key}-${idx}`, { ...t, id: `${t.id}-${idx}`, key: `${key}-${idx}` });
      }
    });

    res.json({ success: true, teachers: Array.from(uniq.values()) });
  } catch (error) {
    console.error('Ошибка поиска преподавателей:', error.message);
    res.status(500).json({ success: false, message: 'Ошибка при поиске преподавателей' });
  }
};

