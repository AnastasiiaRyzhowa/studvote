# Poll Service - Руководство по использованию

## Описание

`pollService.js` - сервис для работы с API опросов в StudVote. Предоставляет методы для получения, создания опросов и голосования.

## Расположение

```
client/src/services/pollService.js
```

## Импорт

```javascript
// Импорт отдельных функций
import { getPolls, getPollById, vote } from '../services/pollService';

// Импорт всего сервиса
import pollService from '../services/pollService';
```

---

## API Методы

### 1. getPolls(filters)

Получает список опросов с фильтрацией и пагинацией.

**Параметры:**
```javascript
filters = {
  status: 'active',      // 'active', 'completed', 'draft'
  visibility: 'public',  // 'public', 'group', 'faculty'
  page: 1,              // Номер страницы
  limit: 10             // Количество на странице
}
```

**Пример использования:**
```javascript
import { getPolls } from '../services/pollService';

// Получить все опросы
const data = await getPolls();

// Получить активные опросы
const activePolls = await getPolls({ status: 'active' });

// С пагинацией
const page2 = await getPolls({ page: 2, limit: 20 });

// В компоненте
const [polls, setPolls] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const fetchPolls = async () => {
    try {
      const data = await getPolls({ status: 'active', page: 1, limit: 10 });
      setPolls(data.polls);
    } catch (error) {
      console.error('Ошибка:', error);
    } finally {
      setLoading(false);
    }
  };
  
  fetchPolls();
}, []);
```

**Ответ:**
```javascript
{
  success: true,
  polls: [
    {
      _id: "...",
      title: "Выбор старосты",
      status: "active",
      total_votes: 15,
      has_voted: false,
      ...
    }
  ],
  pagination: {
    page: 1,
    limit: 10,
    total: 25,
    pages: 3
  }
}
```

---

### 2. getPollById(pollId)

Получает детальную информацию об опросе.

**Параметры:**
- `pollId` (string) - ID опроса

**Пример использования:**
```javascript
import { getPollById } from '../services/pollService';

const pollId = '675abc123def456789012345';
const data = await getPollById(pollId);

console.log('Опрос:', data.poll);
console.log('Статистика:', data.statistics);

// В компоненте
const [poll, setPoll] = useState(null);

useEffect(() => {
  const fetchPoll = async () => {
    try {
      const data = await getPollById(pollId);
      setPoll(data.poll);
    } catch (error) {
      console.error('Опрос не найден');
    }
  };
  
  fetchPoll();
}, [pollId]);
```

**Ответ:**
```javascript
{
  success: true,
  poll: {
    _id: "...",
    title: "Выбор старосты группы",
    description: "...",
    options: [...],
    has_voted: true,
    user_vote: { option_ids: [0] },
    is_active: true,
    ...
  },
  statistics: {
    total_votes: 15,
    option_votes: { 0: 8, 1: 7 }
  }
}
```

---

### 3. createPoll(pollData)

Создает новый опрос.

**Параметры:**
```javascript
pollData = {
  title: string,           // 5-200 символов, обязательно
  description: string,     // До 2000 символов, опционально
  type: string,           // 'single', 'multiple', 'rating', обязательно
  visibility: string,     // 'public', 'group', 'faculty', default: 'public'
  options: [              // 2-20 вариантов, обязательно
    { text: "Вариант 1" },
    { text: "Вариант 2" }
  ],
  start_date: Date|string, // ISO string, обязательно
  end_date: Date|string    // ISO string, обязательно
}
```

**Пример использования:**
```javascript
import { createPoll } from '../services/pollService';

const newPoll = {
  title: 'Выбор старосты группы ПИ-401',
  description: 'Голосование за старосту на следующий семестр',
  type: 'single',
  visibility: 'group',
  options: [
    { text: 'Иванов Иван' },
    { text: 'Петрова Анна' },
    { text: 'Сидоров Петр' }
  ],
  start_date: new Date().toISOString(),
  end_date: new Date(Date.now() + 7*24*60*60*1000).toISOString()
};

try {
  const data = await createPoll(newPoll);
  console.log('Опрос создан:', data.poll);
  // Редирект на страницу опроса
  navigate(`/polls/${data.poll._id}`);
} catch (error) {
  if (error.response?.status === 401) {
    console.error('Требуется авторизация');
  } else {
    console.error('Ошибка создания:', error.response?.data?.message);
  }
}

// В компоненте формы
const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError('');
  
  try {
    const pollData = {
      title: formData.title,
      description: formData.description,
      type: formData.type,
      visibility: formData.visibility,
      options: formData.options,
      start_date: formData.startDate.toISOString(),
      end_date: formData.endDate.toISOString()
    };
    
    const data = await createPoll(pollData);
    
    // Успех
    alert('Опрос создан!');
    navigate('/dashboard');
  } catch (error) {
    setError(error.response?.data?.message || 'Ошибка создания');
  } finally {
    setLoading(false);
  }
};
```

