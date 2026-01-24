# Каскадный выбор: Факультет → Программа → Курс → Группа

## 1. Компонент регистрации студента

**Путь:** `/client/src/components/Auth/Register.js`

Это компонент, который отображается при первом входе студента после подтверждения email. Студент должен выбрать свою академическую группу через каскадную систему выбора.

---

## 2. Структура данных

Данные загружаются из API РУЗ (Расписание Учебных Занятий ВШЭ) и кэшируются в Redis.

### Иерархия данных:

```javascript
[
  {
    id: "1",
    name: "ФИТиАБД",
    programs: [
      {
        id: "devops",
        name: "DevOps и системное администрирование",
        courses: [
          {
            number: 1,
            groups: [
              { id: "12345", name: "22МО05", fullName: "22МО05" },
              { id: "12346", name: "22МО06", fullName: "22МО06" }
            ]
          },
          {
            number: 2,
            groups: [...]
          }
        ]
      }
    ]
  }
]
```

---

## 3. Каскадная логика выбора

### 3.1 Загрузка структуры при монтировании

```javascript
// Register.js (строки 54-74)
useEffect(() => {
  if (!tempData?.email || !tempData?.role) {
    navigate('/login');
    return;
  }

  const loadConstants = async () => {
    try {
      const data = await getConstants();
      // departments для преподавателей
      setConstants((prev) => ({ ...prev, departments: data.departments || [] }));

      // structure - полная иерархия факультет → программа → курс → группа
      const structureData = await getStructure();
      setConstants((prev) => ({ ...prev, structure: structureData || [] }));
    } catch (err) {
      console.error('Failed to load constants:', err);
    }
  };

  loadConstants();
}, [tempData, navigate]);
```

### 3.2 Обработка выбора факультета

```javascript
// Register.js (строки 80-94)
if (name === 'facultyId') {
  // Сбрасываем все нижележащие уровни
  setPrograms([]);
  setAvailableCourses([]);
  setAvailableGroups([]);
  
  setFormData({
    ...formData,
    facultyId: value,
    programId: '',
    course: '',
    group: ''
  });
  
  // Загружаем программы выбранного факультета
  const faculty = constants.structure.find((f) => f.id === value);
  setPrograms(faculty?.programs || []);
  
  return;
}
```

**Что происходит:**
1. ✅ Выбран факультет (например, "ФИТиАБД")
2. ✅ Сброшены программа, курс, группа
3. ✅ Загружены программы этого факультета
4. ❌ Программа, курс, группа disabled до выбора

### 3.3 Обработка выбора программы

```javascript
// Register.js (строки 96-107)
if (name === 'programId') {
  // Сбрасываем курс и группу
  setAvailableGroups([]);
  
  const program = programs.find((p) => p.id === value);
  setAvailableCourses(program?.courses?.map((c) => c.number) || []);
  
  setFormData({
    ...formData,
    programId: value,
    course: '',
    group: ''
  });
  
  return;
}
```

**Что происходит:**
1. ✅ Выбрана программа (например, "DevOps")
2. ✅ Сброшены курс и группа
3. ✅ Загружены курсы этой программы ([1, 2, 3, 4])
4. ❌ Группа disabled до выбора курса

### 3.4 Обработка выбора курса

```javascript
// Register.js (строки 109-121)
if (name === 'course') {
  const program = programs.find((p) => p.id === formData.programId);
  const groups = program?.courses
    ?.find((c) => c.number === Number(value))
    ?.groups || [];
  
  setAvailableGroups(groups);
  
  setFormData({
    ...formData,
    course: value,
    groupId: ''
  });
  
  return;
}
```

**Что происходит:**
1. ✅ Выбран курс (например, 2)
2. ✅ Сброшена группа
3. ✅ Загружены группы этого курса ([{id: "12345", name: "22МО05"}, ...])
4. ✅ Теперь можно выбрать группу

---

## 4. UI компоненты (Material-UI)

