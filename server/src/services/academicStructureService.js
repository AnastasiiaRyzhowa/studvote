const redis = require('../config/redis');
const { fetchJson } = require('./ruzService');

const STRUCTURE_CACHE_KEY = 'ruz:structure:v2';
const STRUCTURE_TTL = 600; // 10 минут

async function getFaculties() {
  return fetchJson('/dictionary/faculties');
}

async function getGroups(params = {}) {
  return fetchJson('/dictionary/groups', params);
}

/**
 * Собирает иерархию факультет -> программа(специальность) -> курс -> группы
 * на основе справочника групп RUZ.
 */
async function buildStructure() {
  // Формы обучения, которые учитываем: 1 - очная, 2 - очно-заочная
  const ALLOWED_FORMS = [1, 2];

  const [faculties, groupsRaw] = await Promise.all([
    getFaculties(),
    getGroups()
  ]);

  const facultyById = new Map(faculties.map((f) => [f.facultyOid, f]));

  // Для каждой (программа, курс, форма, название группы) берём запись с максимальным YearOfEducation
  const bestByKey = new Map();
  for (const g of groupsRaw) {
    if (g.is_schedule !== 1) continue;
    if (!ALLOWED_FORMS.includes(g.FormOfEducationOid)) continue;

    const courseNumber = Number(g.course) || 0;
    if (courseNumber <= 0) continue;

    const specialityNameRaw = g.speciality && g.speciality.trim().length > 0 ? g.speciality.trim() : null;
    const progIdRaw = g.SpecialityOid ?? null;
    const normalizedName = specialityNameRaw ? specialityNameRaw.toLowerCase() : null;
    // Ключ программы по нормализованному названию, чтобы убрать дубли (например, "Юриспруденция" с разными Oid)
    const progKey = normalizedName || (progIdRaw ? String(progIdRaw) : null);
    if (!progKey) continue;

    const groupLabel = g.name || g.number || String(g.groupOid);
    const key = `${progKey}:${courseNumber}:${g.FormOfEducationOid}:${groupLabel}`;
    const prev = bestByKey.get(key);
    if (!prev || (g.YearOfEducation || 0) > (prev.YearOfEducation || 0)) {
      bestByKey.set(key, g);
    }
  }

  const structureMap = new Map();

  for (const g of bestByKey.values()) {
    const facultyId = g.facultyOid;
    const facultyName = g.faculty || facultyById.get(facultyId)?.name || 'Факультет';

    const specialityNameRaw = g.speciality && g.speciality.trim().length > 0 ? g.speciality.trim() : null;
    const progIdRaw = g.SpecialityOid ?? null;
    const normalizedName = specialityNameRaw ? specialityNameRaw.toLowerCase() : null;
    const progKey = normalizedName || (progIdRaw ? String(progIdRaw) : null);
    if (!progKey) continue;
    const progName = specialityNameRaw || `Специальность ${progKey}`;

    const courseNumber = Number(g.course);

    const groupEntry = {
      id: g.groupOid,
      name: g.name || g.number || String(g.groupOid),
      fullName: g.name || g.number || String(g.groupOid)
    };

    if (!structureMap.has(facultyId)) {
      structureMap.set(facultyId, {
        id: String(facultyId),
        name: facultyName,
        programs: new Map()
      });
    }
    const facultyNode = structureMap.get(facultyId);

    if (!facultyNode.programs.has(progKey)) {
      facultyNode.programs.set(progKey, {
        id: String(progKey),
        name: progName,
        courses: new Map()
      });
    }
    const programNode = facultyNode.programs.get(progKey);

    if (!programNode.courses.has(courseNumber)) {
      programNode.courses.set(courseNumber, {
        number: courseNumber,
        groups: []
      });
    }
    programNode.courses.get(courseNumber).groups.push(groupEntry);
  }

  return Array.from(structureMap.values()).map((faculty) => ({
    id: faculty.id,
    name: faculty.name,
    programs: Array.from(faculty.programs.values()).map((program) => ({
      id: program.id,
      name: program.name,
      courses: Array.from(program.courses.values()).sort((a, b) => a.number - b.number)
    }))
  }));
}

async function getStructure() {
  const cached = await redis.get(STRUCTURE_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      // ignore parse error
    }
  }

  const structure = await buildStructure();
  await redis.setex(STRUCTURE_CACHE_KEY, STRUCTURE_TTL, JSON.stringify(structure));
  return structure;
}

/**
 * Находит элементы в структуре.
 */
function findFaculty(structure, facultyId) {
  return structure.find((f) => f.id === String(facultyId));
}

function findProgram(faculty, programId) {
  if (!faculty) return null;
  return faculty.programs.find((p) => p.id === String(programId));
}

function findCourse(program, course) {
  if (!program) return null;
  return program.courses.find((c) => c.number === Number(course));
}

function findGroup(course, groupId) {
  if (!course) return null;
  return course.groups.find((g) => String(g.id) === String(groupId));
}

module.exports = {
  getStructure,
  getFaculties,
  getGroups,
  findFaculty,
  findProgram,
  findCourse,
  findGroup
};

