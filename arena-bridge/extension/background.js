'use strict';

/**
 * Service worker расширения arena-bridge.
 *
 * Единственное место, где живёт токен и выполняются HTTP-запросы к локальному
 * bridge-серверу. Content script общается с ним через chrome.runtime.sendMessage.
 */

const DEFAULT_SETTINGS = {
  serverUrl: 'http://127.0.0.1:7842',
  token: '',
  workdir: '',
};

const EXEC_TIMEOUT_MS = 30 * 60 * 1000; // потолок для длительных сборок

async function getSettings() {
  try {
    const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
    return Object.assign({}, DEFAULT_SETTINGS, stored);
  } catch (_) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}

/** HTTP-обёртка над локальным сервером. */
async function api(pathname, options = {}) {
  const settings = await getSettings();
  const base = String(settings.serverUrl || DEFAULT_SETTINGS.serverUrl).replace(/\/+$/, '');
  let url;
  try {
    url = new URL(base + pathname);
  } catch (e) {
    return { ok: false, status: 0, error: `Некорректный адрес сервера: ${settings.serverUrl}` };
  }

  const headers = { Accept: 'application/json' };
  if (settings.token) headers['X-Token'] = settings.token;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 20000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = null;
    }
    if (!res.ok) {
      // reason — самая конкретная причина (политика безопасности), message — общая.
      const message = (data && (data.reason || data.message || data.error)) || `HTTP ${res.status}`;
      return { ok: false, status: res.status, data, error: message };
    }
    return { ok: true, status: res.status, data, raw: text };
  } catch (e) {
    const aborted = e && e.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      data: null,
      error: aborted
        ? `Таймаут ${Math.round(timeoutMs / 1000)} с`
        : `Нет связи с bridge-сервером (${(e && e.message) || e}). Проверьте, что сервер запущен.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

const handlers = {
  'bridge:health': async () => api('/health', { timeoutMs: 5000 }),

  'bridge:status': async () => api('/status', { timeoutMs: 8000 }),

  'bridge:config': async () => api('/config', { timeoutMs: 8000 }),

  'bridge:config:save': async (message) => api('/config', {
    method: 'PUT',
    body: message.payload || {},
    timeoutMs: 8000,
  }),

  'bridge:exec': async (message) => api('/exec', {
    method: 'POST',
    body: {
      command: message.command,
      cwd: message.cwd || undefined,
      timeoutMs: message.timeoutMs || undefined,
    },
    timeoutMs: EXEC_TIMEOUT_MS,
  }),

  'bridge:history': async () => api('/history', { timeoutMs: 8000 }),

  'bridge:history:clear': async () => api('/history', { method: 'DELETE', timeoutMs: 8000 }),

  'bridge:file': async (message) => {
    const settings = await getSettings();
    const base = String(settings.serverUrl || DEFAULT_SETTINGS.serverUrl).replace(/\/+$/, '');
    const url = new URL(base + '/file/' + encodeURIComponent(message.name || ''));
    if (settings.token) url.searchParams.set('token', settings.token);
    try {
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) {
        return { ok: false, error: `Не удалось получить файл (HTTP ${res.status})` };
      }
      const text = await res.text();
      return { ok: true, name: message.name, text, size: text.length };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'ошибка загрузки файла' };
    }
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;
  const handler = handlers[message.type];
  if (!handler) {
    sendResponse({ ok: false, error: `Неизвестный тип сообщения: ${message.type}` });
    return false;
  }
  Promise.resolve(handler(message, sender))
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ ok: false, error: (err && err.message) || String(err) }));
  return true; // асинхронный ответ
});
