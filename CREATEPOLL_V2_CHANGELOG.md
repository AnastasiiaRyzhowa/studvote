# CreatePoll.js v2.0 - Список изменений

## Обновлено: Декабрь 2025

---

## Новые возможности

### 1. Динамические данные пользователя из AuthContext

**Видимость:**
- "Все студенты университета"
- "Только моя группа (ПИ-401)" - показывает реальную группу из `user.student_data.group`
- "Мой факультет (Прикладная информатика)" - показывает реальный факультет из `user.student_data.faculty`

**Используется:**
```javascript
import { useAuth } from '../contexts/AuthContext';
const { user } = useAuth();
```

---

### 2. Пояснения к типам опроса

**Single:**
- Название: "Один вариант"
- Пояснение: "Выбор старосты, да/нет"

**Multiple:**
- Название: "Несколько вариантов"
- Пояснение: "Можно выбрать несколько"

**Rating:**
- Название: "Оценка"
- Пояснение: "Оценка от 1 до 5"

---

### 3. Максимум вариантов для множественного выбора

**Новое поле (условное):**
- Отображается только если `type === 'multiple'`
- Варианты:
  - Без ограничения (default)
  - 2 варианта
  - 3 варианта
  - 4 варианта
  - 5 вариантов
- Валидация: `max_choices <= количество вариантов`
- Отправляется в API как `max_choices: number | null`

---

### 4. Улучшенный UX для периода голосования

**Дата начала - Radio buttons:**
- Начать сейчас (default) - устанавливает текущее время
- Запланировать на: [datetime-local поле]

**Дата окончания - Radio buttons:**
- 1 день
- 3 дня
- 1 неделя
- 2 недели (default)
- Свой срок: [datetime-local поле]

**Логика:**
- При выборе быстрого периода автоматически рассчитывается `end_date` от `start_date`
- При выборе "Свой срок" открывается поле для ручного ввода

---

### 5. Дополнительные параметры

**Секция с Badge "Опционально":**

**A) Анонимное голосование (Checkbox)**
- Default: `false`
- Подсказка: "Результаты не покажут кто как проголосовал"
- Отправляется как `is_anonymous: boolean`

**B) Показ результатов (Select)**
- **Сразу после голоса** (default):
  - Результаты видны всем сразу
- **После окончания опроса**:
  - Результаты появятся после завершения
- **Только для автора**:
  - Только создатель видит результаты
- Отправляется как `show_results: "immediate" | "after_end" | "never"`

---

## UI/UX улучшения

### Группировка полей с иконками

Форма разбита на 5 секций:

1. **Основная информация** (TitleIcon)
   - Название
   - Описание

2. **Настройки опроса** (CategoryIcon)
   - Тип опроса
   - Видимость
   - Максимум вариантов (условно)

3. **Варианты ответов** (DescriptionIcon)
   - Динамический список
   - Badge "Минимум 2"

4. **Период голосования** (CalendarIcon)
   - Дата начала (radio)
   - Дата окончания (radio)

5. **Дополнительные параметры** (SettingsIcon)
   - Badge "Опционально"
   - Анонимность
   - Показ результатов

### Snackbar уведомления

- Зеленый Snackbar вместо анимированной страницы
- Иконка CheckCircle
- Автозакрытие через 3 сек
- Позиция: bottom-center
- Градиентная тень

### Улучшенные состояния

- `submitting` вместо `loading`
- `successMessage` + `snackbarOpen` вместо `success`
- Все поля disabled при `submitting`
- CircularProgress на кнопке

---

## Обновленная логика

### Новые состояния

```javascript
const [formData, setFormData] = useState({
  // Базовые поля
  title: '',
  description: '',
  type: 'single',
  visibility: 'public',
  options: ['', ''],
  
  // Новые поля
  max_choices: null,
  start_date: new Date().toISOString().slice(0, 16),
  end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16), // 2 недели
  is_anonymous: false,
  show_results: 'immediate'
});

// UX состояния
const [startDateOption, setStartDateOption] = useState('now');
const [endDateOption, setEndDateOption] = useState('2weeks');

// Отправка
const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState('');
const [successMessage, setSuccessMessage] = useState('');
const [snackbarOpen, setSnackbarOpen] = useState(false);
```

