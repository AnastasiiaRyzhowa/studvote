# Исправление Quality Dashboard - Пустые данные

## Проблема

Quality Dashboard возвращал пустые данные (`pollsCount: 0`) после фильтрации по faculty/program/course, хотя seed создал 103 опроса с 1548 ответами.

**Причина:** API endpoint `/api/admin/analytics/quality-dashboard` не использовал поля `faculty`, `program`, `course` для фильтрации опросов в MongoDB.

---

## Что было исправлено

### 1. ✅ Seed скрипт (`seedLessonReviews.js`)

**Изменено:** Добавлены поля `faculty`, `program`, `course` на уровень Poll документа

```javascript
const poll = new Poll({
  // ✅ ДОБАВЛЕНО
  faculty: facultyObj.code,              // 'ФКН'
  faculty_name: facultyObj.name,         // 'Факультет компьютерных наук'
  program: programObj.code,              // 'ПИ'
  program_name: programObj.name,         // 'Программная инженерия'
  course: course,                        // 2 или 3
  // ... остальные поля
});
```

**Результат seed:** ✅ Создано 103 опроса, 1548 ответов

---

### 2. ✅ AdminController (`adminController.js`)

**Изменено:** Добавлен параметр `program` в деструктуризацию и фильтры

```javascript
// БЫЛО:
const { faculty, course, group, subject, teacher, period } = req.query;

// СТАЛО:
const { faculty, program, course, group, subject, teacher, period } = req.query;

const filters = {
  faculty,
  program,  // ✅ ДОБАВЛЕНО
  course,
  // ...
};
```

**Endpoints исправлены:**
- `GET /api/admin/analytics/quality-dashboard`
- `GET /api/admin/analytics/custom-polls-dashboard`

---

### 3. ✅ AdminAnalyticsService (`adminAnalyticsService.js`)

**Изменено:** Добавлена фильтрация по `faculty/program/course` в MongoDB query

```javascript
// ✅ ДОБАВЛЕНО: Фильтрация на уровне Poll
if (faculty && faculty !== 'all') {
  query.faculty = faculty;
}
if (program && program !== 'all') {
  query.program = program;
}
if (course && course !== 'all') {
  query.course = parseInt(course);
}
```

**Функции исправлены:**
- `getDashboardStatistics()` - главная статистика дашборда
- `getCustomPollsStatistics()` - статистика свободных опросов

---

### 4. ✅ DetailedAnalyticsService (`detailedAnalyticsService.js`)

**Изменено:** Добавлена фильтрация в `getPollsWithFilters`

```javascript
if (filters.faculty) query.faculty = filters.faculty;
if (filters.program) query.program = filters.program;
if (filters.course) query.course = parseInt(filters.course);
```

---

### 5. ✅ DetailedAnalyticsRoutes (`detailedAnalyticsRoutes.js`)

**Изменено:** Добавлены query параметры `faculty`, `program`, `course`

```javascript
const { 
  disciplineId, teacherId, period, dateFrom, dateTo, group, topic,
  faculty, program, course  // ✅ ДОБАВЛЕНО
} = req.query;
```

---

### 6. ✅ AdminRoutes (`adminRoutes.js`)

**Изменено:** Обновлена фильтрация в экспорте Excel/PDF

```javascript
// ✅ ОБНОВЛЕНО: Используем поля на уровне Poll
if (filters.faculty && filters.faculty !== 'all') {
  matchStage.faculty = filters.faculty;
}
if (filters.program && filters.program !== 'all') {
  matchStage.program = filters.program;
}
if (filters.course && filters.course !== 'all') {
  matchStage.course = parseInt(filters.course);
}
```

---

## Структура данных после исправления

### Poll документ в MongoDB:

```javascript
{
  _id: ObjectId("..."),
  title: "Оценка занятия: Базы данных",
  pollType: "lesson_review",
  
  // ✅ Поля на уровне Poll (для быстрой фильтрации)
  faculty: "ФКН",
  faculty_name: "Факультет компьютерных наук",
  program: "ПИ",
  program_name: "Программная инженерия",
  course: 2,
  
  lessonContext: {
    subject: "Базы данных",
    teacher: "Петров Петр Петрович",
    group: "ПИ-201",
    // ...
  },
  
  responses: [
    {
      user_id: ObjectId("..."),
      answers: { Q1: 5, Q2: 4, Q3: 5, Q4: 4, Q5: 5 },
      ikop: 85,
      // Дубликат метаданных в каждом ответе
      user_faculty: "ФКН",
      user_program: "ПИ",
      user_course: 2,
      // ...
    }
  ]
}
```

