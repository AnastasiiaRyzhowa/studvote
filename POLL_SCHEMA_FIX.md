# Исправление: Поля faculty/program/course отсутствовали в схеме Poll

## Проблема

Quality Dashboard API возвращал пустые данные, несмотря на то что:
- Seed скрипт был исправлен для добавления полей `faculty`, `program`, `course` ✅
- API контроллеры и сервисы были обновлены для фильтрации по этим полям ✅

**Причина:** Поля `faculty`, `program`, `course` **не были определены в схеме Mongoose модели Poll**! 

При попытке сохранить Poll с этими полями, Mongoose их игнорировал (strict mode), поэтому они не попадали в базу данных.

---

## Исправление

### Файл: `/server/src/models/Poll.js`

**Добавлено (после строки 210):**

```javascript
// Контекст создателя (откуда опрос)
source_faculty: String,
source_program: String,
source_course: Number,
source_group: String,

// ✅ ДОБАВЛЕНО: Поля для фильтрации lesson_review опросов в аналитике
faculty: { type: String, default: null },
faculty_name: { type: String, default: null },
program: { type: String, default: null },
program_name: { type: String, default: null },
course: { type: Number, default: null },

// ==================== ТАРГЕТИНГ (кому показывать) ====================
```

---

## Проверка после исправления

### Запуск seed:
```bash
cd /Users/anastasiia/Desktop/studvote/server
npm run seed-lesson-reviews
```

**Результат:**
```
✅ Создано опросов: 105
✅ Создано ответов: 1666
```

### Проверка структуры данных:

**MongoDB query:**
```javascript
db.polls.find({ 
  pollType: 'lesson_review',
  faculty: 'ФКН',
  program: 'ПИ',
  course: 2
}).count()
```

**Результат:** `13 опросов` ✅

**Уникальные значения:**
- Факультеты: `['ФКН', 'ФЭК']`
- Программы: `['ИБ', 'ИВТ', 'МЕН', 'ПИ', 'ЭК']`
- Курсы: `[2, 3]`

---

## Почему это работает теперь

### До исправления:

```
Seed скрипт:
  poll.faculty = 'ФКН'
       ↓
Mongoose (strict mode):
  ❌ "faculty" не в схеме → игнорирую
       ↓
MongoDB:
  { pollType: 'lesson_review' }
  (без faculty!)
       ↓
API query:
  Poll.find({ faculty: 'ФКН' })
       ↓
Результат: 0 опросов ❌
```

### После исправления:

```
Seed скрипт:
  poll.faculty = 'ФКН'
       ↓
Mongoose:
  ✅ "faculty" есть в схеме → сохраняю
       ↓
MongoDB:
  {
    pollType: 'lesson_review',
    faculty: 'ФКН',    ✅
    program: 'ПИ',     ✅
    course: 2          ✅
  }
       ↓
API query:
  Poll.find({ faculty: 'ФКН' })
       ↓
Результат: 13 опросов ✅
```

---

## Структура Poll документа (финальная)

```javascript
{
  _id: ObjectId("..."),
  title: "Оценка занятия: Базы данных",
  pollType: "lesson_review",
  
  // ✅ Поля на верхнем уровне для фильтрации API
  faculty: "ФКН",
  faculty_name: "Факультет компьютерных наук",
  program: "ПИ",
  program_name: "Программная инженерия",
  course: 2,
  
  // Контекст занятия
  lessonContext: {
    subject: "Базы данных",
    teacher: "Петров Петр Петрович",
    group: "ПИ-201",
    date: "2026-01-14T10:00:00.000Z",
    // ...
  },
  
  // Ответы студентов
  responses: [
    {
      user_id: ObjectId("..."),
      answers: { Q1: 5, Q2: 4, Q3: 5, Q4: 4, Q5: 5 },
      ikop: 84,
      // Дубликат метаданных в каждом ответе
      user_faculty: "ФКН",
      user_program: "ПИ",
      user_course: 2,
      // ...
    }
  ],
  
  // Таргетинг
  target_faculties: ["ФКН"],
  target_programs: ["ПИ"],
  target_courses: [2],
  // ...
}
```

---

## Почему не использовать `strict: false`?

**Вариант 1: `strict: false`** (плохо)
```javascript
const PollSchema = new mongoose.Schema({
  // ...
}, { strict: false });
```

❌ Проблемы:
- Любые поля будут сохраняться → риск ошибок
- Нет валидации типов
- Нет автодополнения в IDE
- Сложно контролировать структуру данных

**Вариант 2: Явное определение в схеме** (правильно) ✅
```javascript
faculty: { type: String, default: null }
```

✅ Преимущества:
- Валидация типов
- Контроль структуры
- Автодополнение в IDE
- Ясная документация схемы

---

## Файлы изменены

1. ✅ `/server/src/models/Poll.js` - добавлены поля в схему
2. ✅ `/server/src/controllers/adminController.js` - добавлен `program` в фильтры
3. ✅ `/server/src/services/adminAnalyticsService.js` - фильтрация по новым полям
4. ✅ `/server/src/services/detailedAnalyticsService.js` - фильтрация
5. ✅ `/server/src/routes/detailedAnalyticsRoutes.js` - параметры
6. ✅ `/server/src/routes/adminRoutes.js` - экспорт
7. ✅ `/server/src/scripts/seedLessonReviews.js` - создание с новыми полями

---

## Проверка в UI

**Шаги:**
1. Обновить страницу дашборда (F5)
2. Выбрать: **ФКН** → **Программная инженерия (ПИ)** → **курс 2**
3. Должны появиться данные:
   - `pollsCount: 13`
   - `totalResponses: ~200`
   - `avgIkop: ~80`
   - Графики с данными ✅

**Другие комбинации:**
- ФКН → ИВТ → 2 курс → ~13 опросов
- ФКН → ИБ → 3 курс → ~13 опросов
- ФЭК → ЭК → 3 курс → ~7 опросов
- Все факультеты → 105 опросов

---

## Урок

**Всегда проверяйте схему Mongoose перед написанием seed скриптов!**

Даже если seed скрипт выглядит правильно и не выдает ошибок, данные могут не сохраняться, если поля не определены в схеме.

**Порядок действий:**
1. ✅ Определить поля в схеме Mongoose
2. ✅ Написать seed скрипт
3. ✅ Обновить API контроллеры/сервисы
4. ✅ Запустить seed
5. ✅ Проверить данные в БД напрямую
6. ✅ Проверить API endpoint
7. ✅ Проверить UI

---

**Дата исправления:** 2026-01-15  
**Статус:** Готово и протестировано ✅  
**Seed:** Выполнен (105 опросов с правильной структурой) ✅  
**Фильтрация:** Работает (найдено 13 опросов для ФКН→ПИ→2) ✅
