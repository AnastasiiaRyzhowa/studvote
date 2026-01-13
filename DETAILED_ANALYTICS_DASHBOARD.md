# Детальный Дашборд Аналитики - Документация

## Обзор

**DetailedAnalyticsDashboard** - это comprehensive страница детальной аналитики опроса, предоставляющая студентам и администраторам глубокий анализ результатов с множеством визуализаций и статистических метрик.

## Путь к компоненту

```
client/src/pages/Student/DetailedAnalyticsDashboard.jsx
client/src/pages/Student/DetailedAnalyticsDashboard.css
```

## Роутинг

```
URL: /analytics/detailed/:pollId
Метод: GET
Требуется: Аутентификация
```

## Структура компонента

### 1. Шапка с основной информацией

**Отображает:**
- Название опроса
- Количество ответов (чип с иконкой)
- Дата проведения (если есть)
- Предмет (если есть)
- Преподаватель (если есть)
- Кнопки экспорта (PDF, Excel)
- Кнопка "Назад"

**Функционал:**
```javascript
<Button 
  variant="outlined" 
  startIcon={<DownloadIcon />}
  onClick={() => handleExport('PDF')}
>
  PDF
</Button>
```

### 2. Описательная статистика (4 карточки)

**Карточка 1: Средняя оценка**
- Среднее арифметическое всех оценок
- Диапазон: 1.00 - 5.00
- Визуализация: крупное число с подписью "из 5.0"

**Карточка 2: Медиана**
- Центральное значение (50-й перцентиль)
- Показывает типичную оценку
- Подпись: "центральное значение"

**Карточка 3: Стандартное отклонение**
- Мера разброса данных
- Чем выше, тем более разнородны мнения
- Подпись: "разброс значений"

**Карточка 4: ИКОП**
- Индекс Качества Образовательного Процесса
- Диапазон: 0-100
- Цветовая индикация:
  - **80-100**: Зелёный (success) - Отлично
  - **60-79**: Синий (info) - Хорошо
  - **40-59**: Жёлтый (warning) - Требует внимания
  - **0-39**: Красный (error) - Критично

**Расчёт статистики:**
```javascript
const calculateStats = () => {
  const ratings = Object.values(data.avgRatings);
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  
  const sorted = [...ratings].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  
  const variance = ratings.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / ratings.length;
  const stdDev = Math.sqrt(variance);
  
  return { mean, median, stdDev };
};
```

### 3. Детальные диаграммы по вопросам

**Переключатель типов визуализации:**
- **Bar (Столбцы)**: Средние оценки по вопросам
- **Pie (Круг)**: Распределение всех оценок (1-5 звёзд)
- **Boxplot (Боксплот)**: Распределение с квартилями (упрощённая версия)
- **Radar (Радар)**: Профиль опроса по всем параметрам

**Реализация ECharts:**

#### Bar Chart (Столбчатая диаграмма)
```javascript
option = {
  title: { text: 'Средние оценки по вопросам', left: 'center' },
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: labels, // Тексты вопросов
    axisLabel: {
      interval: 0,
      rotate: 45,
      formatter: (value) => value.length > 20 ? value.substring(0, 20) + '...' : value
    }
  },
  yAxis: {
    type: 'value',
    min: 1,
    max: 5,
    name: 'Оценка'
  },
  series: [{
    data: values, // Средние оценки
    type: 'bar',
    itemStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: '#83bff6' },
        { offset: 1, color: '#188df0' }
      ])
    },
    label: {
      show: true,
      position: 'top',
      formatter: '{c}'
    }
  }]
};
```

