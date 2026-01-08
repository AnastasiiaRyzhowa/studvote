# Dashboard обновлен для работы с реальными данными

## Что изменено

Файл `client/src/pages/DashboardMain.js` обновлен для использования реальных данных из API вместо mock данных.

---

## Ключевые изменения

### 1. Удалены mock данные

**Было:**
```javascript
const MOCK_POLLS = [...]; // 84 строки захардкоженных данных
```

**Стало:**
```javascript
import { getPolls } from '../services/pollService';
```

---

### 2. Добавлены новые состояния

```javascript
const [polls, setPolls] = useState([]);           // Массив опросов
const [loading, setLoading] = useState(true);     // Состояние загрузки
const [error, setError] = useState(null);         // Ошибки
const [activeTab, setActiveTab] = useState(0);    // Активный фильтр
```

---

### 3. Добавлена функция адаптации данных

API возвращает данные в одном формате, а PollCard ожидает другой. Функция `adaptPollData` преобразует данные:

```javascript
// API возвращает:
{
  _id: "...",
  has_voted: true,
  end_date: "...",
  creator_id: { full_name: "..." }
}

// PollCard ожидает:
{
  id: "...",
  hasVoted: true,
  deadline: "...",
  author: "..."
}
```

**adaptPollData** делает эту трансформацию автоматически.

---

### 4. Добавлен useEffect для загрузки данных

```javascript
useEffect(() => {
  loadPolls();
}, [activeTab]); // Перезагружает при смене фильтра
```

---

### 5. Реализована функция loadPolls

```javascript
const loadPolls = async () => {
  try {
    setLoading(true);
    setError(null);

    // Фильтры в зависимости от активной вкладки
    const filters = {};
    switch (activeTab) {
      case 1: filters.status = 'active'; break;
      case 2: filters.status = 'completed'; break;
      case 3: /* Мои голоса - фильтр на клиенте */ break;
    }

    // Запрос к API
    const data = await getPolls(filters);
    
    // Фильтрация "Мои голоса" на клиенте
    let filteredPolls = data.polls || [];
    if (activeTab === 3) {
      filteredPolls = filteredPolls.filter(poll => poll.has_voted);
    }

    // Адаптация данных
    const adaptedPolls = filteredPolls.map(adaptPollData);
    setPolls(adaptedPolls);
  } catch (err) {
    setError(err.response?.data?.message || 'Не удалось загрузить опросы');
  } finally {
    setLoading(false);
  }
};
```

---

### 6. Добавлены UI состояния

#### Loading State
```javascript
{loading && (
  <Box>
    <CircularProgress />
    <Typography>Загрузка опросов...</Typography>
  </Box>
)}
```

#### Error State
```javascript
{error && (
  <Alert severity="error" onClose={() => setError(null)}>
    {error}
  </Alert>
)}
```

#### Empty State
```javascript
{polls.length === 0 && (
  <Box>
    <Typography>Опросов не найдено</Typography>
    <Typography>
      {activeTab === 3 
        ? 'Вы еще не участвовали в голосованиях'
        : 'Попробуйте изменить фильтр или создайте новый опрос'}
    </Typography>
  </Box>
)}
```

---

## Логика фильтрации

### Вкладка "Все" (activeTab = 0)
- Запрос: `getPolls({})`
- Возвращает все опросы без фильтров

### Вкладка "Активные" (activeTab = 1)
- Запрос: `getPolls({ status: 'active' })`
- Возвращает только активные опросы

### Вкладка "Завершенные" (activeTab = 2)
- Запрос: `getPolls({ status: 'completed' })`
- Возвращает только завершенные опросы

### Вкладка "Мои голоса" (activeTab = 3)
- Запрос: `getPolls({})`
- Фильтрация на клиенте: `poll.has_voted === true`
- Показывает опросы где пользователь уже голосовал

---

## Поток данных

```
1. Пользователь открывает Dashboard
   ↓
2. useEffect → loadPolls()
   ↓
3. getPolls(filters) → API запрос
   ↓
4. Получены данные из MongoDB
   ↓
5. adaptPollData() → преобразование формата
   ↓
6. setPolls() → обновление состояния
   ↓
7. Рендер PollCard компонентов
```

---

## Что сохранено

Весь существующий дизайн и UI остался без изменений:
- Tabs фильтры
- Grid layout (3 колонки)
- PollCard компонент
- Плавающая кнопка "+"
- Стили и анимации

---

## Обработка ошибок

### Сетевые ошибки
```javascript
catch (err) {
  setError('Не удалось загрузить опросы');
}
```

### 401 (Не авторизован)
Автоматически обрабатывается в `api.js` interceptor

### 404 (Не найдено)
Показывается как пустое состояние

### 500 (Ошибка сервера)
Показывается Alert с сообщением об ошибке

---

## Тестирование

### 1. Пустая база данных
```
Результат: "Опросов не найдено"
```

### 2. Есть активные опросы
```
Результат: Список опросов в карточках
```

### 3. Смена фильтров
```
Результат: Автоматическая перезагрузка с новыми данными
```

### 4. Ошибка сети
```
Результат: Alert с сообщением об ошибке
```

---

## Следующие шаги

После этого обновления Dashboard полностью работает с реальными данными из MongoDB.

Теперь можно:
1. Создавать реальные опросы через API
2. Видеть их в Dashboard
3. Фильтровать по статусу
4. Переходить к голосованию

---

## Проверка работы

1. Запустите backend: `cd server && npm run dev`
2. Запустите frontend: `cd client && npm start`
3. Войдите в систему
4. Откройте Dashboard

**Если опросов нет:**
- Увидите "Опросов не найдено"
- Это нормально для пустой БД

**Если есть опросы:**
- Увидите карточки с реальными данными
- Фильтры работают
- Статистика обновляется

---

## Структура адаптированных данных

```javascript
{
  id: "675abc...",                    // _id из MongoDB
  title: "Выбор старосты",            // без изменений
  description: "...",                  // без изменений
  author: "Иванов Иван Иванович",     // creator_id.full_name
  status: "active",                    // без изменений
  deadline: "2025-12-20T...",         // end_date
  votedCount: 15,                     // total_votes
  totalStudents: 25,                  // оценка (max из votes, users, 25)
  hasVoted: true                      // has_voted
}
```

---

## Готово!

Dashboard полностью интегрирован с API и готов к использованию с реальными данными.

Все mock данные удалены, теперь приложение работает с MongoDB через pollService.






























