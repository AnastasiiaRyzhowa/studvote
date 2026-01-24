# Анализ реализации Leaderboard

## 📊 **Текущее состояние**

### ❌ **Проблема:** API endpoint НЕ реализован

**Frontend:** `/client/src/pages/Leaderboard.js` (строка 70-72)
```javascript
// TODO: Заменить на реальный API запрос
// const response = await api.get('/users/leaderboard');
// setLeaderboard(response.data.users);

// Используем mock данные
```

**Backend:** Endpoint `GET /api/users/leaderboard` **не существует**

---

## 🎨 **Frontend реализация**

### Файл: `/client/src/pages/Leaderboard.js`

#### **1. Mock данные (строки 37-48):**

```javascript
const mockLeaderboard = [
  { 
    _id: '1', 
    full_name: 'Иванов Иван Петрович', 
    student_data: { 
      group: 'ПИ-401', 
      points: 450 
    }, 
    trend: 0 
  },
  // ... ещё 9 пользователей
];
```

**Формат данных, который ожидает frontend:**
```javascript
{
  _id: String,           // ID пользователя
  full_name: String,     // ФИО студента
  student_data: {
    group: String,       // Название группы
    points: Number       // Количество баллов
  },
  trend: Number          // Изменение позиции (-3, 0, +2, +5)
}
```

---

#### **2. Расчёт уровня (строки 7-13):**

```javascript
const calculateLevel = (points) => {
  if (points < 100) return 1;
  if (points < 250) return 2;
  if (points < 500) return 3;
  if (points < 1000) return 4;
  return 5;
};
```

**Таблица уровней:**
| Уровень | Баллы |
|---------|-------|
| 1 | 0-99 |
| 2 | 100-249 |
| 3 | 250-499 |
| 4 | 500-999 |
| 5 | 1000+ |

---

#### **3. Отображение:**

**Топ-3 (Подиум):**
- 🥇 **1 место** (Золото) — самый большой постамент, желтый цвет
- 🥈 **2 место** (Серебро) — средний постамент, серебряный цвет
- 🥉 **3 место** (Бронза) — маленький постамент, бронзовый цвет

**Места 4-10+ (Список):**
- Номер места (4, 5, 6...)
- Аватар с инициалами
- ФИО
- Группа
- Баллы
- Уровень (1-5)
- Тренд (↑+5, ↓-2, —0)

---

#### **4. Фильтрация (строки 93-105):**

**Поиск работает по:**
- ✅ ФИО студента (`.full_name`)
- ✅ Группе (`.student_data.group`)

**Сортировка:**
```javascript
// Строки 78-80
const sorted = [...mockLeaderboard].sort((a, b) => 
  (b.student_data?.points || 0) - (a.student_data?.points || 0)
);
```
Сортировка **по убыванию** количества баллов.

---

#### **5. Лимиты:**

- **По умолчанию:** Топ-10 (3 на подиуме + 7 в списке)
- **Кнопка "Показать еще":** Показывает всех студентов (строка 124)

---

## 🗄️ **Модель User - поля для рейтинга**

### Файл: `/server/src/models/User.js`

#### **Геймификация (строки 66-76):**

```javascript
// Вложенная структура (используется в студенческом интерфейсе)
student_data: {
  points: { type: Number, default: 0 },        // ← Баллы за активность
  level: { type: Number, default: 1 },         // ← Уровень (1-5)
  badges: [ObjectId],                          // ← Значки (модель не создана)
  streak_days: { type: Number, default: 0 }   // ← Серия дней подряд
},

// Дублированные поля на верхнем уровне (для админки)
points: { type: Number, default: 0 },
level: { type: Number, default: 0 },
badges: [ObjectId]
```

**Важно:** Есть **два набора полей**:
- `student_data.points` — используется в студенческом интерфейсе
- `points` — используется в админке

---

#### **Индексы для рейтинга (строки 120-121):**

```javascript
userSchema.index({ 'student_data.points': -1 }); // для рейтинга
userSchema.index({ points: -1 });                // для рейтинга (админка)
```

**Descending index (`-1`)** — для быстрой сортировки по убыванию.

---

#### **Дополнительные поля для Leaderboard:**

```javascript
full_name: String,        // ФИО студента
group: String,            // Название группы (из РУЗ)
group_id: Number,         // ID группы
faculty: String,          // Факультет
program: String,          // Программа
course: Number,           // Курс (1-5)
votes_count: Number,      // Количество голосований
```

---

## 🔍 **Что нужно для реализации API**

### **1. Endpoint:** `GET /api/users/leaderboard`

**Query параметры:**
```javascript
?limit=10           // Количество пользователей (по умолчанию 10)
&group=ПИ-401       // Фильтр по группе (опционально)
&faculty=ФИТиАБД    // Фильтр по факультету (опционально)
&program=DevOps     // Фильтр по программе (опционально)
&course=2           // Фильтр по курсу (опционально)
&period=month       // Период (week, month, semester, all)
```