#### Pie Chart (Круговая диаграмма)
```javascript
const distribution = data.distribution || {}; // { 1: 2, 2: 3, 3: 5, 4: 8, 5: 12 }
const pieData = Object.keys(distribution).map(rating => ({
  name: `${rating} звезд`,
  value: distribution[rating]
}));

option = {
  title: { text: 'Распределение оценок', left: 'center' },
  tooltip: { trigger: 'item' },
  legend: {
    orient: 'vertical',
    left: 'left'
  },
  series: [{
    type: 'pie',
    radius: '50%',
    data: pieData,
    emphasis: {
      itemStyle: {
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowColor: 'rgba(0, 0, 0, 0.5)'
      }
    }
  }]
};
```

#### Radar Chart (Радарная диаграмма)
```javascript
const radarData = questionIds.map(qId => data.avgRatings[qId]);
const indicators = labels.map(label => ({
  name: label.length > 15 ? label.substring(0, 15) + '...' : label,
  max: 5
}));

option = {
  title: { text: 'Профиль опроса (радар)', left: 'center' },
  tooltip: {},
  radar: {
    indicator: indicators
  },
  series: [{
    type: 'radar',
    data: [{
      value: radarData,
      name: 'Средние оценки',
      areaStyle: {
        color: 'rgba(24, 144, 255, 0.2)'
      }
    }]
  }]
};
```

### 4. Манометр ИКОП (Gauge Chart)

**Визуальное представление интегрального показателя качества**

```javascript
option = {
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
          [0.4, '#FF6E76'],  // Критично (0-40)
          [0.6, '#FDDD60'],  // Требует внимания (40-60)
          [0.8, '#7CFFB2'],  // Хорошо (60-80)
          [1, '#58D9F9']     // Отлично (80-100)
        ]
      }
    },
    pointer: {
      itemStyle: { color: 'auto' }
    },
    detail: {
      valueAnimation: true,
      formatter: '{value}/100',
      color: 'auto',
      fontSize: 28,
      fontWeight: 'bold',
      offsetCenter: [0, '-15%']
    },
    title: {
      offsetCenter: [0, '30%'],
      fontSize: 16,
      color: '#666'
    },
    data: [{ 
      value: data.ikop || 0,
      name: data.zone || 'Н/Д'
    }]
  }]
};
```

**AI-анализ под манометром:**
```javascript
<Alert severity={
  data.ikop >= 80 ? 'success' :
  data.ikop >= 60 ? 'info' :
  data.ikop >= 40 ? 'warning' :
  'error'
}>
  {data.aiAnalysis || `ИКОП ${data.ikop}/100 (${data.zone})`}
</Alert>
```

### 5. Анализ текстовых отзывов

#### 5.1 Облако слов (Word Cloud)

**Визуализация частоты слов из комментариев**

```javascript
const wordData = data.topWords.map(item => ({
  name: item.word,
  value: item.count
}));

option = {
  title: {
    text: 'Облако слов из комментариев',
    left: 'center'
  },
  series: [{
    type: 'wordCloud',
    gridSize: 8,
    sizeRange: [12, 50],
    rotationRange: [-45, 45],
    shape: 'circle',
    width: '100%',
    height: '100%',
    textStyle: {
      fontFamily: 'sans-serif',
      fontWeight: 'bold',
      color: function () {
        return 'rgb(' + [
          Math.round(Math.random() * 160),
          Math.round(Math.random() * 160),
          Math.round(Math.random() * 160)
        ].join(',') + ')';
      }
    },
    data: wordData
  }]
};
```

#### 5.2 Таблица топ-10 слов

```javascript
<TableContainer>
  <Table size="small">
    <TableHead>
      <TableRow>
        <TableCell>Слово</TableCell>
        <TableCell align="right">Частота</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {data.topWords.slice(0, 10).map((item, idx) => (
        <TableRow key={idx}>
          <TableCell>{item.word}</TableCell>
          <TableCell align="right">{item.count}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</TableContainer>
```

#### 5.3 Биграммы (фразы из 2 слов)

**Пример данных:**
```json
{
  "topBigrams": [
    { "bigram": "мало практики", "count": 8 },
    { "bigram": "понятно объясняет", "count": 6 },
    { "bigram": "интересные примеры", "count": 5 }
  ]
}
```