### 4.1 Факультет

```jsx
// Register.js (строки 247-275)
<TextField
  fullWidth
  required
  select
  name="facultyId"
  label="Факультет"
  value={formData.facultyId}
  onChange={handleChange}
  disabled={loading}
  InputProps={{
    startAdornment: (
      <InputAdornment position="start">
        <SchoolIcon sx={{ color: '#6B7280' }} />
      </InputAdornment>
    )
  }}
>
  {constants.structure.map((faculty) => (
    <MenuItem key={faculty.id} value={faculty.id}>
      {faculty.name}
    </MenuItem>
  ))}
</TextField>
```

### 4.2 Программа

```jsx
// Register.js (строки 277-298)
<TextField
  fullWidth
  required
  select
  name="programId"
  label="Направление подготовки"
  value={formData.programId}
  onChange={handleChange}
  disabled={loading || !formData.facultyId}  // ← disabled до выбора факультета
>
  {programs.map((program) => (
    <MenuItem key={program.id} value={program.id}>
      {program.name}
    </MenuItem>
  ))}
</TextField>
```

### 4.3 Курс и Группа (в одной строке)

```jsx
// Register.js (строки 300-344)
<Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
  {/* Курс */}
  <TextField
    required
    select
    name="course"
    label="Курс"
    value={formData.course}
    onChange={handleChange}
    disabled={loading || !formData.programId}  // ← disabled до выбора программы
    sx={{ flex: 1 }}
  >
    {availableCourses.map((course) => (
      <MenuItem key={course} value={course}>
        {course} курс
      </MenuItem>
    ))}
  </TextField>

  {/* Группа */}
  <TextField
    required
    select
    name="groupId"
    label="Группа"
    value={formData.groupId}
    onChange={handleChange}
    disabled={loading || !formData.course}  // ← disabled до выбора курса
    sx={{ flex: 1 }}
  >
    {availableGroups.map((group) => (
      <MenuItem key={group.id} value={group.id}>
        {group.name}
      </MenuItem>
    ))}
  </TextField>
</Box>
```

---

## 5. API Endpoints

### 5.1 Загрузка полной структуры (один запрос)

**Frontend:**
```javascript
// directoryService.js (строка 3-6)
export const getStructure = async () => {
  const response = await api.get('/directory/structure');
  return response.data.structure;
};
```

**Backend:**
```javascript
// directoryRoutes.js (строка 5)
router.get('/structure', directoryController.getStructure);

// directoryController.js (строки 11-14)
exports.getStructure = async (req, res) => {
  const structure = await getStructure();
  res.json({ success: true, structure });
};

// academicStructureService.js (строки 113-126)
async function getStructure() {
  // Проверяем кэш Redis
  const cached = await redis.get(STRUCTURE_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      // ignore parse error
    }
  }

  // Если нет в кэше - строим структуру из API РУЗ
  const structure = await buildStructure();
  
  // Кэшируем на 10 минут
  await redis.setex(STRUCTURE_CACHE_KEY, STRUCTURE_TTL, JSON.stringify(structure));
  
  return structure;
}
```

**Запрос:**
```http
GET /api/directory/structure
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "success": true,
  "structure": [
    {
      "id": "1",
      "name": "ФИТиАБД",
      "programs": [
        {
          "id": "devops",
          "name": "DevOps и системное администрирование",
          "courses": [
            {
              "number": 1,
              "groups": [
                { "id": "12345", "name": "22МО05", "fullName": "22МО05" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### 5.2 Альтернативные endpoint'ы (для отдельных запросов)

Эти endpoint'ы существуют, но **не используются** в компоненте Register, так как он загружает всю структуру сразу:

```javascript
// directoryService.js

// GET /api/directory/faculties
export const getFaculties = async () => {
  const response = await api.get('/directory/faculties');
  return response.data.faculties;
};

// GET /api/directory/programs?facultyId=1
export const getPrograms = async (facultyId) => {
  const response = await api.get('/directory/programs', { params: { facultyId } });
  return response.data.programs;
};

