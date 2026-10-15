'use strict';

/** Popup расширения arena-bridge: статус сервера, токен, allowlist, история. */

const $ = (id) => document.getElementById(id);

const INSTRUCTIONS = `Ты работаешь в среде arena.ai. У пользователя есть локальный ПК (Windows, JDK, Maven/Gradle, Node.js).
Чтобы выполнить команду на его ПК, используй блок:

<<<LOCAL_CMD>>>
<команда>
<<<END>>>

Правила:
- Блок LOCAL_CMD — единственный способ выполнить команду локально.
- Не выполняй деструктивные команды без явного запроса пользователя.
- Для больших выводов не дублируй их в чате: достаточно блока с командой.
- После выполнения пользователь прикрепит файл с выводом — прочитай его и продолжи работу.
- Если команда не входит в allowlist пользователя, попроси его добавить её в popup расширения.`;

function send(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: 'Пустой ответ' });
      });
    } catch (e) {
      resolve({ ok: false, error: (e && e.message) || String(e) });
    }
  });
}

function setStatus(text, ok) {
  const node = $('status-text');
  node.textContent = text;
  node.style.color = ok === true ? 'var(--ok)' : ok === false ? 'var(--error)' : 'var(--muted)';
  const dot = $('status-dot');
  dot.className = 'dot ' + (ok === true ? 'dot--on' : ok === false ? 'dot--off' : '');
}

/** Загрузить настройки расширения в форму. */
async function loadSettings() {
  const stored = await chrome.storage.local.get({
    serverUrl: 'http://127.0.0.1:7842',
    token: '',
    workdir: '',
  });
  $('server-url').value = stored.serverUrl || 'http://127.0.0.1:7842';
  $('token').value = stored.token || '';
  $('workdir').value = stored.workdir || '';
}

/** Сохранить настройки расширения. */
async function saveSettings() {
  const serverUrl = $('server-url').value.trim();
  const token = $('token').value.trim();
  const workdir = $('workdir').value.trim();

  await chrome.storage.local.set({ serverUrl, token, workdir });
  setStatus('Настройки сохранены', true);
  await checkServer();
  await loadConfig();
  await loadHistory();
}

/** Проверить доступность сервера. */
async function checkServer() {
  setStatus('Проверяю сервер…');
  const res = await send({ type: 'bridge:health' });
  if (!res.ok) {
    setStatus(`Сервер недоступен: ${res.error}`, false);
    return;
  }
  const data = res.data || {};
  setStatus(`Сервер доступен (arena-bridge ${data.version || '?'})`, true);
}

/** Загрузить конфиг сервера (allowlist/denylist/workdir). */
async function loadConfig() {
  const res = await send({ type: 'bridge:config' });
  if (!res.ok) {
    return;
  }
  const data = res.data || {};
  if (Array.isArray(data.allowedCommands)) {
    $('allowlist').value = data.allowedCommands.join('\n');
  }
  if (Array.isArray(data.deniedPatterns)) {
    $('denylist').value = data.deniedPatterns.join('\n');
  }
  if (data.workdir && !$('workdir').value) {
    $('workdir').value = data.workdir;
  }
}

/** Сохранить allowlist/denylist/workdir на сервере. */
async function saveConfig() {
  const allowedCommands = $('allowlist').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const deniedPatterns = $('denylist').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const workdir = $('workdir').value.trim();

  const payload = { allowedCommands, deniedPatterns };
  if (workdir) payload.workdir = workdir;

  const res = await send({ type: 'bridge:config:save', payload });
  if (!res.ok) {
    setStatus(`Не удалось сохранить конфиг: ${res.error}`, false);
    return;
  }
  setStatus('Конфиг сохранён на сервере', true);
}

/** Показать историю выполненных команд. */
async function loadHistory() {
  const res = await send({ type: 'bridge:history' });
  const list = $('history');
  list.textContent = '';
  if (!res.ok) {
    const item = document.createElement('li');
    item.textContent = `История недоступна: ${res.error}`;
    list.appendChild(item);
    return;
  }
  const entries = (res.data && res.data.entries) || [];
  if (!entries.length) {
    const item = document.createElement('li');
    item.className = 'muted';
    item.textContent = 'Пока пусто';
    list.appendChild(item);
    return;
  }

  for (const entry of entries.slice(0, 20)) {
    const item = document.createElement('li');

    const cmd = document.createElement('div');
    cmd.className = 'history__cmd';
    cmd.textContent = entry.command;
    cmd.title = 'Нажмите, чтобы скопировать';
    cmd.addEventListener('click', () => {
      navigator.clipboard.writeText(entry.command).catch(() => {});
    });

    const meta = document.createElement('div');
    meta.className = 'history__meta';
    const when = entry.ts ? new Date(entry.ts).toLocaleString() : '';
    const state = entry.status === 'denied' ? 'отклонена' : (entry.exitCode === 0 ? 'ок' : 'ошибка');
    meta.textContent = `${when} · exit ${entry.exitCode} · ${state}`;
    if (entry.status === 'denied' || entry.exitCode !== 0) {
      meta.classList.add('history__err');
    }

    item.append(cmd, meta);
    list.appendChild(item);
  }
}

function bindEvents() {
  $('save-settings').addEventListener('click', () => { saveSettings(); });
  $('check').addEventListener('click', () => { checkServer(); });
  $('save-config').addEventListener('click', () => { saveConfig(); });
  $('reload-config').addEventListener('click', () => { loadConfig(); });
  $('clear-history').addEventListener('click', async () => {
    await send({ type: 'bridge:history:clear' });
    await loadHistory();
  });
  $('toggle-token').addEventListener('click', () => {
    const input = $('token');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  $('copy-instructions').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(INSTRUCTIONS);
      setStatus('Инструкция скопирована в буфер обмена', true);
    } catch (e) {
      setStatus(`Не удалось скопировать: ${(e && e.message) || e}`, false);
    }
  });
}

bindEvents();
loadSettings().then(() => {
  checkServer();
  loadConfig();
  loadHistory();
});
