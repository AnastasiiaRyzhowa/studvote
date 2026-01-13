# StudVote - Техническая документация

## Содержание
1. [Архитектура системы](#архитектура-системы)
2. [Backend](#backend)
3. [Frontend](#frontend)
4. [База данных](#база-данных)
5. [Интеграции](#интеграции)
6. [Безопасность](#безопасность)
7. [Развёртывание](#развёртывание)
8. [API Reference](#api-reference)

---

## Архитектура системы

### Общая схема

```
┌─────────────┐
│   Browser   │
│  (React)    │
└──────┬──────┘
       │ HTTP/WebSocket
       ↓
┌─────────────────────┐
│  Express.js Server  │
│  (Node.js)          │
├─────────────────────┤
│  • Routes           │
│  • Controllers      │
│  • Services         │
│  • Middleware       │
└──────┬──────────────┘
       │
       ├───→ MongoDB (основная БД)
       ├───→ Redis (кэш, сессии)
       ├───→ RUZ API (расписание)
       └───→ Email Service (уведомления)
```

### Технологический стек

**Backend:**
- Node.js v18+
- Express.js 4.18+
- MongoDB 6.0+ (Mongoose ODM)
- Redis 7.0+ (для кэша)
- JWT (аутентификация)
- Nodemailer (email)
- Axios (HTTP-клиент)

**Frontend:**
- React 18+
- React Router DOM 6+
- Material-UI (MUI) 5+
- ECharts 5+ (графики)
- echarts-wordcloud (облако слов)
- Axios (API-клиент)
- date-fns (работа с датами)

**Инструменты разработки:**
- npm (пакетный менеджер)
- nodemon (hot-reload для backend)
- ESLint (линтер)
- Prettier (форматирование)

---

## Backend

### Структура директорий

```
server/
├── src/
│   ├── config/           # Конфигурация
│   │   ├── database.js   # Подключение к MongoDB
│   │   ├── redis.js      # Подключение к Redis
│   │   ├── constants.js  # Константы системы
│   │   └── structure.js  # Структура факультетов/программ
│   ├── controllers/      # Обработчики запросов
│   │   ├── authController.js
│   │   ├── pollController.js
│   │   ├── scheduleController.js
│   │   └── directoryController.js
│   ├── models/           # Mongoose модели
│   │   ├── User.js
│   │   ├── Poll.js
│   │   ├── Vote.js
│   │   └── GroupReliabilityEvent.js
│   ├── routes/           # Express роуты
│   │   ├── authRoutes.js
│   │   ├── pollRoutes.js
│   │   ├── analyticsRoutes.js
│   │   ├── userRoutes.js
│   │   ├── scheduleRoutes.js
│   │   └── directoryRoutes.js
│   ├── services/         # Бизнес-логика
│   │   ├── analyticsService.js
│   │   ├── voteAnalyticsService.js
│   │   ├── ruzService.js
│   │   ├── emailService.js
│   │   └── academicStructureService.js
│   ├── middleware/       # Middleware
│   │   └── auth.js       # Аутентификация и авторизация
│   ├── scripts/          # Утилиты и скрипты
│   │   ├── seedAnalytics.js
│   │   └── migrateVotedUsers.js
│   └── server.js         # Точка входа
├── package.json
└── .env                  # Переменные окружения
```

### Переменные окружения (.env)

```bash
# Сервер
PORT=4000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/studvote

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=30d

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# RUZ API
RUZ_API_URL=https://ruz.hse.ru/api

# CORS
CLIENT_URL=http://localhost:3000

# Опционально: GigaChat для AI-анализа
GIGACHAT_TOKEN=your-gigachat-token
```

### Middleware

#### auth.js

```javascript
const authenticate = async (req, res, next) => {
  // Извлечение токена из заголовка Authorization
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Требуется аутентификация' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    
    req.user = { userId: user._id, role: user.role };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Неверный токен' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
};
```

### Controllers

#### pollController.js - Ключевые функции

**1. getPolls** - Получение списка опросов с фильтрацией

```javascript
exports.getPolls = async (req, res) => {
  const { filter, group_id } = req.query;
  const userId = req.user?.userId;
  
  let query = { status: 'active' };
  
  // Фильтр "активные" - опросы где НЕ голосовал
  if (filter === 'active' && userId) {
    query.voted_users = { $ne: userId };
  }
  
  // Фильтр "завершенные" - опросы где УЖЕ голосовал
  if (filter === 'completed' && userId) {
    query.voted_users = userId;
  }
  
  // Видимость для студента
  if (req.user?.role === 'student') {
    query.$or = [
      { pollType: 'custom' },
      { target_groups: group_id }
    ];
  }
  
  const polls = await Poll.find(query).sort({ created_at: -1 });
  
  res.json(polls);
};
```

**2. vote** - Голосование в опросе

```javascript
exports.vote = async (req, res) => {
  const { pollId, responses } = req.body;
  const userId = req.user.userId;
  
  const poll = await Poll.findById(pollId);
  
  // Проверка: уже голосовал?
  if (poll.voted_users.includes(userId)) {
    return res.status(400).json({ error: 'Вы уже проголосовали' });
  }
  
  // Сохранение ответа
  poll.responses.push({
    user_id: userId,
    answers: responses,
    submitted_at: new Date()
  });
  
  poll.voted_users.push(userId);
  poll.total_votes++;
  
  await poll.save();
  
  // Начисление баллов
  await User.findByIdAndUpdate(userId, {
    $inc: { 'student_data.points': poll.reward_points || 5 }
  });
  
  // Мгновенная аналитика
  const analytics = buildVoteAnalytics(poll, userId);
  
  res.json({ success: true, analytics });
};
```

**3. createQuickLessonPoll** - Создание опроса по шаблону

```javascript
exports.createQuickLessonPoll = async (req, res) => {
  const { lesson, pollType } = req.body;
  
  // Проверка: существует ли уже опрос?
  const existing = await Poll.findOne({
    'lessonContext.subject': lesson.discipline,
    'lessonContext.teacher': lesson.lecturers[0],
    'lessonContext.date': lesson.date,
    pollType: pollType
  });
  
  if (existing) {
    return res.json(existing); // Возвращаем существующий
  }
  
  // Создание нового опроса с шаблонными вопросами
  const questions = getTemplateQuestions(pollType);
  
  const newPoll = new Poll({
    creator_id: req.user.userId,
    title: `Оценка дисциплины: ${lesson.discipline}`,
    pollType: pollType,
    questions: questions,
    lessonContext: lesson,
    status: 'active',
    is_anonymous: true,
    // ... другие поля
  });
  
  await newPoll.save();
  res.json(newPoll);
};
```

### Services

#### voteAnalyticsService.js

```javascript
exports.buildVoteAnalytics = (poll, currentUserId) => {
  const responses = poll.responses;
  
  // 1. Извлечение оценок текущего пользователя
  const myResponse = responses.find(r => r.user_id.toString() === currentUserId.toString());
  const myRatings = {};
  
  Object.entries(myResponse.answers).forEach(([qId, value]) => {
    if (typeof value === 'number') {
      myRatings[qId] = value;
    }
  });
  
  // 2. Группировка всех оценок по вопросам
  const ratingsByQuestion = {};
  responses.forEach(resp => {
    Object.entries(resp.answers).forEach(([qId, value]) => {
      if (typeof value === 'number') {
        if (!ratingsByQuestion[qId]) ratingsByQuestion[qId] = [];
        ratingsByQuestion[qId].push(value);
      }
    });
  });
  
  // 3. Средние оценки группы
  const avgRatings = {};
  Object.keys(ratingsByQuestion).forEach(qId => {
    const arr = ratingsByQuestion[qId];
    avgRatings[qId] = arr.reduce((a, b) => a + b, 0) / arr.length;
  });
  
  // 4. Распределение оценок (1-5)
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  Object.values(ratingsByQuestion).flat().forEach(rating => {
    distribution[rating]++;
  });
  
  // 5. Распределение по каждому вопросу
  const distributionPerQuestion = {};
  Object.keys(ratingsByQuestion).forEach(qId => {
    distributionPerQuestion[qId] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingsByQuestion[qId].forEach(rating => {
      distributionPerQuestion[qId][rating]++;
    });
  });
  
  // 6. Тексты вопросов
  const questionTexts = {};
  poll.questions.forEach(q => {
    questionTexts[q.id] = q.text;
  });
  
  return {
    totalResponses: responses.length,
    totalStudents: null, // Можно добавить подсчёт из группы
    myRatings,
    avgRatings,
    distribution,
    distributionPerQuestion,
    questionTexts
  };
};
```

#### analyticsService.js - Детальная аналитика

```javascript
exports.getDetailedPollAnalytics = async (pollId) => {
  const poll = await Poll.findById(pollId);
  const responses = poll.responses;
  
  // === 1. ИКОП ===
  const ratingsByQuestion = {};
  responses.forEach(resp => {
    Object.entries(resp.answers).forEach(([qId, value]) => {
      if (typeof value === 'number' && value >= 1 && value <= 5) {
        if (!ratingsByQuestion[qId]) ratingsByQuestion[qId] = [];
        ratingsByQuestion[qId].push(value);
      }
    });
  });
  
  const avgRatings = {};
  Object.keys(ratingsByQuestion).forEach(qId => {
    const arr = ratingsByQuestion[qId];
    avgRatings[qId] = arr.reduce((a, b) => a + b, 0) / arr.length;
  });
  
  const weights = { 1: 0.25, 2: 0.30, 3: 0.20, 4: 0.15, 5: 0.10 };
  const normalize = (x) => (x - 1) / 4;
  
  let ikop = 0;
  Object.keys(weights).forEach(qId => {
    const rating = avgRatings[qId] || 3;
    ikop += weights[qId] * normalize(rating);
  });
  
  const ikopPercent = Math.round(ikop * 100);
  
  // === 2. Текстовый анализ ===
  const allTexts = [];
  responses.forEach(resp => {
    Object.values(resp.answers).forEach(val => {
      if (typeof val === 'string' && val.length > 5) {
        allTexts.push(val);
      }
    });
  });
  
  const wordFreq = calculateWordFrequency(allTexts);
  const bigrams = calculateBigrams(allTexts);
  const sentiment = analyzeSentiment(allTexts);
  
  // === 3. Корреляция ===
  const correlationMatrix = calculateCorrelationMatrix(ratingsByQuestion);
  const ratingSentimentCorr = calculateRatingSentimentCorrelation(responses);
  const topCorrelations = findTopCorrelations(correlationMatrix);
  
  // === 4. Рекомендации ===
  const recommendations = generateRecommendations(avgRatings, sentiment);
  
  return {
    ikop: ikopPercent,
    avgRatings,
    wordFreq,
    bigrams,
    sentiment,
    correlationMatrix,
    ratingSentimentCorr,
    topCorrelations,
    recommendations
  };
};
```

**Расчёт корреляции Пирсона:**

```javascript
function pearsonArrays(arrX, arrY) {
  const n = arrX.length;
  if (n === 0 || n !== arrY.length) return null;
  
  const sumX = arrX.reduce((a, b) => a + b, 0);
  const sumY = arrY.reduce((a, b) => a + b, 0);
  const sumXY = arrX.reduce((sum, x, i) => sum + x * arrY[i], 0);
  const sumX2 = arrX.reduce((sum, x) => sum + x * x, 0);
  const sumY2 = arrY.reduce((sum, y) => sum + y * y, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return null;
  
  return numerator / denominator;
}
```

**Сентимент-анализ (словарный подход):**

```javascript
const POSITIVE_WORDS = ['хорошо', 'отлично', 'понятно', 'интересно', 'полезно', ...];
const NEGATIVE_WORDS = ['плохо', 'непонятно', 'скучно', 'бесполезно', 'ужасно', ...];

function analyzeSentiment(texts) {
  let positive = 0, negative = 0, neutral = 0;
  
  texts.forEach(text => {
    const lowerText = text.toLowerCase();
    let score = 0;
    
    POSITIVE_WORDS.forEach(word => {
      if (lowerText.includes(word)) score++;
    });
    
    NEGATIVE_WORDS.forEach(word => {
      if (lowerText.includes(word)) score--;
    });
    
    if (score > 0) positive++;
    else if (score < 0) negative++;
    else neutral++;
  });
  
  return { positive, neutral, negative };
}
```

### Models

#### User.js

```javascript
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['student', 'teacher', 'admin'], 
    default: 'student' 
  },
  full_name: String,
  
  // Академическая структура
  faculty: String,
  faculty_name: String,
  program: String,
  program_name: String,
  course: Number,
  group: String,
  group_id: Number,
  
  // Для преподавателей
  ruz_teacher_id: Number,
  
  // Для студентов
  student_data: {
    points: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    badges: [String]
  },
  
  // Верификация email
  verification_code: String,
  verification_expires: Date,
  is_verified: { type: Boolean, default: false },
  
  created_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Методы
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateVerificationCode = function() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.verification_code = code;
  this.verification_expires = Date.now() + 15 * 60 * 1000; // 15 мин
  return code;
};
```

#### Poll.js

```javascript
const pollSchema = new mongoose.Schema({
  creator_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['form', 'poll'], default: 'poll' },
  
  pollType: {
    type: String,
    enum: [
      'subject_feedback',
      'teacher_feedback',
      'class_organization',
      'teacher_lesson_review',
      'custom'
    ],
    default: 'custom'
  },
  
  questions: [{
    id: Number,
    text: String,
    type: {
      type: String,
      enum: ['rating', 'single_choice', 'multiple_choice', 'text']
    },
    options: [String],
    required: Boolean
  }],
  
  responses: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    answers: mongoose.Schema.Types.Mixed,
    raw_responses: [mongoose.Schema.Types.Mixed],
    user_faculty: String,
    user_program: String,
    user_course: Number,
    user_group: String,
    submitted_at: { type: Date, default: Date.now }
  }],
  
  voted_users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  total_votes: { type: Number, default: 0 },
  
  // Настройки
  is_anonymous: { type: Boolean, default: true },
  show_results: {
    type: String,
    enum: ['immediate', 'after_vote', 'after_close'],
    default: 'after_vote'
  },
  reward_points: { type: Number, default: 5 },
  minResponsesForResults: { type: Number, default: 1 },
  
  // Видимость
  visibility: {
    type: String,
    enum: ['public', 'group', 'faculty', 'private'],
    default: 'public'
  },
  target_groups: [String],
  target_faculties: [String],
  target_programs: [String],
  target_courses: [Number],
  
  // Контекст пары
  lessonContext: {
    subject: String,
    teacher: String,
    group: String,
    groupId: String,
    date: String,
    time: String,
    topic: String,
    auditorium: String,
    beginLesson: String,
    endLesson: String
  },
  
  // Статус
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'deleted'],
    default: 'active'
  },
  
  start_date: Date,
  end_date: Date,
  created_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Индексы для производительности
pollSchema.index({ status: 1, created_at: -1 });
pollSchema.index({ voted_users: 1 });
pollSchema.index({ target_groups: 1 });
pollSchema.index({ pollType: 1 });
```

---

## Frontend

### Структура директорий

```
client/
├── public/
│   ├── index.html
│   ├── favicon.ico
│   └── manifest.json
├── src/
│   ├── components/      # Переиспользуемые компоненты
│   │   ├── Layout/
│   │   │   ├── DashboardLayout.js
│   │   │   ├── Header.js
│   │   │   └── Sidebar.js
│   │   ├── Auth/
│   │   │   ├── Login.js
│   │   │   ├── Register.js
│   │   │   └── ProtectedRoute.js
│   │   ├── Polls/
│   │   │   ├── PollCard.js
│   │   │   └── QuickPollModal.js
│   │   └── ...
│   ├── pages/           # Страницы
│   │   ├── DashboardMain.js
│   │   ├── PollDetail.js
│   │   ├── CreatePoll.js
│   │   ├── VoteResults.jsx
│   │   ├── Student/
│   │   │   ├── MyStats.jsx
│   │   │   └── DetailedAnalytics.jsx
│   │   ├── Admin/
│   │   │   └── GroupAnalytics.jsx
│   │   └── ...
│   ├── services/        # API клиенты
│   │   ├── api.js
│   │   ├── authService.js
│   │   ├── pollService.js
│   │   └── ...
│   ├── contexts/        # React Context
│   │   ├── AuthContext.js
│   │   └── ThemeContext.js
│   ├── styles/          # CSS
│   │   ├── globals.css
│   │   ├── analytics.css
│   │   └── ...
│   ├── App.js           # Главный компонент
│   └── index.js         # Точка входа
├── package.json
└── .env                 # Переменные окружения
```

### Переменные окружения (.env)

```bash
REACT_APP_API_URL=http://localhost:4000
REACT_APP_WS_URL=ws://localhost:4000
```

### API Service

#### api.js

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor для добавления токена
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor для обработки ошибок
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### Contexts

#### AuthContext.js

```javascript
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadUser();
  }, []);
  
  const loadUser = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    
    try {
      const response = await api.get('/api/users/profile');
      setUser(response.data);
    } catch (error) {
      console.error('Failed to load user:', error);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };
  
  const login = async (email, password) => {
    const response = await api.post('/api/auth/login', { email, password });
    localStorage.setItem('token', response.data.token);
    setUser(response.data.user);
  };
  
  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };
  
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, loadUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
```

### Компоненты

#### ProtectedRoute.js

```javascript
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" />;
  }
  
  return children;
};
```

#### Визуализация ECharts

```javascript
import * as echarts from 'echarts';
import 'echarts-wordcloud';

// Манометр ИКОП
const renderIKOPGauge = (ikop) => {
  const option = {
    series: [{
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min: 0,
      max: 100,
      center: ['50%', '75%'],
      radius: '90%',
      axisLine: {
        lineStyle: {
          width: 30,
          color: [
            [0.4, '#FF6E76'],  // Критично
            [0.6, '#FDDD60'],  // Внимание
            [0.8, '#7CFFB2'],  // Хорошо
            [1, '#58D9F9']     // Отлично
          ]
        }
      },
      pointer: {
        itemStyle: { color: 'auto' }
      },
      axisTick: { show: false },
      splitLine: {
        length: 15,
        lineStyle: { width: 2, color: '#999' }
      },
      axisLabel: {
        distance: 25,
        color: '#999',
        fontSize: 14
      },
      detail: {
        valueAnimation: true,
        formatter: '{value}/100',
        color: 'auto',
        fontSize: 24,
        offsetCenter: [0, '-15%']
      },
      data: [{ value: ikop }]
    }]
  };
  
  return option;
};

// Heatmap корреляций
const renderCorrelationHeatmap = (correlationMatrix) => {
  const data = [];
  const xLabels = Object.keys(correlationMatrix);
  const yLabels = Object.keys(correlationMatrix);
  
  xLabels.forEach((xLabel, xIdx) => {
    yLabels.forEach((yLabel, yIdx) => {
      const value = correlationMatrix[xLabel][yLabel];
      data.push([xIdx, yIdx, value]);
    });
  });
  
  const option = {
    tooltip: {
      position: 'top'
    },
    grid: {
      height: '50%',
      top: '10%'
    },
    xAxis: {
      type: 'category',
      data: xLabels,
      splitArea: { show: true }
    },
    yAxis: {
      type: 'category',
      data: yLabels,
      splitArea: { show: true }
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '15%',
      inRange: {
        color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', 
                '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']
      }
    },
    series: [{
      type: 'heatmap',
      data: data,
      label: {
        show: true,
        formatter: (params) => params.value[2].toFixed(2)
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  };
  
  return option;
};
```

---

## База данных

### MongoDB коллекции

#### users
```json
{
  "_id": ObjectId("..."),
  "email": "student@hse.ru",
  "password": "$2a$10$...",
  "role": "student",
  "full_name": "Иванов Иван Иванович",
  "faculty": "ИВБО",
  "faculty_name": "Информатика и бизнес",
  "program": "ПИН",
  "program_name": "Программная инженерия",
  "course": 3,
  "group": "ИВБО-03-20",
  "group_id": 154810,
  "student_data": {
    "points": 120,
    "level": 3,
    "badges": ["early_bird", "commentator"]
  },
  "is_verified": true,
  "created_at": ISODate("2025-09-01T10:00:00Z")
}
```

#### polls
```json
{
  "_id": ObjectId("..."),
  "creator_id": ObjectId("..."),
  "title": "Оценка дисциплины: Базы данных",
  "pollType": "subject_feedback",
  "questions": [
    {
      "id": 1,
      "text": "Насколько актуальна изученная тема?",
      "type": "rating",
      "required": true
    },
    {
      "id": 2,
      "text": "Комментарии",
      "type": "text",
      "required": false
    }
  ],
  "responses": [
    {
      "user_id": ObjectId("..."),
      "answers": {
        "1": 5,
        "2": "Очень понравилось!"
      },
      "user_group": "ИВБО-03-20",
      "submitted_at": ISODate("2025-01-12T14:30:00Z")
    }
  ],
  "voted_users": [ObjectId("...")],
  "total_votes": 1,
  "is_anonymous": true,
  "visibility": "group",
  "target_groups": ["154810"],
  "lessonContext": {
    "subject": "Базы данных",
    "teacher": "Иванова И.И.",
    "date": "2025-01-12",
    "time": "10:00"
  },
  "status": "active",
  "reward_points": 5,
  "created_at": ISODate("2025-01-12T10:00:00Z")
}
```

### Индексы

```javascript
// users
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ group_id: 1 });
db.users.createIndex({ role: 1 });

// polls
db.polls.createIndex({ status: 1, created_at: -1 });
db.polls.createIndex({ voted_users: 1 });
db.polls.createIndex({ target_groups: 1 });
db.polls.createIndex({ pollType: 1 });
db.polls.createIndex({ 'lessonContext.subject': 1, 'lessonContext.date': 1 });
```

---

## Интеграции

### RUZ API (Расписание)

**Base URL:** `https://ruz.hse.ru/api`

**Основные эндпоинты:**

```javascript
// 1. Поиск группы
GET /search?term=ИВБО-03-20&type=group
Response: [{ id: 154810, label: "ИВБО-03-20" }]

// 2. Расписание группы
GET /schedule/group/{groupId}?start=2025-01-01&finish=2025-01-31
Response: [
  {
    discipline: "Базы данных",
    lecturers: ["Иванова И.И."],
    date: "12.01.2025",
    beginLesson: "10:00",
    endLesson: "11:30",
    auditorium: "Кочновский 311"
  }
]

// 3. Поиск преподавателя
GET /search?term=Иванов&type=person
Response: [{ id: 12345, label: "Иванов Иван Иванович" }]

// 4. Расписание преподавателя
GET /schedule/person/{personId}?start=...&finish=...
```

**Кэширование:**
- Расписания кэшируются в Redis на 1 час
- Ключи: `schedule:group:{groupId}:{date}`, `schedule:person:{personId}:{date}`

### Email Service (Nodemailer)

```javascript
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const sendVerificationEmail = async (email, code) => {
  await transporter.sendMail({
    from: '"StudVote" <noreply@studvote.ru>',
    to: email,
    subject: 'Подтверждение регистрации',
    html: `
      <h1>Добро пожаловать в StudVote!</h1>
      <p>Ваш код подтверждения: <strong>${code}</strong></p>
      <p>Код действителен 15 минут.</p>
    `
  });
};
```

---

## Безопасность

### Аутентификация

**JWT (JSON Web Tokens):**
- Токен создаётся при входе и хранится в `localStorage`
- Срок действия: 30 дней (настраивается в `.env`)
- Токен передаётся в заголовке `Authorization: Bearer <token>`

**Структура токена:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "role": "student",
  "iat": 1642080000,
  "exp": 1644672000
}
```

### Хеширование паролей

```javascript
// При регистрации
const bcrypt = require('bcryptjs');
const hashedPassword = await bcrypt.hash(password, 10);

// При входе
const isMatch = await bcrypt.compare(candidatePassword, user.password);
```

### Защита от CSRF

- CORS настроен на разрешение запросов только от `CLIENT_URL`
- SameSite cookies (если используются)

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100 // макс 100 запросов
});

app.use('/api/', limiter);
```

### Валидация данных

```javascript
const validatePollCreation = (req, res, next) => {
  const { title, questions } = req.body;
  
  if (!title || title.length < 5 || title.length > 200) {
    return res.status(400).json({ error: 'Название должно быть от 5 до 200 символов' });
  }
  
  if (!questions || questions.length === 0) {
    return res.status(400).json({ error: 'Добавьте хотя бы один вопрос' });
  }
  
  next();
};
```

---

## Развёртывание

### Локальная разработка

**1. Backend:**
```bash
cd server
npm install
cp .env.example .env
# Отредактируйте .env
npm run dev
```

**2. Frontend:**
```bash
cd client
npm install
cp .env.example .env
# Отредактируйте .env
npm start
```

**3. MongoDB:**
```bash
# Вариант 1: Локально
brew install mongodb-community
brew services start mongodb-community

# Вариант 2: Docker
docker run -d -p 27017:27017 --name studvote-mongo mongo:6
```

**4. Redis:**
```bash
# Вариант 1: Локально
brew install redis
brew services start redis

# Вариант 2: Docker
docker run -d -p 6379:6379 --name studvote-redis redis:7
```

### Production (Docker Compose)

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  mongo:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  backend:
    build: ./server
    ports:
      - "4000:4000"
    environment:
      MONGODB_URI: mongodb://admin:password@mongo:27017/studvote?authSource=admin
      REDIS_HOST: redis
      JWT_SECRET: ${JWT_SECRET}
      # ... остальные переменные
    depends_on:
      - mongo
      - redis

  frontend:
    build: ./client
    ports:
      - "80:80"
    environment:
      REACT_APP_API_URL: https://api.studvote.ru
    depends_on:
      - backend

volumes:
  mongo_data:
```

**Команды:**
```bash
docker-compose up -d
docker-compose logs -f backend
docker-compose down
```

---

## API Reference

### Аутентификация

#### POST /api/auth/register
Регистрация нового пользователя

**Request:**
```json
{
  "email": "student@hse.ru",
  "password": "SecurePass123",
  "full_name": "Иванов Иван",
  "role": "student",
  "faculty": "ИВБО",
  "program": "ПИН",
  "course": 3,
  "group": "ИВБО-03-20",
  "group_id": 154810
}
```

**Response (200):**
```json
{
  "message": "Код отправлен на email",
  "userId": "507f1f77bcf86cd799439011"
}
```

#### POST /api/auth/verify-code
Подтверждение email

**Request:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "code": "123456"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ...user object... }
}
```

#### POST /api/auth/login
Вход в систему

**Request:**
```json
{
  "email": "student@hse.ru",
  "password": "SecurePass123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ...user object... }
}
```

### Опросы

#### GET /api/polls
Список опросов

**Query параметры:**
- `filter`: `active` | `completed` | `my-votes` (опционально)
- `group_id`: ID группы (для фильтра "только моя группа")

**Headers:**
- `Authorization: Bearer <token>` (обязательно)

**Response (200):**
```json
[
  {
    "_id": "...",
    "title": "Оценка дисциплины: Математика",
    "pollType": "subject_feedback",
    "creator_id": {...},
    "questions": [...],
    "total_votes": 12,
    "status": "active",
    "created_at": "2025-01-12T10:00:00Z"
  }
]
```

#### GET /api/polls/:id
Детали конкретного опроса

**Response (200):**
```json
{
  "_id": "...",
  "title": "...",
  "questions": [...],
  "responses": [...],
  "voted_users": [...],
  ...
}
```

#### POST /api/polls/vote
Проголосовать в опросе

**Request:**
```json
{
  "pollId": "507f1f77bcf86cd799439011",
  "responses": {
    "1": 5,
    "2": 4,
    "3": "Отличная пара!"
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "analytics": {
    "totalResponses": 13,
    "myRatings": { "1": 5, "2": 4 },
    "avgRatings": { "1": 4.3, "2": 4.1 },
    ...
  }
}
```

#### POST /api/polls/quick-lesson-poll
Создать опрос по шаблону

**Request:**
```json
{
  "lesson": {
    "discipline": "Математика",
    "lecturers": ["Иванова И.И."],
    "date": "12.01.2025",
    "beginLesson": "10:00",
    "endLesson": "11:30"
  },
  "pollType": "subject_feedback"
}
```

**Response (200):**
```json
{
  "_id": "...",
  "title": "Оценка дисциплины: Математика",
  ...
}
```

### Аналитика

#### GET /api/analytics/detailed/:pollId
Детальная аналитика опроса

**Response (200):**
```json
{
  "poll": {...},
  "ikop": 68,
  "zone": "Хорошо",
  "avgRatings": { "1": 4.2, "2": 4.5, ... },
  "topWords": [
    { "word": "практика", "count": 15 },
    { "word": "понятно", "count": 12 }
  ],
  "topBigrams": [
    { "bigram": "мало практики", "count": 8 }
  ],
  "sentiment": {
    "positive": 18,
    "neutral": 12,
    "negative": 5
  },
  "correlationMatrix": {...},
  "ratingSentimentCorrelation": 0.73,
  "topCorrelations": [
    {
      "q1Id": 1,
      "q2Id": 2,
      "correlation": 0.89,
      "label1": "Понятность",
      "label2": "Вовлечённость"
    }
  ]
}
```

#### GET /api/analytics/my-stats
Личная статистика студента

**Response (200):**
```json
{
  "totalVoted": 12,
  "myAvgRating": 4.2,
  "subjects": [
    {
      "subject": "Математика",
      "teacher": "Иванова И.И.",
      "myAvg": 4.5,
      "lessonsCount": 3
    }
  ]
}
```

#### GET /api/analytics/group/:groupName
Аналитика группы (только admin)

**Response (200):**
```json
{
  "groupName": "ИВБО-03-20",
  "totalStudents": 25,
  "activeStudents": 18,
  "activity": 72,
  "subjects": [
    {
      "subject": "Математика",
      "teacher": "Иванова И.И.",
      "avgRating": 3.2,
      "responses": 15,
      "status": "problem"
    }
  ],
  "problemSubject": {...}
}
```

---

## Производительность и оптимизация

### Кэширование (Redis)

**Что кэшируется:**
- Расписание из RUZ (1 час)
- Список факультетов/программ (1 день)
- Счетчики опросов (5 минут)

**Пример:**
```javascript
const cachedSchedule = await redis.get(`schedule:group:${groupId}:${date}`);
if (cachedSchedule) {
  return JSON.parse(cachedSchedule);
}

const schedule = await fetchFromRUZ(groupId, date);
await redis.setex(`schedule:group:${groupId}:${date}`, 3600, JSON.stringify(schedule));
```

### Пагинация

```javascript
exports.getPolls = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  
  const polls = await Poll.find(query)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit);
  
  const total = await Poll.countDocuments(query);
  
  res.json({
    polls,
    totalPages: Math.ceil(total / limit),
    currentPage: page
  });
};
```

### Агрегация в MongoDB

```javascript
// Вместо загрузки всех responses в память
const stats = await Poll.aggregate([
  { $match: { status: 'active' } },
  { $unwind: '$responses' },
  { $group: {
      _id: '$_id',
      avgRating: { $avg: '$responses.answers.1' },
      totalVotes: { $sum: 1 }
  }}
]);
```

---

*Эта документация актуальна на январь 2026 и будет обновляться по мере развития проекта.*
