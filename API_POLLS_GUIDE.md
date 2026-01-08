# API Endpoints для опросов StudVote

## Базовый URL

```
http://localhost:4000/api/polls
```

---

## Endpoints

### 1. Получить список опросов

**GET** `/api/polls`

**Доступ:** Публичный

**Query параметры:**
- `status` (опционально) - `active`, `completed`, `draft`
- `visibility` (опционально) - `public`, `group`, `faculty`
- `page` (опционально, default: 1) - номер страницы
- `limit` (опционально, default: 10) - количество на странице

**Пример запроса:**
```bash
GET /api/polls?status=active&page=1&limit=10
```

**Ответ успех (200):**
```json
{
  "success": true,
  "polls": [
    {
      "_id": "...",
      "title": "Выбор старосты группы",
      "description": "Голосование за старосту",
      "type": "single",
      "visibility": "public",
      "status": "active",
      "total_votes": 15,
      "options": [...],
      "start_date": "2025-12-10T00:00:00.000Z",
      "end_date": "2025-12-20T00:00:00.000Z",
      "creator_id": {
        "full_name": "Иванов Иван",
        "email": "ivanov@fa.ru",
        "role": "teacher"
      },
      "has_voted": false,
      "created_at": "..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

---

### 2. Получить детали опроса

**GET** `/api/polls/:id`

**Доступ:** Публичный

**Параметры URL:**
- `id` - ID опроса

**Пример запроса:**
```bash
GET /api/polls/675abc123def456789012345
```

**Ответ успех (200):**
```json
{
  "success": true,
  "poll": {
    "_id": "...",
    "title": "Выбор старосты группы",
    "description": "Голосование за старосту на следующий семестр",
    "type": "single",
    "visibility": "public",
    "status": "active",
    "options": [
      {
        "text": "Иванов Иван",
        "votes": 8,
        "percentage": 53.33,
        "order": 0
      },
      {
        "text": "Петрова Анна",
        "votes": 7,
        "percentage": 46.67,
        "order": 1
      }
    ],
    "total_votes": 15,
    "voted_users": ["...", "..."],
    "start_date": "2025-12-10T00:00:00.000Z",
    "end_date": "2025-12-20T00:00:00.000Z",
    "creator_id": {
      "full_name": "Сидоров Петр",
      "email": "sidorov@fa.ru",
      "role": "teacher",
      "department": "Кафедра информационных технологий"
    },
    "has_voted": true,
    "user_vote": {
      "_id": "...",
      "option_ids": [0],
      "points_earned": 10,
      "voted_at": "..."
    },
    "is_active": true,
    "participants_count": 15
  },
  "statistics": {
    "total_votes": 15,
    "option_votes": {
      "0": 8,
      "1": 7
    }
  }
}
```

**Ответ ошибка (404):**
```json
{
  "success": false,
  "message": "Опрос не найден"
}
```

---

### 3. Создать опрос

**POST** `/api/polls`

**Доступ:** Требует аутентификацию (JWT токен)

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "title": "Выбор старосты группы ПИ-401",
  "description": "Голосование за старосту на следующий семестр",
  "type": "single",
  "visibility": "group",
  "options": [
    { "text": "Иванов Иван" },
    { "text": "Петрова Анна" },
    { "text": "Сидоров Петр" }
  ],
  "start_date": "2025-12-13T00:00:00.000Z",
  "end_date": "2025-12-20T23:59:59.999Z"
}
```

**Поля:**
- `title` (обязательно, 5-200 символов) - название опроса
- `description` (опционально, до 2000 символов) - описание
- `type` (обязательно) - `single`, `multiple`, `rating`
- `visibility` (опционально, default: `public`) - `public`, `group`, `faculty`
- `options` (обязательно, 2-20 вариантов) - массив вариантов ответа
- `start_date` (обязательно) - дата начала
- `end_date` (обязательно) - дата окончания (должна быть > start_date)

**Ответ успех (201):**
```json
{
  "success": true,
  "message": "Опрос успешно создан",
  "poll": {
    "_id": "...",
    "title": "Выбор старосты группы ПИ-401",
    "creator_id": {
      "full_name": "Кузнецова Мария",
      "email": "kuznetsova@fa.ru",
      "role": "teacher"
    },
    "status": "active",
    ...
  }
}
```

**Ответ ошибка (400):**
```json
{
  "success": false,
  "message": "Заполните все обязательные поля"
}
```

**Ответ ошибка (401):**
```json
{
  "success": false,
  "message": "Требуется авторизация"
}
```

---

### 4. Получить мои опросы

**GET** `/api/polls/my/created`

**Доступ:** Требует аутентификацию

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Query параметры:**
- `page` (опционально, default: 1)
- `limit` (опционально, default: 10)

**Пример запроса:**
```bash
GET /api/polls/my/created?page=1&limit=10
```

**Ответ успех (200):**
```json
{
  "success": true,
  "polls": [
    {
      "_id": "...",
      "title": "Мой опрос",
      "status": "active",
      "total_votes": 10,
      ...
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "pages": 1
  }
}
```

---

### 5. Проголосовать