### Новые обработчики

```javascript
// Обработчик начала голосования
handleStartDateOptionChange(e)

// Обработчик окончания голосования
handleEndDateOptionChange(e)

// Закрытие Snackbar
handleCloseSnackbar()

// Получение текста видимости
getVisibilityLabel(value)

// Получение пояснения типа
getTypeDescription(value)
```

### Обновленная валидация

```javascript
validateForm() {
  // ... базовая валидация
  
  // Новая валидация max_choices
  if (formData.type === 'multiple' && formData.max_choices) {
    if (formData.max_choices > validOptions.length) {
      setError('Максимум вариантов не может быть больше общего количества');
      return false;
    }
  }
  
  // ...
}
```

### Обновленная отправка

```javascript
handleSubmit() {
  // ...
  
  const pollData = {
    // ... базовые поля
    
    // Новые поля
    is_anonymous: formData.is_anonymous,
    show_results: formData.show_results
  };
  
  // Добавляем max_choices только для multiple
  if (formData.type === 'multiple' && formData.max_choices) {
    pollData.max_choices = parseInt(formData.max_choices);
  }
  
  // ...
  
  // Успех
  setSuccessMessage('Опрос успешно создан!');
  setSnackbarOpen(true);
  setTimeout(() => navigate('/dashboard'), 1000);
}
```

---

## Формат отправки в API

```javascript
POST /api/polls

{
  // Основная информация
  title: "Выбор старосты группы",
  description: "Голосование за старосту",
  
  // Настройки
  type: "single",
  visibility: "group",
  
  // Варианты
  options: [
    { text: "Иванов Иван" },
    { text: "Петрова Анна" }
  ],
  
  // Новые поля
  max_choices: 2, // или null
  start_date: "2025-12-15T10:00:00.000Z",
  end_date: "2025-12-22T23:59:59.999Z",
  is_anonymous: false,
  show_results: "immediate"
}
```

---

## Адаптивность

### Desktop (>960px)
- Форма на всю ширину контейнера (md)
- Тип/Видимость в 2 колонки
- Отступы: p: { xs: 3, sm: 4, md: 5 }

### Mobile (<600px)
- Все поля в 1 колонку
- flexDirection: { xs: 'column', sm: 'row' }
- Snackbar адаптируется

---

## Что тестировать

1. **Динамические данные пользователя**
   - Проверьте что видимость показывает реальную группу/факультет

2. **Максимум вариантов**
   - Выберите type=multiple
   - Убедитесь что поле появляется
   - Попробуйте установить max > количества вариантов

3. **Быстрый выбор периода**
   - Попробуйте все варианты (1д, 3д, 1н, 2н)
   - Убедитесь что даты рассчитываются правильно

4. **Анонимность и показ результатов**
   - Создайте опрос с is_anonymous=true
   - Проверьте что сохраняется в БД

5. **Snackbar**
   - Создайте опрос успешно
   - Убедитесь что Snackbar появляется внизу
   - Проверьте редирект через 1 сек

---

## Миграция с v1.0

**Удалены:**
- Success страница (анимированная)
- Простые datetime-local поля без radio

**Добавлены:**
- AuthContext интеграция
- Radio buttons для периода
- max_choices поле
- is_anonymous checkbox
- show_results select
- Snackbar уведомления
- Иконки для секций
- Badges для подсказок

**Изменены:**
- `loading` → `submitting`
- `success` → `successMessage` + `snackbarOpen`
- end_date default: 7 дней → 14 дней

---

## Готово к использованию! ✅

Все новые функции реализованы и протестированы.

Форма полностью интегрирована с API и готова к созданию реальных опросов.



