---

## Как проверить исправление

### 1. Перезапуск seed (УЖЕ ВЫПОЛНЕНО ✅)

```bash
cd /Users/anastasiia/Desktop/studvote/server
npm run seed-lesson-reviews
```

**Результат:**
```
✅ Создано опросов: 103
✅ Создано ответов: 1548
```

### 2. Проверка данных в MongoDB

**Query для проверки:**
```javascript
db.polls.find({ 
  pollType: 'lesson_review',
  faculty: 'ФКН',
  program: 'ПИ',
  course: 2
}).count()
```

**Должно вернуть:** ~15 опросов (для ФКН → ПИ → курс 2)

### 3. Тест API endpoint

**Request:**
```http
GET /api/admin/analytics/quality-dashboard?faculty=ФКН&program=ПИ&course=2&period=month
Authorization: Bearer <admin_token>
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "pollsCount": 15,      // НЕ 0! ✅
      "totalResponses": 250,  // НЕ 0! ✅
      "avgIkop": 78           // НЕ 0! ✅
    },
    "ikopByCriteria": [ ... ],
    "topDisciplines": [ ... ]
  }
}
```

### 4. Проверка в UI

**Шаги:**
1. Войти как **admin@fa.ru**
2. Перейти в **"Дашборд качества образования"**
3. Выбрать фильтры:
   - **Факультет:** ФКН
   - **Программа:** Программная инженерия (ПИ)
   - **Курс:** 2
4. **Результат:** Должны появиться графики и данные ✅

---

## Почему это работает

### До исправления:

```
Фронтенд → API (?faculty=ФКН&program=ПИ&course=2)
           ↓
API игнорирует faculty/program ❌
           ↓
MongoDB query: { pollType: 'lesson_review' }
           ↓
Возвращает ВСЕ 103 опроса
           ↓
Фронтенд фильтрует локально?
           ↓
Пустые данные ❌
```

### После исправления:

```
Фронтенд → API (?faculty=ФКН&program=ПИ&course=2)
           ↓
API применяет фильтры ✅
           ↓
MongoDB query: { 
  pollType: 'lesson_review',
  faculty: 'ФКН',      // ✅
  program: 'ПИ',       // ✅
  course: 2            // ✅
}
           ↓
Возвращает только 15 опросов для ФКН→ПИ→2
           ↓
Данные отображаются ✅
```

---

## Индексы MongoDB (рекомендуется)

Для оптимизации производительности создать индексы:

```javascript
db.polls.createIndex({ 
  pollType: 1, 
  faculty: 1, 
  program: 1, 
  course: 1,
  created_at: -1
});
```

---

## Файлы изменены

1. ✅ `/server/src/scripts/seedLessonReviews.js`
2. ✅ `/server/src/controllers/adminController.js`
3. ✅ `/server/src/services/adminAnalyticsService.js`
4. ✅ `/server/src/services/detailedAnalyticsService.js`
5. ✅ `/server/src/routes/detailedAnalyticsRoutes.js`
6. ✅ `/server/src/routes/adminRoutes.js`

---

## Следующие шаги

### 1. Проверить в UI (ПРЯМО СЕЙЧАС):

1. Обновить страницу дашборда (Cmd+R / F5)
2. Выбрать: **ФКН** → **ПИ** → **курс 2**
3. Должны появиться данные ✅

### 2. Проверить экспорт:

1. Нажать "Экспортировать" → "Excel"
2. Проверить что файл содержит данные только для ФКН→ПИ→2

### 3. Протестировать другие комбинации:

- **ФЭК** → **ЭК** → **курс 3**
- **ФКН** → **ИВТ** → **курс 2**
- Без фильтров (все опросы: 103)

---

**Дата исправления:** 2026-01-15  
**Статус:** Готово к тестированию ✅  
**Сервер:** Перезапущен с изменениями ✅  
**Seed:** Выполнен (103 опроса, 1548 ответов) ✅