**Ответ:**
```javascript
{
  success: true,
  message: "Опрос успешно создан",
  poll: {
    _id: "...",
    title: "Выбор старосты группы ПИ-401",
    creator_id: {...},
    status: "active",
    ...
  }
}
```

---

### 4. vote(pollId, optionIds)

Голосует в опросе.

**Параметры:**
- `pollId` (string) - ID опроса
- `optionIds` (Array<number>) - Массив индексов выбранных вариантов

**Пример использования:**
```javascript
import { vote } from '../services/pollService';

const pollId = '675abc123def456789012345';
const selectedOptions = [0]; // Выбран первый вариант

try {
  const data = await vote(pollId, selectedOptions);
  
  console.log('Голос учтен!');
  console.log('Заработано баллов:', data.points_earned);
  console.log('Статистика:', data.statistics);
  
  // Показать результаты
} catch (error) {
  if (error.response?.data?.message === 'Вы уже проголосовали в этом опросе') {
    console.error('Вы уже голосовали!');
  } else {
    console.error('Ошибка голосования:', error.response?.data?.message);
  }
}

// В компоненте
const [selectedOptions, setSelectedOptions] = useState([]);
const [voting, setVoting] = useState(false);

const handleVote = async () => {
  if (selectedOptions.length === 0) {
    alert('Выберите хотя бы один вариант');
    return;
  }
  
  setVoting(true);
  
  try {
    const data = await vote(poll._id, selectedOptions);
    
    // Успех
    setVoted(true);
    setPointsEarned(data.points_earned);
    
    // Обновить опрос
    const updatedPoll = await getPollById(poll._id);
    setPoll(updatedPoll.poll);
  } catch (error) {
    alert(error.response?.data?.message || 'Ошибка голосования');
  } finally {
    setVoting(false);
  }
};

// Для single выбора
const handleOptionSelect = (index) => {
  setSelectedOptions([index]);
};

// Для multiple выбора
const handleOptionToggle = (index) => {
  if (selectedOptions.includes(index)) {
    setSelectedOptions(prev => prev.filter(i => i !== index));
  } else {
    setSelectedOptions(prev => [...prev, index]);
  }
};
```

**Ответ:**
```javascript
{
  success: true,
  message: "Голос учтен",
  vote: {
    _id: "...",
    option_ids: [0],
    points_earned: 10,
    voted_at: "..."
  },
  points_earned: 10,
  poll: {
    total_votes: 16,
    options: [...]
  },
  statistics: {
    total_votes: 16,
    option_votes: { 0: 9, 1: 7 }
  }
}
```

---

### 5. getMyPolls(page, limit)

Получает опросы созданные текущим пользователем.

**Параметры:**
- `page` (number, default: 1) - Номер страницы
- `limit` (number, default: 10) - Количество на странице

**Пример использования:**
```javascript
import { getMyPolls } from '../services/pollService';

// Первая страница
const data = await getMyPolls(1, 10);

// В компоненте
const [myPolls, setMyPolls] = useState([]);
const [page, setPage] = useState(1);

useEffect(() => {
  const fetchMyPolls = async () => {
    try {
      const data = await getMyPolls(page, 10);
      setMyPolls(data.polls);
    } catch (error) {
      console.error('Ошибка:', error);
    }
  };
  
  fetchMyPolls();
}, [page]);
```

**Ответ:**
```javascript
{
  success: true,
  polls: [...],
  pagination: {
    page: 1,
    limit: 10,
    total: 5,
    pages: 1
  }
}
```

---

### 6. getMyVotes(page, limit)

Получает историю голосований текущего пользователя.

**Параметры:**
- `page` (number, default: 1) - Номер страницы
- `limit` (number, default: 20) - Количество на странице

