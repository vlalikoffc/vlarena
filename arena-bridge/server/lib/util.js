'use strict';

/** Небольшой набор утилит: HTTP-ответы, чтение тела запроса, сравнение токенов. */

const crypto = require('crypto');

const MAX_BODY_BYTES = 64 * 1024; // 64 КБ — достаточно для одной команды

/** Отправить JSON-ответ. */
function json(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** Отправить текстовый ответ (используется для скачивания логов). */
function text(res, statusCode, body, contentType, extraHeaders) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(statusCode, Object.assign({
    'Content-Type': contentType || 'text/plain; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  }, extraHeaders || {}));
  res.end(buf);
}

/** Прочитать тело запроса с лимитом по размеру. */
function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;

    const finish = (err, value) => {
      if (done) return;
      done = true;
      if (err) reject(err);
      else resolve(value);
    };

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const err = new Error('request_too_large');
        err.statusCode = 413;
        req.destroy();
        finish(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')));
    req.on('error', (e) => finish(e));
  });
}

/** Достать токен из заголовка X-Token или query-параметра ?token= (для <a download>). */
function extractToken(req, parsedUrl) {
  const header = req.headers['x-token'];
  if (typeof header === 'string' && header.length) return header.trim();
  if (parsedUrl && parsedUrl.searchParams) {
    const q = parsedUrl.searchParams.get('token');
    if (q) return q.trim();
  }
  return '';
}

/** Сравнение строк за постоянное время (защита от timing-атак на токен). */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) {
    // всё равно делаем сравнение, чтобы время не зависело от длины
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Сгенерировать токен сопряжения. */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** Безопасное имя файла: только буквы, цифры, точка, дефис, подчёркивание. */
function safeFileName(name) {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  return base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
}

/** ISO-метка времени для имени файла. */
function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

module.exports = {
  MAX_BODY_BYTES,
  json,
  text,
  readBody,
  extractToken,
  safeEqual,
  generateToken,
  safeFileName,
  timestampSlug,
};