**POST** `/api/polls/votes`

**Доступ:** Требует аутентификацию

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "poll_id": "675abc123def456789012345",
  "option_ids": [0]
}
```

**Поля:**
- `poll_id` (обязательно) - ID опроса
- `option_ids` (обязательно) - массив индексов выбранных вариантов
  - Для `single` типа: только 1 вариант
  - Для `multiple` типа: 1 или больше вариантов

**Ответ успех (200):**
```json
{
  "success": true,
  "message": "Голос учтен",
  "vote": {
    "_id": "...",
    "user_id": "...",
    "poll_id": "...",
    "option_ids": [0],
    "points_earned": 10,
    "voted_at": "..."
  },
  "points_earned": 10,
  "poll": {
    "total_votes": 16,
    "options": [...]
  },
  "statistics": {
    "total_votes": 16,
    "option_votes": {
      "0": 9,
      "1": 7
    }
  }
}
```

**Ответ ошибка (400):**
```json
{
  "success": false,
  "message": "Вы уже проголосовали в этом опросе"
}
```

```json
{
  "success": false,
  "message": "Опрос неактивен или завершен"
}
```

```json
{
  "success": false,
  "message": "Для этого опроса можно выбрать только один вариант"
}
```

**Ответ ошибка (404):**
```json
{
  "success": false,
  "message": "Опрос не найден"
}
```

---

### 6. Получить мою историю голосований

**GET** `/api/polls/votes/my`

**Доступ:** Требует аутентификацию

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Query параметры:**
- `page` (опционально, default: 1)
- `limit` (опционально, default: 20)

**Пример запроса:**
```bash
GET /api/polls/votes/my?page=1&limit=20
```

**Ответ успех (200):**
```json
{
  "success": true,
  "votes": [
    {
      "_id": "...",
      "poll_id": {
        "_id": "...",
        "title": "Выбор старосты группы",
        "status": "active",
        "end_date": "2025-12-20T23:59:59.999Z"
      },
      "option_ids": [0],
      "points_earned": 10,
      "voted_at": "2025-12-13T14:30:00.000Z"
    }
  ],
  "statistics": {
    "total_votes": 15,
    "total_points_earned": 150
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "pages": 1
  }
}
```

---

## Коды ошибок

| Код | Описание |
|-----|----------|
| 200 | Успешный запрос |
| 201 | Ресурс создан |
| 400 | Неверные данные запроса |
| 401 | Требуется авторизация |
| 404 | Ресурс не найден |
| 500 | Внутренняя ошибка сервера |

---

## Примеры использования с axios

### Получить список активных опросов

```javascript
import api from './services/api';

const getActivePolls = async () => {
  try {
    const response = await api.get('/polls', {
      params: {
        status: 'active',
        page: 1,
        limit: 10
      }
    });
    
    console.log('Опросы:', response.data.polls);
    return response.data;
  } catch (error) {
    console.error('Ошибка:', error.response?.data?.message);
  }
};
```

### Создать опрос

```javascript
const createPoll = async (pollData) => {
  try {
    const response = await api.post('/polls', {
      title: 'Выбор старосты группы',
      description: 'Голосование за старосту',
      type: 'single',
      visibility: 'public',
      options: [
        { text: 'Иванов Иван' },
        { text: 'Петрова Анна' }
      ],
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 7*24*60*60*1000).toISOString()
    });
    
    console.log('Опрос создан:', response.data.poll);
    return response.data;
  } catch (error) {
    console.error('Ошибка:', error.response?.data?.message);
  }
};
```

### Проголосовать

```javascript
const vote = async (pollId, optionIds) => {
  try {
    const response = await api.post('/polls/votes', {
      poll_id: pollId,
      option_ids: optionIds
    });
    
    console.log('Голос учтен!');
    console.log('Заработано баллов:', response.data.points_earned);
    return response.data;
  } catch (error) {
    console.error('Ошибка:', error.response?.data?.message);
  }
};
```

### Получить детали опроса

```javascript
const getPollDetails = async (pollId) => {
  try {
    const response = await api.get(`/polls/${pollId}`);
    
    console.log('Опрос:', response.data.poll);
    console.log('Статистика:', response.data.statistics);
    return response.data;
  } catch (error) {
    console.error('Ошибка:', error.response?.data?.message);
  }
};
```

---

## Тестирование с curl

### Получить список опросов

```bash
curl http://localhost:4000/api/polls?status=active
```

### Создать опрос (требует токен)

```bash
curl -X POST http://localhost:4000/api/polls \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Тестовый опрос",
    "type": "single",
    "options": [
      {"text": "Вариант 1"},
      {"text": "Вариант 2"}
    ],
    "start_date": "2025-12-13T00:00:00.000Z",
    "end_date": "2025-12-20T23:59:59.999Z"
  }'
```

### Проголосовать (требует токен)

```bash
curl -X POST http://localhost:4000/api/polls/votes \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "poll_id": "675abc123def456789012345",
    "option_ids": [0]
  }'
```

---

## Готово!

Все API endpoints для работы с опросами созданы и готовы к использованию.

Читайте примеры выше для интеграции с frontend.






























