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
async function fetchJson(url, params = {}) {
  const { data } = await ruz.get(url, { params });
  return data;
}

module.exports = {
  fetchJson
};

