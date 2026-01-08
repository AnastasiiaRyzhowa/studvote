# Модели Poll и Vote - Руководство

## Структура

```
server/src/models/
├── User.js      (уже был)
├── Poll.js      (новый)
└── Vote.js      (новый)
```

---

## Модель Poll

### Описание
Модель для хранения опросов и голосований.

### Поля

```javascript
{
  creator_id: ObjectId,           // Создатель опроса
  title: String(5-200),           // Название
  description: String(до 2000),   // Описание (опционально)
  type: Enum,                     // 'single', 'multiple', 'rating'
  visibility: Enum,               // 'public', 'group', 'faculty'
  options: [{                     // Варианты ответа (2-20 штук)
    text: String,
    votes: Number,
    percentage: Number,
    order: Number
  }],
  total_votes: Number,            // Общее количество голосов
  voted_users: [ObjectId],        // Список проголосовавших
  qr_code: String,                // QR код для голосования
  start_date: Date,               // Дата начала
  end_date: Date,                 // Дата окончания
  status: Enum,                   // 'draft', 'active', 'completed'
  created_at: Date,
  updated_at: Date
}
```

### Индексы

```javascript
// Составные индексы
{ status: 1, start_date: 1, end_date: 1 }  // Поиск активных опросов
{ creator_id: 1, created_at: -1 }          // Опросы пользователя

// Одиночные индексы
creator_id
visibility
status
```

### Виртуальные поля

```javascript
participants_count  // Количество участников
is_ended           // Завершен ли опрос
```

### Методы экземпляра

#### isActive()
Проверяет, активен ли опрос сейчас.

```javascript
const poll = await Poll.findById(pollId);
if (poll.isActive()) {
  console.log('Опрос активен, можно голосовать');
}
```

#### canVote(userId)
Проверяет, может ли пользователь голосовать.

```javascript
const canVote = poll.canVote(userId);
if (canVote) {
  // Разрешить голосование
} else {
  // Уже голосовал или опрос неактивен
}
```

#### calculateResults()
Пересчитывает проценты для всех вариантов.

```javascript
await poll.calculateResults();
// poll.options[0].percentage теперь обновлен
```

#### updateStatus()
Обновляет статус на основе текущей даты.

```javascript
await poll.updateStatus();
// Автоматически меняет draft → active → completed
```

#### addVote(userId, optionIndices)
Добавляет голос пользователя.

```javascript
try {
  await poll.addVote(userId, [0, 2]); // Варианты 0 и 2
  console.log('Голос добавлен');
} catch (error) {
  console.error('Ошибка голосования:', error.message);
}
```

### Примеры использования

#### Создание опроса

```javascript
const Poll = require('./models/Poll');

const poll = new Poll({
  creator_id: req.user._id,
  title: 'Выбор старосты группы',
  description: 'Голосование за старосту на следующий семестр',
  type: 'single',
  visibility: 'group',
  options: [
    { text: 'Иванов Иван', votes: 0, percentage: 0, order: 0 },
    { text: 'Петрова Анна', votes: 0, percentage: 0, order: 1 },
    { text: 'Сидоров Петр', votes: 0, percentage: 0, order: 2 }
  ],
  start_date: new Date(),
  end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Через 7 дней
  status: 'active'
});

await poll.save();
```

#### Получение активных опросов

```javascript
const activePolls = await Poll.find({
  status: 'active',
  start_date: { $lte: new Date() },
  end_date: { $gte: new Date() }
})
.populate('creator_id', 'full_name email')
.sort({ created_at: -1 });
```

#### Голосование

```javascript
const poll = await Poll.findById(pollId);

// Проверка возможности голосования
if (!poll.canVote(userId)) {
  return res.status(400).json({ error: 'Голосование невозможно' });
}

// Добавление голоса
await poll.addVote(userId, [1]); // Выбран вариант 1

// Сохранение в БД
await poll.save();
```

---

## Модель Vote

### Описание
Модель для хранения голосов пользователей.

