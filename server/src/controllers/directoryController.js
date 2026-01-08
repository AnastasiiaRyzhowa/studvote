const {
  getStructure,
  getFaculties,
  getGroups,
  findFaculty,
  findProgram,
  findCourse
} = require('../services/academicStructureService');

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