// GET /api/directory/courses?programId=devops
export const getCourses = async (programId) => {
  const response = await api.get('/directory/courses', { params: { programId } });
  return response.data.courses;
};

// GET /api/directory/groups?programId=devops&course=2
export const getGroups = async (programId, course) => {
  const response = await api.get('/directory/groups', { params: { programId, course } });
  return response.data.groups;
};
```

---

## 6. Построение структуры из API РУЗ

**Файл:** `/server/src/services/academicStructureService.js`

### 6.1 Основная функция buildStructure()

```javascript
// academicStructureService.js (строки 19-111)
async function buildStructure() {
  // 1. Загружаем данные из РУЗ API
  const [faculties, groupsRaw] = await Promise.all([
    getFaculties(),   // GET https://ruz.hse.ru/api/dictionary/faculties
    getGroups()       // GET https://ruz.hse.ru/api/dictionary/groups
  ]);
  
  // 2. Фильтруем только очные формы обучения (1 - очная, 2 - очно-заочная)
  const ALLOWED_FORMS = [1, 2];
  
  // 3. Для каждой группы создаем ключ (программа:курс:форма:название)
  //    и берем запись с максимальным YearOfEducation (последний год)
  const bestByKey = new Map();
  for (const g of groupsRaw) {
    if (g.is_schedule !== 1) continue;  // Только группы с расписанием
    if (!ALLOWED_FORMS.includes(g.FormOfEducationOid)) continue;
    
    const courseNumber = Number(g.course) || 0;
    if (courseNumber <= 0) continue;
    
    const specialityNameRaw = g.speciality?.trim() || null;
    const progIdRaw = g.SpecialityOid ?? null;
    const normalizedName = specialityNameRaw?.toLowerCase() || null;
    
    // Ключ программы по названию для устранения дублей
    const progKey = normalizedName || (progIdRaw ? String(progIdRaw) : null);
    if (!progKey) continue;
    
    const groupLabel = g.name || g.number || String(g.groupOid);
    const key = `${progKey}:${courseNumber}:${g.FormOfEducationOid}:${groupLabel}`;
    
    const prev = bestByKey.get(key);
    if (!prev || (g.YearOfEducation || 0) > (prev.YearOfEducation || 0)) {
      bestByKey.set(key, g);
    }
  }
  
  // 4. Строим иерархию: Факультет → Программа → Курс → Группы
  const structureMap = new Map();
  
  for (const g of bestByKey.values()) {
    const facultyId = g.facultyOid;
    const facultyName = g.faculty || facultyById.get(facultyId)?.name || 'Факультет';
    
    // ... код создания структуры ...
  }
  
  // 5. Преобразуем Map в Array и сортируем курсы
  return Array.from(structureMap.values()).map((faculty) => ({
    id: faculty.id,
    name: faculty.name,
    programs: Array.from(faculty.programs.values()).map((program) => ({
      id: program.id,
      name: program.name,
      courses: Array.from(program.courses.values())
        .sort((a, b) => a.number - b.number)  // Сортировка: 1, 2, 3, 4
    }))
  }));
}
```

### 6.2 Кэширование в Redis

```javascript
const STRUCTURE_CACHE_KEY = 'ruz:structure:v2';
const STRUCTURE_TTL = 600; // 10 минут