### Поля

```javascript
{
  user_id: ObjectId,      // Пользователь
  poll_id: ObjectId,      // Опрос
  option_ids: [Number],   // Индексы выбранных вариантов
  points_earned: Number,  // Заработанные баллы
  voted_at: Date,         // Дата голосования
  createdAt: Date,
  updatedAt: Date
}
```

### Индексы

```javascript
// УНИКАЛЬНЫЙ составной индекс - один голос на опрос!
{ user_id: 1, poll_id: 1 }  // unique: true

// Дополнительные индексы
{ poll_id: 1, voted_at: -1 }  // Голоса в опросе
{ user_id: 1, voted_at: -1 }  // История пользователя
```

### Статические методы

#### hasUserVoted(userId, pollId)
Проверяет, голосовал ли пользователь.

```javascript
const hasVoted = await Vote.hasUserVoted(userId, pollId);
if (hasVoted) {
  return res.status(400).json({ error: 'Вы уже голосовали' });
}
```

#### getUserVote(userId, pollId)
Получает голос пользователя в опросе.

```javascript
const vote = await Vote.getUserVote(userId, pollId);
if (vote) {
  console.log('Пользователь выбрал:', vote.option_ids);
}
```

#### countVotesInPoll(pollId)
Подсчитывает голоса в опросе.

```javascript
const count = await Vote.countVotesInPoll(pollId);
console.log(`Всего голосов: ${count}`);
```

#### getPollStatistics(pollId)
Получает статистику по опросу.

```javascript
const stats = await Vote.getPollStatistics(pollId);
console.log('Всего голосов:', stats.total_votes);
console.log('По вариантам:', stats.option_votes);
// { 0: 15, 1: 8, 2: 3 } - вариант 0 получил 15 голосов и т.д.
```

#### getUserVotes(userId, options)
Получает все голоса пользователя.

```javascript
const votes = await Vote.getUserVotes(userId, {
  limit: 20,
  skip: 0,
  sort: { voted_at: -1 }
});
```

### Методы экземпляра

#### isValid()
Проверяет валидность голоса.

```javascript
if (!vote.isValid()) {
  throw new Error('Невалидный голос');
}
```

### Middleware

#### Pre-save валидация
Запрещает повторное голосование.

```javascript
// Автоматически срабатывает при vote.save()
// Выбрасывает ошибку если пользователь уже голосовал
```

#### Post-save начисление баллов
Автоматически начисляет баллы пользователю.

```javascript
// После сохранения голоса
// Автоматически добавляет points_earned к student_data.points
```

#### Pre-update защита
Запрещает изменение голоса после создания.

```javascript
// Vote является immutable (неизменяемым)
// Нельзя изменить после создания
```

### Примеры использования

#### Создание голоса

```javascript
const Vote = require('./models/Vote');

const vote = new Vote({
  user_id: req.user._id,
  poll_id: pollId,
  option_ids: [1], // Выбран вариант 1
  points_earned: 5 // За участие
});

try {
  await vote.save();
  console.log('Голос сохранен');
} catch (error) {
  if (error.code === 'DUPLICATE_VOTE') {
    console.error('Вы уже голосовали!');
  }
}
```

#### Проверка перед голосованием

```javascript
// Метод 1: Через статический метод
const hasVoted = await Vote.hasUserVoted(userId, pollId);
if (hasVoted) {
  return res.status(400).json({ error: 'Уже голосовали' });
}

// Метод 2: Через метод Poll
const poll = await Poll.findById(pollId);
if (!poll.canVote(userId)) {
  return res.status(400).json({ error: 'Голосование невозможно' });
}
```

#### Получение статистики

```javascript
const stats = await Vote.getPollStatistics(pollId);

res.json({
  total_votes: stats.total_votes,
  results: poll.options.map((option, index) => ({
    text: option.text,
    votes: stats.option_votes[index] || 0,
    percentage: option.percentage
  }))
});
```

---

## Workflow голосования

### Полный процесс