#### 5.4 Анализ тональности

**3 карточки:**
- **Позитив** (зелёный фон): количество позитивных комментариев
- **Нейтрал** (жёлтый фон): количество нейтральных комментариев
- **Негатив** (красный фон): количество негативных комментариев

```javascript
<Grid container spacing={2}>
  <Grid item xs={4}>
    <Card sx={{ bgcolor: '#e8f5e9' }}>
      <CardContent>
        <Typography color="text.secondary">Позитив</Typography>
        <Typography variant="h4">{data.sentiment.positive || 0}</Typography>
      </CardContent>
    </Card>
  </Grid>
  <Grid item xs={4}>
    <Card sx={{ bgcolor: '#fff9c4' }}>
      <CardContent>
        <Typography color="text.secondary">Нейтрал</Typography>
        <Typography variant="h4">{data.sentiment.neutral || 0}</Typography>
      </CardContent>
    </Card>
  </Grid>
  <Grid item xs={4}>
    <Card sx={{ bgcolor: '#ffebee' }}>
      <CardContent>
        <Typography color="text.secondary">Негатив</Typography>
        <Typography variant="h4">{data.sentiment.negative || 0}</Typography>
      </CardContent>
    </Card>
  </Grid>
</Grid>
```

#### 5.5 Автоматические инсайты

**Извлечение проблем и сильных сторон:**

```javascript
{data.insights && (
  <Alert severity="info" icon={<InfoIcon />}>
    <Typography variant="subtitle2" gutterBottom>
      Автоматические инсайты:
    </Typography>
    {data.insights.problems && data.insights.problems.length > 0 && (
      <Box mb={1}>
        <Typography variant="body2">
          <strong>Проблемы:</strong> {data.insights.problems.join(', ')}
        </Typography>
      </Box>
    )}
    {data.insights.strengths && data.insights.strengths.length > 0 && (
      <Box>
        <Typography variant="body2">
          <strong>Сильные стороны:</strong> {data.insights.strengths.join(', ')}
        </Typography>
      </Box>
    )}
  </Alert>
)}
```

**Пример данных:**
```json
{
  "insights": {
    "problems": ["мало практики", "только теория", "скучно"],
    "strengths": ["понятно объясняет", "хорошие примеры", "интересные задачи"]
  }
}
```

### 6. Корреляционный анализ

#### 6.1 Heatmap (Матрица корреляций)

**Визуализация связей между всеми вопросами**

```javascript
const xLabels = Object.keys(data.correlationMatrix);
const yLabels = Object.keys(data.correlationMatrix);
const heatmapData = [];

xLabels.forEach((xLabel, xIdx) => {
  yLabels.forEach((yLabel, yIdx) => {
    const value = data.correlationMatrix[xLabel]?.[yLabel] || 0;
    heatmapData.push([xIdx, yIdx, value.toFixed(2)]);
  });
});

option = {
  title: { text: 'Матрица корреляций', left: 'center' },
  tooltip: {
    position: 'top',
    formatter: (params) => {
      const xLabel = data.questionTexts?.[xLabels[params.data[0]]] || `Q${xLabels[params.data[0]]}`;
      const yLabel = data.questionTexts?.[yLabels[params.data[1]]] || `Q${yLabels[params.data[1]]}`;
      return `${xLabel}<br/>${yLabel}<br/>Корреляция: ${params.data[2]}`;
    }
  },
  xAxis: {
    type: 'category',
    data: xLabels.map(id => `Q${id}`),
    splitArea: { show: true }
  },
  yAxis: {
    type: 'category',
    data: yLabels.map(id => `Q${id}`),
    splitArea: { show: true }
  },
  visualMap: {
    min: -1,
    max: 1,
    calculable: true,
    orient: 'horizontal',
    left: 'center',
    bottom: '5%',
    inRange: {
      color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', 
              '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']
    }
  },
  series: [{
    type: 'heatmap',
    data: heatmapData,
    label: {
      show: true
    },
    emphasis: {
      itemStyle: {
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.5)'
      }
    }
  }]
};
```