async function getStructure() {
  // Проверяем кэш
  const cached = await redis.get(STRUCTURE_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      // ignore parse error
    }
  }

  // Если нет - строим и кэшируем
  const structure = await buildStructure();
  await redis.setex(STRUCTURE_CACHE_KEY, STRUCTURE_TTL, JSON.stringify(structure));
  return structure;
}
```

**Преимущества:**
- ⚡ Быстрая загрузка (из Redis, а не из РУЗ API)
- 📉 Снижение нагрузки на РУЗ API
- 🔄 Автообновление каждые 10 минут

---

## 7. Валидация формы

```javascript
// Register.js (строки 167-179)
const isFormValid = () => {
  if (tempData?.role === 'student') {
    return formData.full_name.trim() &&
      formData.facultyId && 
      formData.programId && 
      formData.course && 
      formData.groupId;  // Все 5 полей обязательны
  }
  
  // ... другие роли ...
};
```

Кнопка "Завершить регистрацию" disabled до заполнения всех полей.

---

## 8. Отправка данных на сервер

```javascript
// Register.js (строки 129-165)
const handleSubmit = async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true);

  try {
    const userData = {
      email: tempData.email,
      full_name: formData.full_name.trim(),
      role: tempData.role,
      tempToken: tempData.tempToken
    };

    if (tempData.role === 'student') {
      // Добавляем данные студента
      userData.facultyId = formData.facultyId;
      userData.programId = formData.programId;
      userData.course = formData.course;
      userData.groupId = formData.groupId;
    }

    // POST /api/auth/register
    const response = await registerUser(userData);
    
    // Успешная регистрация - логин и редирект
    login(response.token, response.user);
    setSuccess(true);
    setTimeout(() => navigate('/'), 1500);
  } catch (err) {
    setError(err.response?.data?.message || 'Ошибка при регистрации');
  } finally {
    setLoading(false);
  }
};
```

**Payload:**
```json
{
  "email": "student@edu.hse.ru",
  "full_name": "Иванов Иван Иванович",
  "role": "student",
  "tempToken": "abc123...",
  "facultyId": "1",
  "programId": "devops",
  "course": 2,
  "groupId": "12345"
}
```

---

## 9. Диаграмма потока данных

```
┌─────────────────────────────────────────────────────────────────┐
│                    РЕГИСТРАЦИЯ СТУДЕНТА                          │
└─────────────────────────────────────────────────────────────────┘

1. Монтирование компонента
   ↓
   GET /api/directory/structure
   ↓
   Получение структуры (из Redis или РУЗ API)
   ↓
   Сохранение в state.constants.structure

2. Выбор факультета
   ↓
   handleChange('facultyId', value)
   ↓
   const faculty = structure.find(f => f.id === value)
   ↓
   setPrograms(faculty.programs)
   ↓
   Сброс: programId, course, groupId
   ↓
   TextField "Программа" enabled

3. Выбор программы
   ↓
   handleChange('programId', value)
   ↓
   const program = programs.find(p => p.id === value)
   ↓
   setAvailableCourses(program.courses.map(c => c.number))
   ↓
   Сброс: course, groupId
   ↓
   TextField "Курс" enabled

4. Выбор курса
   ↓
   handleChange('course', value)
   ↓
   const groups = program.courses.find(c => c.number === value).groups
   ↓
   setAvailableGroups(groups)
   ↓
   Сброс: groupId
   ↓
   TextField "Группа" enabled

5. Выбор группы
   ↓
   handleChange('groupId', value)
   ↓
   Все поля заполнены
   ↓
   Кнопка "Завершить регистрацию" enabled

6. Отправка формы
   ↓
   POST /api/auth/register
   {
     email, full_name, role, tempToken,
     facultyId, programId, course, groupId
   }
   ↓
   Успех: login() + navigate('/')
```

---

## 10. Визуальная последовательность

```
╔════════════════════════════════════════════════════════════╗
║  ШАГ 1: Выберите факультет                                 ║
╠════════════════════════════════════════════════════════════╣
║  [▼ Факультет                              ]  ✓ Enabled    ║
║  [   Направление подготовки (disabled)     ]  ✗ Disabled   ║
║  [   Курс (disabled)        ] [   Группа   ]  ✗ Disabled   ║
╚════════════════════════════════════════════════════════════╝

              ↓ Выбрали "ФИТиАБД"