```javascript
// 1. Пользователь запрашивает опрос
const poll = await Poll.findById(pollId)
  .populate('creator_id', 'full_name');

// 2. Проверяем, активен ли опрос
if (!poll.isActive()) {
  return res.status(400).json({ error: 'Опрос неактивен' });
}

// 3. Проверяем, не голосовал ли уже
if (!poll.canVote(userId)) {
  return res.status(400).json({ error: 'Вы уже голосовали' });
}

// 4. Валидируем выбранные варианты
const { option_ids } = req.body;

if (poll.type === 'single' && option_ids.length > 1) {
  return res.status(400).json({ 
    error: 'Можно выбрать только один вариант' 
  });
}

// 5. Создаем голос
const vote = new Vote({
  user_id: userId,
  poll_id: pollId,
  option_ids: option_ids,
  points_earned: 5 // Баллы за участие
});

await vote.save();

// 6. Обновляем опрос
await poll.addVote(userId, option_ids);

// 7. Возвращаем результаты
const stats = await Vote.getPollStatistics(pollId);

res.json({
  success: true,
  message: 'Голос учтен',
  poll: poll,
  statistics: stats,
  points_earned: vote.points_earned
});
```

---

## Валидации

### Poll

- title: 5-200 символов
- options: 2-20 вариантов
- end_date должна быть > start_date
- type: только 'single', 'multiple', 'rating'
- visibility: только 'public', 'group', 'faculty'
- status: только 'draft', 'active', 'completed'

### Vote

- option_ids: минимум 1, максимум 20
- Уникальность (user_id, poll_id)
- Нельзя изменить после создания
- points_earned >= 0

---

## Связи между моделями

```
User (1) ----создает----> (N) Poll
User (1) ----голосует---> (N) Vote
Poll (1) ----имеет------> (N) Vote

Poll.creator_id → User._id
Poll.voted_users[] → User._id
Vote.user_id → User._id
Vote.poll_id → Poll._id
```

---

## Индексы и производительность

### Оптимизированные запросы

```javascript
// Быстро: использует составной индекс
Poll.find({ 
  status: 'active', 
  start_date: { $lte: now }, 
  end_date: { $gte: now } 
});

// Быстро: использует индекс creator_id
Poll.find({ creator_id: userId }).sort({ created_at: -1 });

// Быстро: уникальный индекс
Vote.findOne({ user_id: userId, poll_id: pollId });

// Быстро: индекс poll_id
Vote.find({ poll_id: pollId }).sort({ voted_at: -1 });
```

---

## Безопасность

### Vote - Immutable (неизменяемый)

После создания голос **нельзя изменить**:

```javascript
// Это вызовет ошибку
await Vote.findByIdAndUpdate(voteId, { option_ids: [2] });
// Error: Изменение голоса после создания запрещено

// Это тоже вызовет ошибку
const vote = await Vote.findById(voteId);
vote.option_ids = [2];
await vote.save();
// Error: Пользователь уже проголосовал в этом опросе
```

### Уникальность голосов

Один пользователь = один голос в опросе:

```javascript
// Первый голос - OK
const vote1 = new Vote({ user_id: userId, poll_id: pollId, option_ids: [0] });
await vote1.save(); // Успешно

// Второй голос - ERROR
const vote2 = new Vote({ user_id: userId, poll_id: pollId, option_ids: [1] });
await vote2.save(); // Error: Пользователь уже проголосовал
```

---

## Автоматические действия

### При сохранении голоса:

1. Проверка уникальности (user_id + poll_id)
2. Начисление баллов пользователю (student_data.points)
3. Обновление Poll.voted_users
4. Обновление Poll.options.votes
5. Пересчет Poll.options.percentage

### При изменении Poll:

1. Автоматическое обновление статуса по датам
2. Валидация end_date > start_date
3. Пересчет процентов при изменении голосов

---

## Готово!

Обе модели созданы и полностью функциональны.

Используйте примеры выше для интеграции в контроллеры.






