**Интерпретация цветов:**
- **Тёмно-синий (-1)**: Сильная отрицательная корреляция
- **Жёлтый (0)**: Нет корреляции
- **Тёмно-красный (+1)**: Сильная положительная корреляция

#### 6.2 Scatter Plot (Оценки ↔ Тональность)

**Показывает связь между числовыми оценками и эмоциональным тоном комментариев**

```javascript
const scatterData = [];
if (data.responses) {
  data.responses.forEach(resp => {
    const avgRating = Object.values(resp.answers || {})
      .filter(v => typeof v === 'number')
      .reduce((sum, val, _, arr) => sum + val / arr.length, 0);
    
    const sentiment = calculateSentiment(resp.comments); // -1 to 1
    scatterData.push([avgRating, sentiment]);
  });
}

option = {
  title: { text: 'Корреляция: Оценки ↔ Тональность', left: 'center' },
  tooltip: {
    trigger: 'item',
    formatter: (params) => `Оценка: ${params.data[0].toFixed(2)}<br/>Тональность: ${params.data[1].toFixed(2)}`
  },
  xAxis: {
    type: 'value',
    name: 'Средняя оценка',
    min: 1,
    max: 5
  },
  yAxis: {
    type: 'value',
    name: 'Тональность',
    min: -1,
    max: 1
  },
  series: [{
    type: 'scatter',
    data: scatterData,
    symbolSize: 10,
    itemStyle: {
      color: 'rgba(24, 144, 255, 0.6)'
    }
  }]
};
```

**Alert с коэффициентом:**
```javascript
<Alert severity="info" sx={{ mt: 2 }}>
  Коэффициент Пирсона: <strong>{data.ratingSentimentCorrelation.toFixed(2)}</strong>
  {data.ratingSentimentCorrelation > 0.7 && ' (Сильная положительная связь)'}
  {data.ratingSentimentCorrelation > 0.4 && data.ratingSentimentCorrelation <= 0.7 && ' (Умеренная связь)'}
  {data.ratingSentimentCorrelation <= 0.4 && ' (Слабая связь)'}
</Alert>
```

#### 6.3 Топ-3 самых сильных корреляций

**Автоматическое выявление значимых связей**

```javascript
{data.topCorrelations && data.topCorrelations.map((corr, idx) => (
  <Alert 
    key={idx} 
    severity={Math.abs(corr.correlation) > 0.7 ? 'success' : 'info'}
    sx={{ mb: 1 }}
  >
    <Typography variant="body2">
      <strong>{corr.label1} ↔ {corr.label2}</strong>: {corr.correlation.toFixed(2)}
    </Typography>
    <Typography variant="body2" color="text.secondary">
      {corr.interpretation}
    </Typography>
  </Alert>
))}
```

**Пример данных:**
```json
{
  "topCorrelations": [
    {
      "q1Id": 1,
      "q2Id": 2,
      "correlation": 0.89,
      "label1": "Понятность",
      "label2": "Вовлечённость",
      "interpretation": "Очень сильная связь: когда Понятность высокая, Вовлечённость тоже высокая"
    },
    {
      "q1Id": 3,
      "q2Id": 1,
      "correlation": 0.78,
      "label1": "Практика",
      "label2": "Актуальность",
      "interpretation": "Сильная связь: Практика существенно влияет на Актуальность"
    }
  ]
}
```

### 7. Детализация по вопросам (Таблица)

**Итоговая таблица со всеми вопросами и их оценками**