**Пример использования:**
```javascript
import { getMyVotes } from '../services/pollService';

const data = await getMyVotes(1, 20);

console.log('Всего голосов:', data.statistics.total_votes);
console.log('Всего баллов:', data.statistics.total_points_earned);

// В компоненте
const [votes, setVotes] = useState([]);
const [stats, setStats] = useState(null);

useEffect(() => {
  const fetchVotes = async () => {
    try {
      const data = await getMyVotes(1, 20);
      setVotes(data.votes);
      setStats(data.statistics);
    } catch (error) {
      console.error('Ошибка:', error);
    }
  };
  
  fetchVotes();
}, []);
```

**Ответ:**
```javascript
{
  success: true,
  votes: [
    {
      _id: "...",
      poll_id: {
        title: "Выбор старосты",
        status: "active",
        end_date: "..."
      },
      option_ids: [0],
      points_earned: 10,
      voted_at: "..."
    }
  ],
  statistics: {
    total_votes: 15,
    total_points_earned: 150
  },
  pagination: {
    page: 1,
    limit: 20,
    total: 15,
    pages: 1
  }
}
```

---

### 7. getPollStatistics(pollId)

Получает только статистику опроса (вспомогательный метод).

**Пример:**
```javascript
import { getPollStatistics } from '../services/pollService';

const stats = await getPollStatistics(pollId);
console.log('Статистика:', stats);
```

---

### 8. hasVoted(pollId)

Проверяет, проголосовал ли пользователь в опросе (вспомогательный метод).

**Пример:**
```javascript
import { hasVoted } from '../services/pollService';

const voted = await hasVoted(pollId);
if (voted) {
  console.log('Вы уже голосовали');
}
```

---

## Полный пример компонента

```javascript
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPollById, vote } from '../services/pollService';
import { Button, Radio, RadioGroup, FormControlLabel } from '@mui/material';

const PollVotePage = () => {
  const { pollId } = useParams();
  const navigate = useNavigate();
  
  const [poll, setPoll] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState('');

  // Загрузка опроса
  useEffect(() => {
    const fetchPoll = async () => {
      try {
        const data = await getPollById(pollId);
        setPoll(data.poll);
        
        // Если уже голосовал - показать результаты
        if (data.poll.has_voted) {
          navigate(`/polls/${pollId}/results`);
        }
      } catch (error) {
        setError('Опрос не найден');
      } finally {
        setLoading(false);
      }
    };
    
    fetchPoll();
  }, [pollId, navigate]);

  // Голосование
  const handleVote = async () => {
    if (selectedOption === null) {
      setError('Выберите вариант ответа');
      return;
    }
    
    setVoting(true);
    setError('');
    
    try {
      const data = await vote(pollId, [selectedOption]);
      
      // Успех
      alert(`Голос учтен! Вы получили ${data.points_earned} баллов`);
      
      // Переход на результаты
      navigate(`/polls/${pollId}/results`);
    } catch (error) {
      setError(error.response?.data?.message || 'Ошибка голосования');
    } finally {
      setVoting(false);
    }
  };

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div>Ошибка: {error}</div>;
  if (!poll) return null;

  return (
    <div>
      <h1>{poll.title}</h1>
      <p>{poll.description}</p>
      
      <RadioGroup value={selectedOption} onChange={(e) => setSelectedOption(Number(e.target.value))}>
        {poll.options.map((option, index) => (
          <FormControlLabel
            key={index}
            value={index}
            control={<Radio />}
            label={option.text}
          />
        ))}
      </RadioGroup>
      
      <Button
        variant="contained"
        onClick={handleVote}
        disabled={voting || selectedOption === null}
      >
        {voting ? 'Отправка...' : 'Голосовать'}
      </Button>
    </div>
  );
};

export default PollVotePage;
```

---

## Обработка ошибок

Все методы выбрасывают ошибки, которые нужно обрабатывать:

```javascript
try {
  const data = await getPolls();
} catch (error) {
  // Ошибка доступна в error.response.data
  console.error('Код:', error.response?.status);
  console.error('Сообщение:', error.response?.data?.message);
  
  if (error.response?.status === 401) {
    // Не авторизован - редирект на login
    navigate('/login');
  } else if (error.response?.status === 404) {
    // Не найдено
    alert('Опрос не найден');
  } else {
    // Другие ошибки
    alert('Произошла ошибка');
  }
}
```

---

## Готово!

pollService.js готов к использованию для интеграции реальных данных в Dashboard и другие компоненты.






























