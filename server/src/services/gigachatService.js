const axios = require('axios');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

/**
 * Сервис для работы с GigaChat API
 */
class GigaChatService {
  constructor() {
    // Кэш для токена
    this.tokenCache = {
      token: null,
      expiresAt: null
    };

    // URLs для API
    this.authUrl = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
    this.chatUrl = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';

    // Создаём axios instance который игнорирует SSL ошибки (только для разработки!)
    this.axiosInstance = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
  }

  /**
   * Проверяет валидность закэшированного токена
   * @returns {boolean}
   */
  isTokenValid() {
    if (!this.tokenCache.token || !this.tokenCache.expiresAt) {
      return false;
    }

    // Добавляем буфер 1 минута перед истечением
    const now = Date.now();
    const bufferTime = 60 * 1000;
    return this.tokenCache.expiresAt > (now + bufferTime);
  }

  /**
   * Получает access token от GigaChat API с кэшированием
   * @returns {Promise<string|null>} Access token или null при ошибке
   */
  async getAccessToken() {
    try {
      // Проверяем кэш
      if (this.isTokenValid()) {
        console.log('[GigaChat] Используется закэшированный токен');
        return this.tokenCache.token;
      }

      console.log('[GigaChat] Получение нового токена...');

      // Проверяем наличие ключа
      if (!process.env.GIGACHAT_AUTH_KEY) {
        console.error('[GigaChat] GIGACHAT_AUTH_KEY не найден в .env');
        return null;
      }

      // Логирование для отладки (не выводим сам ключ по безопасности!)
      console.log('[GigaChat] GIGACHAT_AUTH_KEY присутствует:', !!process.env.GIGACHAT_AUTH_KEY);
      console.log('[GigaChat] Длина ключа:', process.env.GIGACHAT_AUTH_KEY?.length);

      // Запрос токена
      const response = await this.axiosInstance.post(
        this.authUrl,
        'scope=GIGACHAT_API_PERS',
        {
          headers: {
            'Authorization': `Basic ${process.env.GIGACHAT_AUTH_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'RqUID': uuidv4()
          }
        }
      );

      const { access_token, expires_at } = response.data;

      if (!access_token) {
        console.error('[GigaChat] Токен не получен');
        return null;
      }

      // Кэшируем токен
      this.tokenCache = {
        token: access_token,
        expiresAt: expires_at
      };

      console.log('[GigaChat] Токен успешно получен и закэширован');
      return access_token;

    } catch (error) {
      console.error('[GigaChat] Ошибка при получении токена:', error.message);
      if (error.response) {
        console.error('[GigaChat] Статус:', error.response.status);
        console.error('[GigaChat] Данные:', error.response.data);
      }
      return null;
    }
  }

  /**
   * Отправляет запрос к GigaChat API
   * @param {string} userPrompt - Промпт пользователя
   * @param {number} temperature - Температура генерации
   * @returns {Promise<string|null>} Ответ от GigaChat или null при ошибке
   */
  async sendChatRequest(userPrompt, temperature = 0.7) {
    try {
      // Получаем актуальный токен
      const token = await this.getAccessToken();
      if (!token) {
        return null;
      }

      console.log('[GigaChat] Отправка запроса...');

      // Запрос к GigaChat
      const response = await this.axiosInstance.post(
        this.chatUrl,
        {
          model: 'GigaChat',
          messages: [
            {
              role: 'user',
              content: userPrompt
            }
          ],
          temperature: temperature
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Извлекаем ответ
      const content = response.data?.choices?.[0]?.message?.content;

      if (!content) {
        console.error('[GigaChat] Пустой ответ от API');
        return null;
      }

      console.log('[GigaChat] Ответ успешно получен');
      return content;

    } catch (error) {
      console.error('[GigaChat] Ошибка при запросе:', error.message);
      if (error.response) {
        console.error('[GigaChat] Статус:', error.response.status);
        console.error('[GigaChat] Данные:', error.response.data);
      }
      return null;
    }
  }

  /**
   * Генерирует опрос на основе темы
   * @param {string} prompt - Тема опроса
   * @returns {Promise<Object|null>} Сгенерированный опрос или null при ошибке
   */
  async generatePoll(prompt) {
    try {
      if (!prompt || typeof prompt !== 'string') {
        console.error('[GigaChat] Некорректный промпт');
        return null;
      }

      console.log('[GigaChat] Генерация опроса на тему:', prompt);

      const userPrompt = `Создай опрос на тему: ${prompt}. Верни JSON в формате: {"title": "название опроса", "description": "описание опроса", "options": ["вариант 1", "вариант 2", "вариант 3"]}. Создай минимум 3 варианта ответа. Отвечай только JSON, без дополнительного текста.`;

      const response = await this.sendChatRequest(userPrompt, 0.7);

      if (!response) {
        return null;
      }

      // Парсим JSON из ответа
      const pollData = this.parseJSON(response);

      if (!pollData) {
        return null;
      }

      // Валидация структуры
      if (!pollData.title || !pollData.description || !Array.isArray(pollData.options)) {
        console.error('[GigaChat] Неверная структура ответа');
        return null;
      }

      if (pollData.options.length < 2) {
        console.error('[GigaChat] Недостаточно вариантов ответа');
        return null;
      }

      // Ограничиваем количество вариантов
      if (pollData.options.length > 10) {
        pollData.options = pollData.options.slice(0, 10);
      }

      console.log('[GigaChat] Опрос успешно сгенерирован');
      return {
        title: pollData.title,
        description: pollData.description,
        options: pollData.options
      };

    } catch (error) {
      console.error('[GigaChat] Ошибка при генерации опроса:', error.message);
      return null;
    }
  }

  /**
   * Генерирует варианты ответов для опроса
   * @param {string} pollTitle - Название опроса
   * @returns {Promise<Array<string>|null>} Массив вариантов или null при ошибке
   */
  async generateOptions(pollTitle) {
    try {
      if (!pollTitle || typeof pollTitle !== 'string') {
        console.error('[GigaChat] Некорректное название опроса');
        return null;
      }

      console.log('[GigaChat] Генерация вариантов для:', pollTitle);

      const userPrompt = `Предложи 4-5 вариантов ответов для опроса: "${pollTitle}". Верни JSON в формате: {"options": ["вариант 1", "вариант 2", "вариант 3", "вариант 4"]}. Отвечай только JSON, без дополнительного текста.`;

      const response = await this.sendChatRequest(userPrompt, 0.7);

      if (!response) {
        return null;
      }

      // Парсим JSON из ответа
      const data = this.parseJSON(response);

      if (!data) {
        return null;
      }

      // Валидация
      if (!Array.isArray(data.options) || data.options.length < 2) {
        console.error('[GigaChat] Неверная структура вариантов');
        return null;
      }

      // Ограничиваем количество
      if (data.options.length > 10) {
        data.options = data.options.slice(0, 10);
      }

      console.log('[GigaChat] Варианты успешно сгенерированы');
      return data.options;

    } catch (error) {
      console.error('[GigaChat] Ошибка при генерации вариантов:', error.message);
      return null;
    }
  }

  /**
   * Парсит JSON из ответа GigaChat
   * @param {string} response - Ответ от GigaChat
   * @returns {Object|null} Распарсенный JSON или null при ошибке
   */
  parseJSON(response) {
    try {
      let jsonString = response.trim();

      // Убираем markdown обёртки если есть
      jsonString = jsonString.replace(/```json\s*/g, '');
      jsonString = jsonString.replace(/```\s*/g, '');

      // Находим JSON блок
      const firstBrace = jsonString.indexOf('{');
      const lastBrace = jsonString.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1) {
        console.error('[GigaChat] JSON не найден в ответе');
        return null;
      }

      jsonString = jsonString.substring(firstBrace, lastBrace + 1);

      return JSON.parse(jsonString);

    } catch (error) {
      console.error('[GigaChat] Ошибка парсинга JSON:', error.message);
      console.error('[GigaChat] Ответ:', response);
      return null;
    }
  }

  /**
   * Генерирует анкету (форму) с вопросами разных типов
   * @param {string} prompt - Тема анкеты
   * @returns {Promise<Object|null>} Сгенерированная анкета или null при ошибке
   */
  async generateForm(prompt) {
    try {
      if (!prompt || typeof prompt !== 'string') {
        console.error('[GigaChat] Некорректный промпт для анкеты');
        return null;
      }

      console.log('[GigaChat] Генерация анкеты на тему:', prompt);

      const userPrompt = `Создай анкету на тему: ${prompt}.

Верни JSON в формате:
{
  "title": "название анкеты",
  "description": "краткое описание анкеты",
  "questions": [
    {
      "text": "Текст вопроса",
      "type": "single",
      "required": true,
      "options": ["вариант 1", "вариант 2", "вариант 3"]
    }
  ]
}

Требования:
1. Создай 3-7 вопросов разных типов
2. Типы вопросов: "single" (один вариант), "multiple" (несколько вариантов), "rating" (рейтинг 1-5), "text" (свободный ответ)
3. Для вопросов типа "single" и "multiple" добавь 3-5 вариантов ответов
4. Для вопросов типа "rating" и "text" массив options должен быть пустым []
5. Отмечай важные вопросы как required: true
6. Вопросы должны быть логичными и связанными с темой

Отвечай ТОЛЬКО JSON, без дополнительного текста и объяснений.`;

      const response = await this.sendChatRequest(userPrompt, 0.7);

      if (!response) {
        return null;
      }

      // Парсим JSON из ответа
      const formData = this.parseJSON(response);

      if (!formData) {
        return null;
      }

      // Валидация структуры
      if (!formData.title || !formData.description || !Array.isArray(formData.questions)) {
        console.error('[GigaChat] Неверная структура анкеты');
        return null;
      }

      if (formData.questions.length < 1) {
        console.error('[GigaChat] Недостаточно вопросов в анкете');
        return null;
      }

      // Валидация и нормализация вопросов
      const normalizedQuestions = formData.questions.map((q, index) => {
        // Генерируем уникальный ID для вопроса
        const question = {
          id: `q${index + 1}`,
          text: q.text || `Вопрос ${index + 1}`,
          type: ['single', 'multiple', 'rating', 'text'].includes(q.type) ? q.type : 'single',
          required: q.required === true,
          options: []
        };

        // Для single и multiple нужны варианты ответов
        if (question.type === 'single' || question.type === 'multiple') {
          if (Array.isArray(q.options) && q.options.length >= 2) {
            question.options = q.options.slice(0, 10); // Ограничиваем до 10 вариантов
          } else {
            // Если нет вариантов, создаем базовые
            question.options = ['Вариант 1', 'Вариант 2', 'Вариант 3'];
          }
        }

        // Для rating и text options должен быть пустым
        if (question.type === 'rating' || question.type === 'text') {
          question.options = [];
        }

        return question;
      });

      // Ограничиваем количество вопросов
      const limitedQuestions = normalizedQuestions.slice(0, 15);

      console.log('[GigaChat] Анкета успешно сгенерирована');
      console.log(`[GigaChat] Вопросов: ${limitedQuestions.length}`);
      
      return {
        title: formData.title,
        description: formData.description,
        questions: limitedQuestions
      };

    } catch (error) {
      console.error('[GigaChat] Ошибка при генерации анкеты:', error.message);
      return null;
    }
  }

  /**
   * Очищает кэш токена
   */
  clearCache() {
    this.tokenCache = {
      token: null,
      expiresAt: null
    };
    console.log('[GigaChat] Кэш токена очищен');
  }
}

// Экспортируем singleton
module.exports = new GigaChatService();