```javascript
<Table>
  <TableHead>
    <TableRow>
      <TableCell>Вопрос</TableCell>
      <TableCell align="center">Средняя оценка</TableCell>
      <TableCell align="center">Статус</TableCell>
    </TableRow>
  </TableHead>
  <TableBody>
    {Object.keys(data.avgRatings).map(qId => {
      const rating = data.avgRatings[qId];
      const text = data.questionTexts?.[qId] || `Вопрос ${qId}`;
      let status = '';
      let color = '';
      
      if (rating >= 4.5) {
        status = 'Отлично';
        color = 'success.main';
      } else if (rating >= 4.0) {
        status = 'Хорошо';
        color = 'info.main';
      } else if (rating >= 3.5) {
        status = 'Удовлетворительно';
        color = 'warning.main';
      } else {
        status = 'Требует внимания';
        color = 'error.main';
      }
      
      return (
        <TableRow key={qId}>
          <TableCell>{text}</TableCell>
          <TableCell align="center">
            <Typography fontWeight="bold">
              {rating.toFixed(2)} / 5.0
            </Typography>
          </TableCell>
          <TableCell align="center">
            <Chip 
              label={status} 
              size="small"
              sx={{ bgcolor: color, color: 'white' }}
            />
          </TableCell>
        </TableRow>
      );
    })}
  </TableBody>
</Table>
```

## API Endpoint

### GET /api/analytics/detailed/:pollId

**Response структура:**
```json
{
  "poll": {
    "_id": "...",
    "title": "Оценка дисциплины: Математика",
    "lessonContext": {
      "subject": "Математика",
      "teacher": "Иванова И.И.",
      "date": "2025-01-12",
      "group": "ИВБО-03-20"
    }
  },
  "ikop": 68,
  "zone": "Хорошо",
  "avgRatings": {
    "1": 4.2,
    "2": 4.5,
    "3": 3.8,
    "4": 4.1,
    "5": 4.0
  },
  "questionTexts": {
    "1": "Актуальность темы",
    "2": "Понятность",
    "3": "Практика",
    "4": "Вовлечённость",
    "5": "Организация"
  },
  "distribution": {
    "1": 2,
    "2": 3,
    "3": 5,
    "4": 8,
    "5": 12
  },
  "totalResponses": 30,
  "topWords": [
    { "word": "практика", "count": 15 },
    { "word": "понятно", "count": 12 },
    { "word": "примеры", "count": 10 }
  ],
  "topBigrams": [
    { "bigram": "мало практики", "count": 8 },
    { "bigram": "понятно объясняет", "count": 6 }
  ],
  "sentiment": {
    "positive": 18,
    "neutral": 12,
    "negative": 5
  },
  "insights": {
    "problems": ["мало практики", "только теория"],
    "strengths": ["понятно объясняет", "хорошие примеры"]
  },
  "correlationMatrix": {
    "1": { "1": 1.00, "2": 0.65, "3": 0.78, "4": 0.43, "5": 0.52 },
    "2": { "1": 0.65, "2": 1.00, "3": 0.55, "4": 0.89, "5": 0.65 },
    "3": { "1": 0.78, "2": 0.55, "3": 1.00, "4": 0.48, "5": 0.39 },
    "4": { "1": 0.43, "2": 0.89, "3": 0.48, "4": 1.00, "5": 0.58 },
    "5": { "1": 0.52, "2": 0.65, "3": 0.39, "4": 0.58, "5": 1.00 }
  },
  "ratingSentimentCorrelation": 0.73,
  "topCorrelations": [
    {
      "q1Id": 2,
      "q2Id": 4,
      "correlation": 0.89,
      "label1": "Понятность",
      "label2": "Вовлечённость",
      "interpretation": "Очень сильная связь: когда Понятность высокая, Вовлечённость тоже высокая"
    },
    {
      "q1Id": 1,
      "q2Id": 3,
      "correlation": 0.78,
      "label1": "Актуальность",
      "label2": "Практика",
      "interpretation": "Сильная связь: Актуальность существенно влияет на Практика"
    },
    {
      "q1Id": 2,
      "q2Id": 5,
      "correlation": 0.65,
      "label1": "Понятность",
      "label2": "Организация",
      "interpretation": "Сильная связь: Понятность существенно влияет на Организация"
    }
  ],
  "aiAnalysis": "ИКОП 68/100 (Хорошо). Лучшее: Понятность объяснений (4.5/5). Слабее: Практическая ценность (3.8/5). Рекомендации: Увеличить долю практических заданий."
}
```

