# Руководство по API экспорта данных

## Обзор

Система поддерживает экспорт данных в форматы Excel (.xlsx) и PDF для анализа и отчётности.

---

## 📊 Экспорт аналитики в Excel

### Endpoint
```
POST /api/admin/export/excel
```

### Аутентификация
Требуется JWT токен с ролью `admin`

### Параметры запроса (Body)

```json
{
  "type": "analytics | quality | users",
  "filters": {
    "faculty": "string | all",
    "program": "string | all", 
    "discipline": "string | all",
    "dateFrom": "YYYY-MM-DD",
    "dateTo": "YYYY-MM-DD"
  }
}
```

### Типы экспорта

#### 1. `type: "analytics"` или `type: "quality"`
Экспорт ИКОП по дисциплинам

**Структура данных в Excel:**
- Дисциплина
- Кол-во оценок
- Q1 (Актуальность)
- Q2 (Понятность)
- Q3 (Практика)
- Q4 (Вовлечённость)
- Q5 (Организация)
- Средняя оценка
- ИКОП

#### 2. `type: "users"`
Экспорт списка студентов

**Структура данных в Excel:**
- ФИО
- Email
- Группа
- Факультет
- Программа
- Курс
- Баллы
- Уровень
- Голосований

### Пример запроса

```javascript
const response = await api.post('/admin/export/excel', {
  type: 'analytics',
  filters: {
    faculty: 'ФКН',
    program: 'ПИ',
    dateFrom: '2024-09-01',
    dateTo: '2024-12-31'
  }
}, {
  responseType: 'blob'
});

// Скачивание файла
const blob = response.data;
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'export.xlsx';
a.click();
```

### Ответ
- **Успех**: Бинарный файл Excel (.xlsx)
- **Ошибка 404**: `{ success: false, message: "Нет данных для экспорта" }`
- **Ошибка 500**: `{ success: false, message: "Ошибка экспорта в Excel" }`

---

## 📄 Экспорт аналитики в PDF

### Endpoint
```
POST /api/admin/export/pdf/:type
```

### Параметры URL
- `type`: `summary` (сводный отчёт) или `detailed` (детальный отчёт)

### Аутентификация
Требуется JWT токен с ролью `admin`

### Параметры запроса (Body)

```json
{
  "filters": {
    "faculty": "string | all",
    "program": "string | all",
    "discipline": "string | all"
  }
}
```

### Типы отчётов

#### 1. `summary` - Сводный отчёт
Краткая статистика:
- Всего оценок
- Опросов проведено
- Средний ИКОП
- Средние оценки по 5 критериям

#### 2. `detailed` - Детальный отчёт
Включает сводную статистику плюс:
- Расшифровка показателя ИКОП
- Интерпретация значений (80-100%, 60-79%, 40-59%, 0-39%)
- Описание 5 критериев оценки

### Пример запроса

```javascript
const response = await api.post('/admin/export/pdf/summary', {
  filters: {
    faculty: 'ФКН',
    program: 'ПИ',
    discipline: 'Базы данных'
  }
}, {
  responseType: 'blob'
});

// Скачивание файла
const blob = response.data;
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'report.pdf';
a.click();
```

### Ответ
- **Успех**: Бинарный файл PDF
- **Ошибка 500**: `{ success: false, message: "Ошибка экспорта в PDF" }`

---

## 📋 Экспорт результатов конкретного опроса

### Endpoint
```
POST /api/admin/polls/:id/export
```

### Параметры URL
- `id`: ID опроса (MongoDB ObjectId)

### Параметры запроса (Body)

```json
{
  "format": "xlsx | pdf"
}
```

### Форматы

#### Excel (.xlsx)
Два листа:
1. **Ответы** - детальная таблица всех ответов
2. **Статистика** - сводная информация

#### PDF
- Заголовок с информацией об опросе
- Статистика
- Первые 50 ответов (для оптимизации размера)

### Пример запроса

```javascript
const response = await api.post(`/admin/polls/${pollId}/export`, {
  format: 'xlsx'
}, {
  responseType: 'blob'
});
```