---

### **2. Формат ответа:**

```javascript
{
  success: true,
  users: [
    {
      _id: "507f1f77bcf86cd799439011",
      full_name: "Иванов Иван Петрович",
      student_data: {
        group: "ПИ-401",
        points: 450,
        level: 4,
        streak_days: 7
      },
      trend: 0,          // Изменение позиции (опционально)
      position: 1        // Место в рейтинге
    },
    // ... остальные пользователи
  ],
  total: 100,           // Всего студентов в базе
  currentUser: {        // Позиция текущего пользователя
    _id: "507f1f77bcf86cd799439012",
    position: 25,
    points: 150
  }
}
```

---

### **3. Логика расчёта тренда:**

**Тренд** (изменение позиции) требует хранения исторических данных:

**Вариант 1: Простой (без истории)**
```javascript
trend: 0  // Всегда 0 для первой версии
```

**Вариант 2: С историей (требуется новая коллекция)**
```javascript
// Модель LeaderboardSnapshot
{
  date: Date,
  rankings: [
    { userId: ObjectId, position: Number, points: Number }
  ]
}

// Каждый день/неделю создаётся snapshot
// Тренд = position_last_week - position_now
```

---

### **4. Пример запроса к MongoDB:**

```javascript
const users = await User.find({
  role: 'student',
  is_active: true,
  'student_data.points': { $gt: 0 }  // Только с баллами > 0
})
  .select('full_name student_data.points student_data.level student_data.group')
  .sort({ 'student_data.points': -1 })  // По убыванию баллов
  .limit(limit)
  .lean();

// Добавляем позицию в рейтинге
const usersWithPosition = users.map((user, index) => ({
  ...user,
  position: index + 1,
  trend: 0  // Пока без тренда
}));
```

---

## 📊 **Сравнение: Frontend ожидает vs Backend должен вернуть**

| Поле | Frontend ожидает | Backend User модель | Совместимость |
|------|------------------|---------------------|---------------|
| `_id` | String | ObjectId | ✅ Mongoose автоматически преобразует |
| `full_name` | String | `full_name: String` | ✅ |
| `student_data.group` | String | `group: String` (верхний уровень) | ⚠️ Нужна трансформация |
| `student_data.points` | Number | `student_data.points: Number` | ✅ |
| `student_data.level` | Number | `student_data.level: Number` | ✅ (но не обновляется автоматически) |
| `trend` | Number | ❌ Нет в модели | ❌ Нужно вычислять или возвращать 0 |
| `position` | Number | ❌ Нет в модели | ❌ Вычисляется на лету |

---

## ⚠️ **Несоответствия в модели User**

### **Проблема:** `student_data.group` vs `group`

**В модели User:**
```javascript
group: String,        // Верхний уровень
student_data: {
  // group НЕТ внутри student_data!
}
```

**Frontend ожидает:**
```javascript
student_data: {
  group: "ПИ-401",   // ← Этого поля нет!
  points: 450
}
```

**Решение 1: Трансформация на backend**
```javascript
const user = {
  _id: doc._id,
  full_name: doc.full_name,
  student_data: {
    group: doc.group,        // ← Берём из верхнего уровня
    points: doc.student_data.points,
    level: doc.student_data.level
  }
};
```

**Решение 2: Исправить frontend**
```javascript
// Вместо:
user.student_data.group

// Использовать:
user.group
```

---

## 🎯 **План реализации API**

### **Шаг 1: Создать контроллер**

**Файл:** `/server/src/controllers/userController.js`

```javascript
exports.getLeaderboard = async (req, res) => {
  try {
    const { 
      limit = 10, 
      group, 
      faculty, 
      program, 
      course 
    } = req.query;

    // Построение фильтра
    const filter = {
      role: 'student',
      is_active: true,
      'student_data.points': { $gt: 0 }
    };

    if (group) filter.group = group;
    if (faculty) filter.faculty = faculty;
    if (program) filter.program = program;
    if (course) filter.course = parseInt(course);

    // Запрос
    const users = await User.find(filter)
      .select('full_name group student_data.points student_data.level')
      .sort({ 'student_data.points': -1 })
      .limit(parseInt(limit))
      .lean();

    // Трансформация
    const leaderboard = users.map((user, index) => ({
      _id: user._id,
      full_name: user.full_name,
      student_data: {
        group: user.group,  // ← Берём из верхнего уровня
        points: user.student_data?.points || 0,
        level: user.student_data?.level || 1
      },
      trend: 0,          // Пока без тренда
      position: index + 1
    }));

    // Позиция текущего пользователя
    let currentUser = null;
    if (req.user?.userId) {
      const allUsers = await User.find(filter)
        .select('_id student_data.points')
        .sort({ 'student_data.points': -1 })
        .lean();

      const userIndex = allUsers.findIndex(u => 
        u._id.toString() === req.user.userId.toString()
      );

      if (userIndex !== -1) {
        currentUser = {
          _id: allUsers[userIndex]._id,
          position: userIndex + 1,
          points: allUsers[userIndex].student_data?.points || 0
        };
      }
    }

    res.json({
      success: true,
      users: leaderboard,
      total: await User.countDocuments(filter),
      currentUser
    });

  } catch (error) {
    console.error('Ошибка в getLeaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения рейтинга'
    });
  }
};
```

