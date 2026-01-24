# Исправление: Фильтр по дате использовал несуществующее поле

## Проблема

Quality Dashboard API возвращал пустые данные при фильтрации по периоду (semester), несмотря на то что:
- ✅ В БД есть 13 опросов для ФКН → ПИ → курс 2
- ✅ Поля `faculty`, `program`, `course` правильно установлены
- ✅ MongoDB query работает корректно (прямой запрос возвращал данные)

**Причины:**

1. **Поле `created_at` не установлено в опросах**
   - API фильтровал по `query.created_at = dateFilter`
   - Seed скрипт не устанавливал `created_at`
   - Результат: все опросы исключались фильтром

2. **Неправильная логика определения семестра**
   - Для января 2026 (месяц = 0) код устанавливал:
     - `startDate = 1 сентября 2026` (будущее!)
     - `endDate = 31 января 2027`
   - Опросы созданы в декабре 2025 - январе 2026
   - Результат: опросы не попадали в диапазон

---

## Исправления

### 1. Изменен фильтр даты на `lessonContext.date`

**Файл:** `/server/src/services/adminAnalyticsService.js`

```javascript
// БЫЛО:
if (dateFilter) {
  query.created_at = dateFilter;
}

// СТАЛО:
if (dateFilter) {
  // Для lesson_review используем дату занятия из lessonContext
  query['lessonContext.date'] = dateFilter;
}
```

**Причина:** 
- Для `lesson_review` опросов важна **дата занятия** (`lessonContext.date`), а не дата создания опроса
- Seed скрипт устанавливает `lessonContext.date`, но не `created_at`

---

### 2. Исправлена логика определения семестра

**Файл:** `/server/src/services/adminAnalyticsService.js`

```javascript
case 'semester':
  const month = now.getMonth();
  const year = now.getFullYear();
  
  if (month >= 8) {
    // Сентябрь-декабрь: осенний семестр текущего года
    startDate = new Date(year, 8, 1);         // 1 сентября текущего года
    endDate = new Date(year + 1, 0, 31);      // 31 января следующего года
  } else if (month <= 0) {
    // Январь: осенний семестр прошлого года
    startDate = new Date(year - 1, 8, 1);     // 1 сентября ПРОШЛОГО года ✅
    endDate = new Date(year, 0, 31);          // 31 января ТЕКУЩЕГО года ✅
  } else {
    // Февраль-июнь: весенний семестр
    startDate = new Date(year, 1, 1);         // 1 февраля
    endDate = new Date(year, 5, 30);          // 30 июня
  }
  break;
```

**Изменения:**
- Для января 2026: диапазон `1 сентября 2025 - 31 января 2026` ✅
- Раньше было: `1 сентября 2026 - 31 января 2027` ❌

---

## Проверка

### Даты созданных опросов:

```
Опрос 1: lessonContext.date: 25 декабря 2025
Опрос 2: lessonContext.date: 8 января 2026
Опрос 3: lessonContext.date: 1 января 2026
```

### Фильтр semester для января 2026:

```
startDate: 1 сентября 2025
endDate: 31 января 2026
```

**Результат:** Все опросы попадают в диапазон ✅

### MongoDB Query (после исправления):

```javascript
{
  "pollType": "lesson_review",
  "status": { "$ne": "deleted" },
  "faculty": "ФКН",
  "program": "ПИ",
  "course": 2,
  "lessonContext.date": {
    "$gte": "2025-09-01T00:00:00.000Z",
    "$lte": "2026-01-31T23:59:59.999Z"
  }
}
```

**Найдено:** 13 опросов ✅

---

## Структура данных

### Poll документ (поля для фильтрации):

```javascript
{
  _id: ObjectId("..."),
  pollType: "lesson_review",
  
  // Поля для фильтрации по структуре
  faculty: "ФКН",
  program: "ПИ",
  course: 2,
  
  // Дата занятия (используется для фильтра по периоду)
  lessonContext: {
    date: ISODate("2026-01-08T00:00:00.000Z"),  // ✅ Используется
    subject: "Базы данных",
    teacher: "Петров Петр Петрович",
    // ...
  },
  
  // created_at НЕ установлено (undefined) ❌
  // Поэтому фильтр по created_at не работал
  
  responses: [
    {
      user_id: ObjectId("..."),
      answers: { Q1: 5, Q2: 4, Q3: 5, Q4: 4, Q5: 5 },
      ikop: 84,
      // ...
    }
  ]
}
```

---

## Результат

### До исправления:

```
API запрос: ?faculty=ФКН&program=ПИ&course=2&period=semester

MongoDB Query:
{
  pollType: 'lesson_review',
  faculty: 'ФКН',
  program: 'ПИ',
  course: 2,
  created_at: {                           // ❌ Поле не существует!
    $gte: 2026-09-01,                    // ❌ Неправильный год (будущее)!
    $lte: 2027-01-31
  }
}

Результат: 0 опросов ❌
```

### После исправления:

```
API запрос: ?faculty=ФКН&program=ПИ&course=2&period=semester

MongoDB Query:
{
  pollType: 'lesson_review',
  faculty: 'ФКН',
  program: 'ПИ',
  course: 2,
  'lessonContext.date': {                // ✅ Правильное поле!
    $gte: 2025-09-01,                    // ✅ Правильный диапазон!
    $lte: 2026-01-31
  }
}

Результат: 13 опросов ✅
Ответов: 195 ✅
```

---

## Файлы изменены

1. ✅ `/server/src/services/adminAnalyticsService.js`
   - Изменен фильтр с `created_at` на `lessonContext.date`
   - Исправлена логика определения семестра

---

## Проверка в UI

**Шаги:**
1. Обновить страницу дашборда (F5)
2. Выбрать: **ФКН** → **Программная инженерия (ПИ)** → **курс 2**
3. Период: **Семестр**

**Ожидаемый результат:**
```json
{
  "summary": {
    "pollsCount": 13,
    "totalResponses": 195,
    "avgIkop": 80
  },
  "ikopByCriteria": [...],
  "topDisciplines": [...],
  "topTeachers": [...]
}
```

---

## Важно для будущего

### Для lesson_review опросов:

**Дата занятия** (`lessonContext.date`) — это основное поле для фильтрации по времени, потому что:
- Опрос создается для конкретного занятия
- Студенты оценивают качество конкретной пары
- Дата создания опроса (`created_at`) менее важна

### Рекомендация:

Если нужна дата создания опроса, добавить в seed скрипт:
```javascript
const poll = new Poll({
  // ...
  created_at: new Date(),  // или pollDate
  // ...
});
```

Но для lesson_review лучше использовать `lessonContext.date`.

---

**Дата исправления:** 2026-01-15  
**Статус:** Исправлено и протестировано ✅  
**Тест query:** Найдено 13 опросов для ФКН→ПИ→2 ✅  
**Логика semester:** Исправлена для января 2026 ✅