---

## 📦 Экспорт свободных опросов

### Endpoint
```
POST /api/admin/export/custom-polls
```

### Аутентификация
Требуется JWT токен с ролью `admin`

### Параметры запроса (Body)

```json
{
  "filters": {
    "categoryFilter": "organizational | academic | extracurricular | feedback | all",
    "statusFilter": "active | closed | all",
    "creatorFilter": "student | admin | all"
  }
}
```

### Структура данных в Excel

**Лист 1: Свободные опросы**
- ID
- Название
- Категория
- Теги
- Создатель
- Роль создателя
- Дисциплина
- Голосов
- Целевое количество
- Охват %
- Статус
- Дата создания
- Дата закрытия

**Лист 2: Статистика**
- Всего опросов
- По категориям (4 категории)
- По статусу (активные, завершенные)
- По создателям (студенты, админы)

### Пример запроса

```javascript
const response = await api.post('/admin/export/custom-polls', {
  filters: {
    categoryFilter: 'academic',
    statusFilter: 'active',
    creatorFilter: 'all'
  }
}, {
  responseType: 'blob'
});
```

---

## 🎯 Использование в React компонентах

### Компонент QualityDashboard

```javascript
const handleExport = async (format, reportType = 'summary') => {
  setIsExporting(true);
  try {
    const endpoint = format === 'excel' 
      ? '/admin/export/excel'
      : `/admin/export/pdf/${reportType}`;
    
    const response = await api.post(endpoint, {
      type: 'analytics', // для Excel
      filters: filters    // текущие фильры из state
    }, {
      responseType: 'blob'
    });

    const blob = response.data;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = format === 'excel' 
      ? 'studvote_data.xlsx'
      : `studvote_report_${reportType}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error('Export error:', error);
    alert('Ошибка экспорта данных');
  } finally {
    setIsExporting(false);
  }
};
```

### Компонент PollResults

```javascript
const handleExport = async (format) => {
  setIsExporting(true);
  
  try {
    const response = await api.post(`/admin/polls/${id}/export`, 
      { format },
      { responseType: 'blob' }
    );
    
    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poll_results_${id}.${format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error('Export error:', error);
    alert('Ошибка экспорта данных');
  } finally {
    setIsExporting(false);
  }
};
```

---

## 🔧 Технические детали

### Зависимости
- `xlsx@^0.18.5` - создание Excel файлов
- `pdfkit@^0.17.2` - создание PDF файлов

### Middleware
Все экспортные endpoints защищены:
- `authenticate` - проверка JWT токена
- `isAdmin` - проверка роли администратора

### Лимиты
- Excel: нет лимита на количество строк
- PDF для опросов: первые 50 ответов (для оптимизации)
- PDF для аналитики: вся статистика

### Имена файлов
- Excel: `export_${timestamp}.xlsx`
- PDF: `report_${type}_${timestamp}.pdf`
- Poll export: `poll_results_${pollId}.${format}`
- Custom polls: `custom_polls.xlsx`

---

## 📝 Примечания

1. **Формат даты**: ISO 8601 (YYYY-MM-DD)
2. **ИКОП**: Рассчитывается по формуле `((avgRating - 1) / 4) * 100`
3. **Фильтры**: Значение `"all"` = без фильтрации по этому полю
4. **responseType**: Обязательно указывать `'blob'` в axios для бинарных данных

---

## ❓ FAQ

**Q: Почему экспорт возвращает пустой файл?**
A: Проверьте фильтры - возможно, нет данных, соответствующих заданным критериям.

**Q: Можно ли экспортировать только определённые поля?**
A: Нет, структура экспорта фиксирована для каждого типа.

**Q: Поддерживается ли экспорт в CSV?**
A: Нет, только Excel и PDF. Excel можно легко преобразовать в CSV.

**Q: Есть ли ограничение на размер экспорта?**
A: Нет жёстких ограничений, но для очень больших данных рекомендуется использовать фильтры.