## Использование

### Навигация к дашборду

**1. После голосования:**
```javascript
// В VoteResults.jsx
<button onClick={() => navigate(`/analytics/detailed/${pollId}`)}>
  Детальная аналитика →
</button>
```

**2. Прямая ссылка:**
```javascript
navigate(`/analytics/detailed/507f1f77bcf86cd799439011`);
```

**3. Из списка опросов:**
```jsx
<IconButton onClick={() => navigate(`/analytics/detailed/${poll._id}`)}>
  <AssessmentIcon />
</IconButton>
```

## Адаптивность

**Breakpoints:**
- **Desktop (>1200px)**: Полная версия с широкими графиками
- **Tablet (600-1200px)**: Адаптированная сетка (2 колонки вместо 4)
- **Mobile (<600px)**: Одна колонка, упрощённые графики

**Особенности:**
- Все графики автоматически ресайзятся при изменении размера окна
- Таблицы со скроллом на мобильных устройствах
- Переключатели типов графиков трансформируются в вертикальный список на мобильных

## Производительность

**Оптимизации:**
- `useMemo` для вычисления статистики
- `useEffect` с зависимостями для перерисовки графиков
- Lazy loading для больших таблиц
- Dispose ECharts инстансов при размонтировании

## Будущие улучшения

### Экспорт в PDF/Excel
```javascript
const handleExport = async (format) => {
  if (format === 'PDF') {
    // jsPDF + html2canvas
    const pdf = new jsPDF('p', 'mm', 'a4');
    const element = document.getElementById('analytics-container');
    const canvas = await html2canvas(element);
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 10, 10, 190, 0);
    pdf.save(`analytics-${pollId}.pdf`);
  } else if (format === 'Excel') {
    // xlsx library
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'Analytics');
    XLSX.writeFile(wb, `analytics-${pollId}.xlsx`);
  }
};
```

### Фильтр по датам
```javascript
<DateRangePicker
  startDate={startDate}
  endDate={endDate}
  onChange={({start, end}) => {
    setStartDate(start);
    setEndDate(end);
    loadAnalytics(start, end);
  }}
/>
```

### Сравнение с другими опросами
```javascript
<Select
  label="Сравнить с"
  options={otherPolls}
  onChange={(pollId) => setComparePollId(pollId)}
/>
```

### Печать
```css
@media print {
  .export-buttons,
  .toggle-group {
    display: none;
  }
  
  .chart-container {
    page-break-inside: avoid;
  }
  
  body {
    font-size: 12pt;
  }
}
```

## Troubleshooting

**Проблема: Графики не отображаются**
- Проверьте, что `echarts` и `echarts-wordcloud` установлены
- Убедитесь, что контейнеры имеют заданную высоту
- Проверьте console на наличие ошибок

**Проблема: Данные не загружаются**
- Проверьте, что API endpoint доступен
- Убедитесь, что pollId корректный
- Проверьте токен аутентификации

**Проблема: Медленная загрузка**
- Используйте пагинацию для больших данных
- Добавьте кэширование на backend
- Оптимизируйте расчёт корреляций

## Зависимости

```json
{
  "dependencies": {
    "@mui/material": "^5.14.0",
    "@mui/icons-material": "^5.14.0",
    "echarts": "^5.4.3",
    "echarts-wordcloud": "^2.1.0",
    "react": "^18.2.0",
    "react-router-dom": "^6.15.0",
    "axios": "^1.5.0"
  }
}
```

## Автор

Дмитриева Анастасия, 2026

## Лицензия

MIT
