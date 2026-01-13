const axios = require('axios');
const qs = require('qs');

const ruz = axios.create({
  baseURL: 'https://ruz.fa.ru/api',
  timeout: 10000,
  paramsSerializer: (params) => qs.stringify(params, { arrayFormat: 'repeat' }),
  headers: {
    'User-Agent': 'StudVote/1.0',
    Accept: 'application/json, text/plain, */*'
  }
});

/**
 * Выполняет GET к RUZ с параметрами.
 * @param {string} url
 * @param {object} params
 * @returns {Promise<any>}
 */
async function fetchJson(url, params = {}, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const { data } = await ruz.get(url, { params });
      return data;
    } catch (error) {
      lastErr = error;
      const isLast = i === attempts;
      if (isLast) break;
      // экспоненциальная пауза: 0.5s, 1s, 1.5s...
      await new Promise(res => setTimeout(res, 500 * i));
    }
  }
  throw lastErr;
}

async function searchTeachers(term, attempts = 3) {
  if (!term || String(term).trim().length < 2) return [];
  const q = term.trim();
  const variants = [
    { url: '/search', params: { term: q, type: 'person' } },
    { url: '/search/teachers', params: { term: q } },
    { url: '/search', params: { term: q, type: 'teacher' } },
    { url: '/search', params: { term: q, type: 'lecturer' } }
  ];

  let lastErr;
  for (const v of variants) {
    try {
      const data = await fetchJson(v.url, v.params, attempts);
      // В RUZ может прийти data.items или массив
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.teachers)) return data.teachers;
      if (Array.isArray(data?.items)) return data.items;
      return data;
    } catch (e) {
      lastErr = e;
      // continue to next variant
    }
  }
  throw lastErr;
}

module.exports = {
  fetchJson,
  searchTeachers
};

