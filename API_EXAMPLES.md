# 🔌 StudVote API - Примеры использования

## 📋 Содержание

1. [Аутентификация](#аутентификация)
2. [Работа с опросами](#работа-с-опросами)
3. [Голосование](#голосование)
4. [Аналитика](#аналитика)
5. [Справочники](#справочники)
6. [Расписание](#расписание)

---

## 🔐 Аутентификация

### 1. Запрос кода подтверждения

**Endpoint**: `POST /api/auth/request-code`

**Request Body**:
```json
{
  "email": "123456@edu.fa.ru"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Код отправлен на email",
  "expiresIn": 300
}
```

**Примечания**:
- Код действителен 5 минут (300 секунд)
- Код сохраняется в Redis
- В dev режиме принимается любой 6-значный код

---

### 2. Проверка кода

**Endpoint**: `POST /api/auth/verify-code`

**Request Body**:
```json
{
  "email": "123456@edu.fa.ru",
  "code": "123456"
}
```

**Response A** - Существующий пользователь (200 OK):
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "email": "123456@edu.fa.ru",
    "full_name": "Иванов Иван Иванович",
    "role": "student",
    "faculty": "Факультет информационных технологий",
    "program": "Прикладная информатика",
    "course": 3,
    "group": "ИВТ23-1Б",
    "student_data": {
      "points": 150,
      "level": 2,
      "streak_days": 5
    }
  },
  "message": "Вход выполнен успешно"
}
```

**Response B** - Новый пользователь (200 OK):
```json
{
  "success": true,
  "needsRegistration": true,
  "role": "student",
  "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "studentId": "123456",
  "message": "Требуется регистрация"
}
```

---

### 3. Регистрация нового пользователя

**Endpoint**: `POST /api/auth/register`

**Request Body** (Студент):
```json
{
  "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "full_name": "Иванов Иван Иванович",
  "facultyId": "12345",
  "programId": "67890",
  "course": 3,
  "groupId": "54321"
}
```

**Request Body** (Преподаватель):
```json
{
  "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "full_name": "Петров Петр Петрович",
  "department": "Кафедра информационных технологий",
  "ruz_teacher_id": "12345",
  "ruz_teacher_name": "Петров П.П."
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "email": "123456@edu.fa.ru",
    "full_name": "Иванов Иван Иванович",
    "role": "student",
    "faculty": "Факультет информационных технологий",
    "program": "Прикладная информатика",
    "course": 3,
    "group": "ИВТ23-1Б"
  },
  "message": "Регистрация успешна"
}
```

---

### 4. Получить текущего пользователя

**Endpoint**: `GET /api/auth/me`

**Headers**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200 OK):
```json
{
  "success": true,
  "user": {
    "id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "email": "123456@edu.fa.ru",
    "full_name": "Иванов Иван Иванович",
    "role": "student",
    "faculty": "Факультет информационных технологий",
    "program": "Прикладная информатика",
    "course": 3,
    "group": "ИВТ23-1Б",
    "student_data": {
      "points": 150,
      "level": 2,
      "streak_days": 5
    }
  }
}
```

---

## 📊 Работа с опросами

### 1. Получить список доступных опросов

**Endpoint**: `GET /api/polls`

**Query Parameters**:
- `status` - фильтр по статусу ('active', 'completed', 'draft')
- `type` - фильтр по типу ('lesson_review', 'custom')
- `page` - номер страницы (default: 1)
- `limit` - количество на странице (default: 20)

**Headers**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200 OK):
```json
{
  "success": true,
  "polls": [
    {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "title": "Оценка занятия по Базам данных",
      "description": "Лекция: Нормализация баз данных",
      "pollType": "lesson_review",
      "lessonContext": {
        "subject": "Базы данных",
        "teacher": "Петров П.П.",
        "date": "2026-01-14T10:00:00.000Z",
        "time": "10:00-11:30",
        "topic": "Нормализация баз данных",
        "auditorium": "А-301",
        "lessonType": "Лекция",
        "group": "ИВТ23-1Б"
      },
      "questions": [
        {
          "id": "q1_relevance",
          "text": "Актуальность и полезность материала",
          "type": "rating",
          "weight": 0.25
        },
        {
          "id": "q2_clarity",
          "text": "Понятность и доступность изложения",
          "type": "rating",
          "weight": 0.30
        }
      ],
      "status": "active",
      "end_date": "2026-01-21T23:59:59.000Z",
      "total_votes": 15,
      "hasVoted": false
    }
  ],
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 20,
    "pages": 2
  }
}
```

---

### 2. Получить конкретный опрос

**Endpoint**: `GET /api/polls/:id`

**Headers**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200 OK):
```json
{
  "success": true,
  "poll": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "title": "Оценка занятия по Базам данных",
    "description": "Лекция: Нормализация баз данных",
    "pollType": "lesson_review",
    "lessonContext": {
      "lessonId": "12345",
      "subject": "Базы данных",
      "teacher": "Петров П.П.",
      "date": "2026-01-14T10:00:00.000Z",
      "time": "10:00-11:30",
      "topic": "Нормализация баз данных",
      "auditorium": "А-301",
      "lessonType": "Лекция",
      "group": "ИВТ23-1Б"
    },
    "questions": [
      {
        "id": "q1_relevance",
        "text": "Актуальность и полезность материала",
        "type": "rating",
        "required": true,
        "weight": 0.25,
        "block": "content",
        "scale": 5
      },
      {
        "id": "q2_clarity",
        "text": "Понятность и доступность изложения",
        "type": "rating",
        "required": true,
        "weight": 0.30,
        "block": "methodology",
        "scale": 5
      },
      {
        "id": "q3_practice",
        "text": "Практическая ценность материала",
        "type": "rating",
        "required": true,
        "weight": 0.20,
        "block": "content",
        "scale": 5
      },
      {
        "id": "q4_engagement",
        "text": "Вовлеченность студентов",
        "type": "rating",
        "required": true,
        "weight": 0.15,
        "block": "methodology",
        "scale": 5
      },
      {
        "id": "q5_organization",
        "text": "Организация занятия",
        "type": "rating",
        "required": true,
        "weight": 0.10,
        "block": "methodology",
        "scale": 5
      },
      {
        "id": "q6_comment",
        "text": "Дополнительные комментарии (необязательно)",
        "type": "text",
        "required": false,
        "maxLength": 500
      }
    ],
    "technicalIssues": {
      "enabled": true,
      "options": [
        "Проблемы с техникой",
        "Проблемы с аудиторией",
        "Другое"
      ]
    },
    "is_anonymous": true,
    "show_results": "after_end",
    "reward_points": 10,
    "status": "active",
    "end_date": "2026-01-21T23:59:59.000Z",
    "total_votes": 15,
    "hasVoted": false,
    "canVote": true
  }
}
```

---

### 3. Создать новый опрос (Lesson Review)

**Endpoint**: `POST /api/polls`

**Headers**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

**Request Body**:
```json
{
  "pollType": "lesson_review",
  "title": "Оценка занятия по Базам данных",
  "description": "Лекция: Нормализация баз данных",
  "lessonContext": {
    "lessonId": "12345",
    "lessonOid": "67890",
    "subject": "Базы данных",
    "teacher": "Петров П.П.",
    "date": "2026-01-14T10:00:00.000Z",
    "time": "10:00-11:30",
    "beginLesson": "10:00",
    "endLesson": "11:30",
    "topic": "Нормализация баз данных",
    "auditorium": "А-301",
    "lessonType": "Лекция",
    "group": "ИВТ23-1Б",
    "groupId": "54321"
  },
  "technicalIssues": {
    "enabled": true,
    "options": [
      "Проблемы с техникой",
      "Проблемы с аудиторией",
      "Другое"
    ]
  },
  "target_groups": ["54321"],
  "is_anonymous": true,
  "show_results": "after_end",
  "reward_points": 10,
  "end_date": "2026-01-21T23:59:59.000Z"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "poll": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "title": "Оценка занятия по Базам данных",
    "pollType": "lesson_review",
    "status": "active",
    "creator_id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "questions": [
      {
        "id": "q1_relevance",
        "text": "Актуальность и полезность материала",
        "type": "rating",
        "weight": 0.25
      }
    ]
  },
  "message": "Опрос успешно создан"
}
```

---

### 4. Создать кастомный опрос

**Endpoint**: `POST /api/polls`

**Request Body**:
```json
{
  "pollType": "custom",
  "title": "Удовлетворенность работой столовой",
  "description": "Помогите нам улучшить сервис",
  "questions": [
    {
      "id": "q1",
      "text": "Оцените качество блюд",
      "type": "rating",
      "required": true,
      "scale": 5
    },
    {
      "id": "q2",
      "text": "Устраивает ли вас время работы?",
      "type": "yes_no",
      "required": true
    },
    {
      "id": "q3",
      "text": "Какие улучшения вы хотели бы видеть?",
      "type": "choice",
      "required": true,
      "options": [
        "Больше разнообразия",
        "Увеличение порций",
        "Снижение цен",
        "Улучшение качества"
      ]
    },
    {
      "id": "q4",
      "text": "Дополнительные комментарии",
      "type": "text",
      "required": false,
      "maxLength": 500
    }
  ],
  "target_faculties": ["fit"],
  "visibility": "faculty",
  "is_anonymous": true,
  "show_results": "after_vote",
  "reward_points": 5,
  "end_date": "2026-02-01T23:59:59.000Z"
}
```

---

## 🗳️ Голосование

### 1. Проголосовать в опросе (Lesson Review)

**Endpoint**: `POST /api/polls/:id/vote`

**Headers**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Body**:
```json
{
  "answers": {
    "q1_relevance": 5,
    "q2_clarity": 4,
    "q3_practice": 5,
    "q4_engagement": 3,
    "q5_organization": 4,
    "q6_comment": "Отличная лекция! Все было понятно и интересно."
  },
  "technical_issues": {
    "has_issues": true,
    "selected": ["Проблемы с техникой"],
    "description": "Проектор не работал первые 10 минут"
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Голос успешно учтен",
  "ikop": 82,
  "zone": {
    "zone": "Отлично",
    "color": "#58D9F9",
    "description": "Высокое качество образовательного процесса"
  },
  "points_earned": 10,
  "new_level": 2
}
```

**Расчет ИКОП**:
```
Нормализация:
q1: (5-1)/4 = 1.0
q2: (4-1)/4 = 0.75
q3: (5-1)/4 = 1.0
q4: (3-1)/4 = 0.5
q5: (4-1)/4 = 0.75

ИКОП = (1.0 × 0.25) + (0.75 × 0.30) + (1.0 × 0.20) + (0.5 × 0.15) + (0.75 × 0.10) × 100
     = 0.825 × 100 = 82.5 ≈ 82
```

---

### 2. Проголосовать в кастомном опросе

**Request Body**:
```json
{
  "answers": {
    "q1": 4,
    "q2": true,
    "q3": ["Больше разнообразия", "Снижение цен"],
    "q4": "Хотелось бы больше вегетарианских блюд"
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Голос успешно учтен",
  "points_earned": 5,
  "new_total_points": 155
}
```

---

## 📈 Аналитика

### 1. Результаты опроса

**Endpoint**: `GET /api/polls/:id/results`

**Headers**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200 OK):
```json
{
  "success": true,
  "poll": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "title": "Оценка занятия по Базам данных"
  },
  "analytics": {
    "total_responses": 45,
    "average_ikop": 78,
    "ikop_zone": {
      "zone": "Хорошо",
      "color": "#7CFFB2"
    },
    "by_question": {
      "q1_relevance": {
        "average": 4.2,
        "distribution": {
          "1": 0,
          "2": 2,
          "3": 5,
          "4": 15,
          "5": 23
        }
      },
      "q2_clarity": {
        "average": 3.8,
        "distribution": {
          "1": 1,
          "2": 3,
          "3": 8,
          "4": 20,
          "5": 13
        }
      }
    },
    "by_faculty": {
      "Факультет информационных технологий": {
        "count": 30,
        "average_ikop": 80
      },
      "Факультет экономики": {
        "count": 15,
        "average_ikop": 74
      }
    },
    "technical_issues": {
      "total": 5,
      "percentage": 11.1,
      "breakdown": {
        "Проблемы с техникой": 3,
        "Проблемы с аудиторией": 2
      }
    },
    "comments": [
      {
        "text": "Отличная лекция! Все было понятно.",
        "submitted_at": "2026-01-14T12:00:00.000Z"
      },
      {
        "text": "Хотелось бы больше практических примеров.",
        "submitted_at": "2026-01-14T12:15:00.000Z"
      }
    ]
  }
}
```

---

### 2. Дашборд качества (админ)

**Endpoint**: `GET /api/admin/quality/dashboard`

**Query Parameters**:
- `period` - период ('week', 'month', 'semester')
- `faculty` - фильтр по факультету
- `course` - фильтр по курсу
- `group` - фильтр по группе
- `subject` - фильтр по дисциплине
- `teacher` - фильтр по преподавателю

**Headers**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200 OK):
```json
{
  "success": true,
  "statistics": {
    "summary": {
      "totalPolls": 125,
      "totalResponses": 3450,
      "coverage": 78,
      "avgIkop": 75
    },
    "ikop": {
      "overall": 75,
      "byQuestion": {
        "q1_relevance": 78,
        "q2_clarity": 76,
        "q3_practice": 73,
        "q4_engagement": 72,
        "q5_organization": 75
      }
    },
    "problemAreas": [
      {
        "type": "subject",
        "name": "Высшая математика",
        "group": "ЭКН23-1Б",
        "ikop": 45,
        "issue": "Понятность 2.3/5"
      },
      {
        "type": "subject",
        "name": "Теория вероятностей",
        "group": "ФИН23-2Б",
        "ikop": 52,
        "issue": "Вовлеченность 2.8/5"
      }
    ],
    "topSubjects": [
      {
        "name": "Базы данных",
        "ikop": 88,
        "count": 45
      },
      {
        "name": "Веб-программирование",
        "ikop": 85,
        "count": 38
      },
      {
        "name": "Алгоритмы и структуры данных",
        "ikop": 83,
        "count": 42
      }
    ],
    "topTeachers": [
      {
        "name": "Петров П.П.",
        "ikop": 89,
        "subjects": 3,
        "count": 67
      },
      {
        "name": "Сидорова С.С.",
        "ikop": 86,
        "subjects": 2,
        "count": 54
      },
      {
        "name": "Иванов И.И.",
        "ikop": 84,
        "subjects": 4,
        "count": 78
      }
    ],
    "dynamics": [
      {
        "period": "Янв 2026",
        "ikop": 75
      },
      {
        "period": "Дек 2025",
        "ikop": 73
      },
      {
        "period": "Ноя 2025",
        "ikop": 76
      }
    ]
  }
}
```

---

## 📚 Справочники

### 1. Получить академическую структуру

**Endpoint**: `GET /api/directory/structure`

**Response** (200 OK):
```json
{
  "success": true,
  "structure": [
    {
      "id": "12345",
      "name": "Факультет информационных технологий",
      "programs": [
        {
          "id": "67890",
          "name": "Прикладная информатика",
          "courses": [
            {
              "number": 1,
              "groups": [
                {
                  "id": 54321,
                  "name": "ИВТ25-1Б",
                  "fullName": "ИВТ25-1Б"
                },
                {
                  "id": 54322,
                  "name": "ИВТ25-2Б",
                  "fullName": "ИВТ25-2Б"
                }
              ]
            },
            {
              "number": 2,
              "groups": [
                {
                  "id": 54323,
                  "name": "ИВТ24-1Б",
                  "fullName": "ИВТ24-1Б"
                }
              ]
            }
          ]
        },
        {
          "id": "67891",
          "name": "Информационная безопасность",
          "courses": []
        }
      ]
    }
  ]
}
```

---

### 2. Поиск преподавателей

**Endpoint**: `GET /api/directory/teachers/search?term=Петров`

**Response** (200 OK):
```json
{
  "success": true,
  "teachers": [
    {
      "id": "12345",
      "fio": "Петров Петр Петрович",
      "department": "Кафедра информационных технологий",
      "chair": "Информационные технологии",
      "email": "petrov@fa.ru"
    },
    {
      "id": "12346",
      "fio": "Петрова Анна Ивановна",
      "department": "Кафедра математики",
      "chair": "Высшая математика",
      "email": "petrova@fa.ru"
    }
  ]
}
```

---

## 🗓️ Расписание

### 1. Получить расписание группы

**Endpoint**: `GET /api/schedule/group/:groupId?date=2026-01-14`

**Query Parameters**:
- `date` - дата в формате YYYY-MM-DD
- `start` - начальная дата (опционально)
- `end` - конечная дата (опционально)

**Response** (200 OK):
```json
{
  "success": true,
  "schedule": [
    {
      "lessonOid": "12345",
      "date": "2026-01-14",
      "beginLesson": "10:00",
      "endLesson": "11:30",
      "discipline": "Базы данных",
      "kindOfWork": "Лекция",
      "lecturer": "Петров П.П.",
      "lecturerOid": "67890",
      "auditorium": "А-301",
      "building": "Главный корпус",
      "url1": "Ссылка на пару"
    },
    {
      "lessonOid": "12346",
      "date": "2026-01-14",
      "beginLesson": "12:00",
      "endLesson": "13:30",
      "discipline": "Веб-программирование",
      "kindOfWork": "Практика",
      "lecturer": "Сидорова С.С.",
      "lecturerOid": "67891",
      "auditorium": "Б-205",
      "building": "Главный корпус",
      "url1": null
    }
  ],
  "groupName": "ИВТ23-1Б"
}
```

---

## 🛡️ Обработка ошибок

### Стандартный формат ошибки

**Response** (400/401/403/404/500):
```json
{
  "success": false,
  "message": "Описание ошибки",
  "error": "Детали ошибки (только в dev режиме)"
}
```

### Примеры ошибок

#### 401 Unauthorized
```json
{
  "success": false,
  "message": "Токен не предоставлен"
}
```

#### 403 Forbidden
```json
{
  "success": false,
  "message": "Доступ запрещен"
}
```

#### 404 Not Found
```json
{
  "success": false,
  "message": "Опрос не найден"
}
```

#### 400 Bad Request
```json
{
  "success": false,
  "message": "Вы уже проголосовали в этом опросе"
}
```

---

## 📦 cURL примеры

### Вход в систему (полный цикл)

```bash
# 1. Запрос кода
curl -X POST http://localhost:5000/api/auth/request-code \
  -H "Content-Type: application/json" \
  -d '{"email":"123456@edu.fa.ru"}'

# 2. Проверка кода
curl -X POST http://localhost:5000/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{"email":"123456@edu.fa.ru","code":"123456"}'

# 3. Получить текущего пользователя
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Голосование

```bash
curl -X POST http://localhost:5000/api/polls/65a1b2c3d4e5f6g7h8i9j0k1/vote \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "answers": {
      "q1_relevance": 5,
      "q2_clarity": 4,
      "q3_practice": 5,
      "q4_engagement": 4,
      "q5_organization": 5,
      "q6_comment": "Отличная лекция!"
    }
  }'
```

---

## 🌐 WebSocket события

### Подключение

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});
```

### События от сервера

#### new_poll
```javascript
socket.on('new_poll', (data) => {
  console.log('Новый опрос доступен:', data);
  /*
  {
    pollId: "65a1b2c3d4e5f6g7h8i9j0k1",
    title: "Оценка занятия по Базам данных",
    end_date: "2026-01-21T23:59:59.000Z"
  }
  */
});
```

#### poll_closed
```javascript
socket.on('poll_closed', (data) => {
  console.log('Опрос завершен:', data);
  /*
  {
    pollId: "65a1b2c3d4e5f6g7h8i9j0k1",
    total_votes: 45
  }
  */
});
```

#### results_available
```javascript
socket.on('results_available', (data) => {
  console.log('Результаты опубликованы:', data);
  /*
  {
    pollId: "65a1b2c3d4e5f6g7h8i9j0k1",
    average_ikop: 78
  }
  */
});
```

---

**Конец примеров API**
