# Исправление фильтрации опросов lesson_review

## Проблема

Quality Dashboard API возвращал пустые данные при фильтрации по faculty/program/course, хотя seed создал 103 опроса.

**Причина:** Несовпадение между структурой данных seed и фильтрами API.

| Поле | Где хранил seed | Где искал API | Результат |
|------|----------------|--------------|-----------|
| **faculty** | `responses[].user_faculty` | НЕ ИСКАЛ ❌ | Не фильтровал |
| **program** | `responses[].user_program` | НЕ ИСКАЛ ❌ | Не фильтровал |
| **course** | `responses[].user_course` | НЕ ИСКАЛ ❌ | Не фильтровал |

---

## Решение

### 1. Обновлен seed скрипт `seedLessonReviews.js`

**Добавлены поля на уровень Poll документа:**

```javascript
const poll = new Poll({
  // ✅ ДОБАВЛЕНО: Поля для фильтрации API
  faculty: facultyObj.code,              // 'ФКН'
  faculty_name: facultyObj.name,         // 'Факультет компьютерных наук'
  program: programObj.code,              // 'ПИ'
  program_name: programObj.name,         // 'Программная инженерия'
  course: course,                        // 2 или 3
  
  // ... остальные поля
});
```

**Изменена сигнатура функции:**
- Было: `createLessonReviewPoll(discipline, teacher, students, daysOffset)`
- Стало: `createLessonReviewPoll(discipline, teacher, students, facultyObj, programObj, daysOffset)`

---

### 2. Обновлен `detailedAnalyticsService.js`

**Добавлена фильтрация по новым полям:**

```javascript
async function getPollsWithFilters(filters) {
  const query = {
    pollType: 'lesson_review',
    status: { $ne: 'deleted' }
  };

  // ✅ ДОБАВЛЕНО: Фильтрация по faculty/program/course
  if (filters.faculty) query.faculty = filters.faculty;
  if (filters.program) query.program = filters.program;
  if (filters.course) query.course = parseInt(filters.course);
  
  // ... остальные фильтры
}
```

---

### 3. Обновлен `detailedAnalyticsRoutes.js`

**Добавлены query параметры:**

```javascript
router.get('/detailed', async (req, res) => {
  const { 
    disciplineId, teacherId, period, dateFrom, dateTo, group, topic,
    faculty, program, course  // ✅ ДОБАВЛЕНО
  } = req.query;
  
  // Применяем фильтры
  if (faculty && faculty !== 'all') {
    filter.faculty = faculty;
  }
  if (program && program !== 'all') {
    filter.program = program;
  }
  if (course && course !== 'all') {
    filter.course = parseInt(course);
  }
});
```

---

### 4. Обновлен `adminRoutes.js` (экспорт)

**Изменена фильтрация для Excel и PDF:**

```javascript
// ✅ ОБНОВЛЕНО: Используем поля на уровне Poll
if (filters.faculty && filters.faculty !== 'all') {
  matchStage.faculty = filters.faculty;  // Было: matchStage['responses.student_metadata.faculty']
}
if (filters.program && filters.program !== 'all') {
  matchStage.program = filters.program;  // Было: matchStage['responses.student_metadata.program']
}
if (filters.course && filters.course !== 'all') {
  matchStage.course = parseInt(filters.course);  // ДОБАВЛЕНО
}
```

---

## Как применить исправления

### 1. Перезапустить seed скрипт

```bash
cd /Users/anastasiia/Desktop/studvote/server
npm run seed-lesson-reviews
```

**Что произойдет:**
- Удалятся старые опросы (title: `/^Оценка занятия:/`)
- Создадутся новые опросы **с полями faculty/program/course**
- Создадутся ~50-70 опросов, ~1500-2000 ответов

### 2. Проверить результат

**В MongoDB должны появиться опросы с полями:**

```javascript
{
  _id: ObjectId("..."),
  title: "Оценка занятия: Базы данных",
  pollType: "lesson_review",
  
  // ✅ Новые поля
  faculty: "ФКН",
  faculty_name: "Факультет компьютерных наук",
  program: "ПИ",
  program_name: "Программная инженерия",
  course: 2,
  
  lessonContext: { ... },
  responses: [ ... ]
}
```

### 3. Проверить фильтрацию в API

**Запрос:**
```http
GET /api/admin/analytics/detailed?faculty=ФКН&program=ПИ&course=2
```

**Ожидаемый результат:**
- API должен вернуть опросы только для ФКН → ПИ → курс 2
- Не пустой ответ ✅

### 4. Проверить экспорт

1. Войти как **admin@fa.ru**
2. Перейти в "Дашборд качества образования"
3. Выбрать фильтры: **ФКН** → **ПИ** → **курс 2**
4. Нажать "Экспортировать" → "Excel (сырые данные)"
5. Проверить что файл содержит данные только для выбранных фильтров

---

## Технические детали

### Почему добавили поля на уровень Poll?

**Вариант A (выбран):** Поля на уровне документа Poll
- ✅ Быстрая фильтрация (индекс на уровне документа)
- ✅ Простой MongoDB query
- ✅ Не нужен $elemMatch для responses

**Вариант B (отклонен):** Фильтрация по responses[]
- ❌ Медленная фильтрация (нужен $elemMatch)
- ❌ Сложный query: `query['responses.user_faculty'] = 'ФКН'`
- ❌ Возвращает Poll если ХОТЯ БЫ ОДИН response подходит

### Структура данных

**До исправления:**
```javascript
Poll {
  // НЕТ полей faculty/program/course ❌
  responses: [
    { user_faculty: 'ФКН', user_program: 'ПИ', ... }  // Данные внутри
  ]
}
```

**После исправления:**
```javascript
Poll {
  faculty: 'ФКН',        // ✅ Есть на уровне Poll
  program: 'ПИ',         // ✅ Есть на уровне Poll
  course: 2,             // ✅ Есть на уровне Poll
  responses: [
    { user_faculty: 'ФКН', user_program: 'ПИ', ... }  // Дубликат для совместимости
  ]
}
```

---

## Проверочный список

- [x] Seed скрипт обновлен (добавлены поля faculty/program/course)
- [x] detailedAnalyticsService фильтрует по новым полям
- [x] detailedAnalyticsRoutes передает параметры faculty/program/course
- [x] adminRoutes экспорт использует новые поля
- [ ] **TODO:** Запустить seed скрипт
- [ ] **TODO:** Проверить фильтрацию в API
- [ ] **TODO:** Проверить экспорт в Excel/PDF

---

## Файлы изменены

1. `/server/src/scripts/seedLessonReviews.js` - добавлены поля на уровень Poll
2. `/server/src/services/detailedAnalyticsService.js` - фильтрация по faculty/program/course
3. `/server/src/routes/detailedAnalyticsRoutes.js` - передача параметров
4. `/server/src/routes/adminRoutes.js` - обновлена фильтрация экспорта

---

**Дата исправления:** 2026-01-15
**Статус:** Готово к тестированию ✅