---

### **Шаг 2: Создать роут**

**Файл:** `/server/src/routes/userRoutes.js`

```javascript
const { authenticate } = require('../middleware/auth');
const userController = require('../controllers/userController');

router.get('/leaderboard', authenticate, userController.getLeaderboard);
```

---

### **Шаг 3: Обновить frontend**

**Файл:** `/client/src/pages/Leaderboard.js` (строка 70)

```javascript
const loadLeaderboard = async () => {
  try {
    setLoading(true);
    setError('');

    // ✅ РЕАЛЬНЫЙ API запрос
    const response = await api.get('/users/leaderboard', {
      params: { limit: 100 }  // Загружаем больше для "Показать еще"
    });
    
    setLeaderboard(response.data.users);

  } catch (err) {
    console.error('Ошибка загрузки рейтинга:', err);
    setError('Не удалось загрузить рейтинг');
  } finally {
    setLoading(false);
  }
};
```

---

## 📝 **Дополнительные улучшения**

### **1. Фильтры по факультету/программе**

**Frontend:**
```javascript
const [filters, setFilters] = useState({
  faculty: '',
  program: '',
  course: ''
});

const loadLeaderboard = async () => {
  const response = await api.get('/users/leaderboard', {
    params: { 
      limit: 100,
      ...filters  // Добавляем фильтры
    }
  });
  // ...
};
```

**UI:**
```jsx
<select 
  value={filters.faculty} 
  onChange={(e) => setFilters({...filters, faculty: e.target.value})}
>
  <option value="">Все факультеты</option>
  <option value="ФИТиАБД">ФИТиАБД</option>
  {/* ... */}
</select>
```

---

### **2. Периоды (неделя, месяц, семестр)**

Требуется хранение исторических данных или timestamp на баллах.

**Вариант 1: Поле `points_earned_at`**
```javascript
// User модель
student_data: {
  points_history: [
    { points: Number, earned_at: Date, reason: String }
  ]
}

// API фильтрует по периоду
const startDate = period === 'week' 
  ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

const pointsInPeriod = user.student_data.points_history
  .filter(p => p.earned_at >= startDate)
  .reduce((sum, p) => sum + p.points, 0);
```

---

### **3. Тренд (изменение позиции)**

**Требуется:** Snapshot-модель для истории рейтинга

```javascript
// models/LeaderboardSnapshot.js
const snapshotSchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  rankings: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      position: Number,
      points: Number
    }
  ]
});

// Cron job (каждый день в 00:00)
const createSnapshot = async () => {
  const users = await User.find({ role: 'student' })
    .select('_id student_data.points')
    .sort({ 'student_data.points': -1 })
    .lean();

  const rankings = users.map((u, i) => ({
    userId: u._id,
    position: i + 1,
    points: u.student_data.points
  }));

  await LeaderboardSnapshot.create({
    date: new Date(),
    rankings
  });
};

// API вычисляет тренд
const lastWeekSnapshot = await LeaderboardSnapshot.findOne({
  date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
}).sort({ date: -1 });

user.trend = lastWeekPosition - currentPosition;  // +5 значит вырос на 5 мест
```

---

## ✅ **Чеклист реализации**

- [ ] Создать контроллер `userController.getLeaderboard()`
- [ ] Добавить роут `GET /api/users/leaderboard`
- [ ] Обновить frontend для использования реального API
- [ ] Исправить несоответствие `student_data.group` (трансформация)
- [ ] Добавить позицию текущего пользователя в ответе
- [ ] Добавить фильтры (факультет, программа, курс)
- [ ] Добавить периоды (неделя, месяц, all)
- [ ] Реализовать тренд (требуется snapshot модель)
- [ ] Добавить кэширование в Redis (10 минут)
- [ ] Протестировать с реальными данными

---

## 🎯 **Итог**

**Текущее состояние:**
- ❌ API не реализован
- ✅ Frontend полностью готов
- ✅ Модель User имеет все необходимые поля
- ✅ Индексы для производительности созданы
- ⚠️ Тренд требует дополнительной модели

**Минимальная реализация (1-2 часа):**
- Создать контроллер + роут
- Трансформировать данные под формат frontend
- Убрать mock данные

**Полная реализация (4-6 часов):**
- + Фильтры по группе/факультету
- + Периоды (неделя/месяц)
- + Snapshot модель для тренда
- + Cron job для snapshot
- + Кэширование в Redis
- + Тесты

---

Готово! Теперь ясна полная картина Leaderboard. 🎯