╔════════════════════════════════════════════════════════════╗
║  ШАГ 2: Выберите программу                                 ║
╠════════════════════════════════════════════════════════════╣
║  [▼ ФИТиАБД                                ]  ✓ Выбран     ║
║  [▼ Направление подготовки                 ]  ✓ Enabled    ║
║  [   Курс (disabled)        ] [   Группа   ]  ✗ Disabled   ║
╚════════════════════════════════════════════════════════════╝

              ↓ Выбрали "DevOps"

╔════════════════════════════════════════════════════════════╗
║  ШАГ 3: Выберите курс                                      ║
╠════════════════════════════════════════════════════════════╣
║  [▼ ФИТиАБД                                ]  ✓ Выбран     ║
║  [▼ DevOps                                 ]  ✓ Выбран     ║
║  [▼ Курс                    ] [   Группа   ]  ✓ Enabled    ║
╚════════════════════════════════════════════════════════════╝

              ↓ Выбрали "2 курс"

╔════════════════════════════════════════════════════════════╗
║  ШАГ 4: Выберите группу                                    ║
╠════════════════════════════════════════════════════════════╣
║  [▼ ФИТиАБД                                ]  ✓ Выбран     ║
║  [▼ DevOps                                 ]  ✓ Выбран     ║
║  [▼ 2 курс                  ] [▼ Группа    ]  ✓ Enabled    ║
╚════════════════════════════════════════════════════════════╝

              ↓ Выбрали "22МО05"

╔════════════════════════════════════════════════════════════╗
║  ВСЕ ЗАПОЛНЕНО!                                            ║
╠════════════════════════════════════════════════════════════╣
║  [▼ ФИТиАБД                                ]               ║
║  [▼ DevOps                                 ]               ║
║  [▼ 2 курс                  ] [▼ 22МО05    ]               ║
║                                                            ║
║            [✓ Завершить регистрацию]  ← Enabled            ║
╚════════════════════════════════════════════════════════════╝
```

---

## 11. Особенности реализации

### ✅ Преимущества:

1. **Один запрос** - вся структура загружается сразу (`GET /structure`)
2. **Кэширование** - Redis кэш на 10 минут
3. **Автоматическая фильтрация** - только очные формы обучения
4. **Устранение дублей** - по нормализованному названию программы
5. **Актуальность** - берутся группы с максимальным YearOfEducation
6. **UX** - disabled состояния предотвращают неправильный выбор

### ⚠️ Нюансы:

1. **Зависимость от РУЗ API** - если РУЗ недоступен, структура не загрузится
2. **Отсутствие fallback** - нет резервного источника данных
3. **Жесткая иерархия** - нельзя выбрать группу без факультета
4. **Кэш может устареть** - обновление раз в 10 минут

---

## 12. Пример использования данных

После успешной регистрации, в User модели сохраняются:

```javascript
{
  email: "student@edu.hse.ru",
  full_name: "Иванов Иван Иванович",
  role: "student",
  
  // Академические данные
  facultyId: "1",
  programId: "devops",
  course: 2,
  groupId: "12345",
  
  // Дополнительно (из структуры)
  faculty: "ФИТиАБД",
  program: "DevOps и системное администрирование",
  group: "22МО05",
  
  is_active: true
}
```

Эти данные используются для:
- Таргетирования опросов (target_groups, target_faculties)
- Фильтрации дашборда
- Отображения в профиле
- Аналитики по группам/факультетам

---

## 13. Файлы в проекте

```
client/src/
├── components/Auth/
│   └── Register.js                      ← Основной компонент
├── services/
│   ├── authService.js                   ← API: register, getConstants
│   └── directoryService.js              ← API: getStructure

server/src/
├── routes/
│   └── directoryRoutes.js               ← Роуты: /structure, /faculties, etc.
├── controllers/
│   └── directoryController.js           ← Контроллеры для directory
└── services/
    ├── academicStructureService.js      ← Построение структуры из РУЗ
    └── ruzService.js                    ← Интеграция с РУЗ API
```

---

Готово! Теперь у вас есть полное понимание каскадной загрузки данных. 🎓
