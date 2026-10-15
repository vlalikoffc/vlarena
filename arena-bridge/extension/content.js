(() => {
  'use strict';

  /**
   * Content script arena-bridge.
   *
   * Ищет в чате блоки вида
   *   <<<LOCAL_CMD>>>
   *   mvn -q -o clean package
   *   <<<END>>>
   * и рисует под ними панель: запуск на локальном ПК (с подтверждением),
   * предпросмотр результата, прикрепление файла вывода в чат.
   */

  if (window.__arenaBridgeContentLoaded) return;
  window.__arenaBridgeContentLoaded = true;

  const markers = (typeof globalThis !== 'undefined' && globalThis.ArenaBridgeMarkers) || null;
  const START = (markers && markers.START) || '<<<LOCAL_CMD>>>';
  const END = (markers && markers.END) || '<<<END>>>';
  const PROCESSED_ATTR = 'abProcessed';
  const PANEL_CLASS = 'ab-panel';

  let defaultCwd = '';
  let serverUrl = 'http://127.0.0.1:7842';
  let settingsLoaded = false;

  // ---------------------------------------------------------------- утилиты

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Сообщение в background service worker. */
  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message || 'Контекст расширения сброшен' });
            return;
          }
          resolve(response || { ok: false, error: 'Пустой ответ от background' });
        });
      } catch (e) {
        resolve({ ok: false, error: (e && e.message) || String(e) });
      }
    });
  }

  /** Создать DOM-элемент. */
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    if (props.className) node.className = props.className;
    if (props.text !== undefined) node.textContent = props.text;
    if (props.title) node.title = props.title;
    if (props.type) node.type = props.type;
    if (props.value !== undefined) node.value = props.value;
    if (props.placeholder) node.placeholder = props.placeholder;
    if (props.dataset) Object.assign(node.dataset, props.dataset);
    if (props.attrs) {
      for (const [key, value] of Object.entries(props.attrs)) node.setAttribute(key, value);
    }
    if (props.on) {
      for (const [event, handler] of Object.entries(props.on)) node.addEventListener(event, handler);
    }
    for (const child of [].concat(children)) {
      if (child === null || child === undefined) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function setStatus(node, text, kind) {
    node.textContent = text || '';
    node.dataset.kind = kind || 'info';
  }

  // ------------------------------------------------------- поиск блоков в DOM

  /** Текстовые узлы, содержащие маркер начала блока. */
  function findMarkerNodes(root) {
    if (markers) return markers.findMarkerNodes(root);
    const found = [];
    if (!root) return found;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.includes(START)) found.push(node);
    }
    return found;
  }

  /** Наименьший элемент, содержащий и начало, и конец блока. */
  function findBlockContainer(startNode) {
    if (markers) return markers.findBlockContainer(startNode, document.body);
    let element = startNode && startNode.parentElement;
    while (element && element !== document.body) {
      const text = element.textContent || '';
      if (text.includes(START) && text.includes(END)) return element;
      element = element.parentElement;
    }
    return null;
  }

  /** Разобрать все блоки команд внутри контейнера. */
  function parseBlocks(container) {
    if (markers) return markers.parseBlocks(container.textContent || '');
    const text = container.textContent || '';
    const blocks = [];
    let cursor = 0;
    for (;;) {
      const startIndex = text.indexOf(START, cursor);
      if (startIndex < 0) break;
      const endIndex = text.indexOf(END, startIndex + START.length);
      if (endIndex < 0) break;
      const command = text.slice(startIndex + START.length, endIndex).trim();
      if (command) blocks.push(command);
      cursor = endIndex + END.length;
    }
    return blocks;
  }

  // ------------------------------------------------------------ панель

  function buildPanel(command) {
    const panel = el('div', { className: PANEL_CLASS, attrs: { 'data-ab-panel': '1' } });

    panel.appendChild(el('div', {
      className: 'ab-panel__title',
      text: 'arena-bridge · выполнить на вашем ПК',
    }));

    const cmdBox = el('pre', { className: 'ab-panel__cmd', text: command });
    panel.appendChild(cmdBox);

    const cwdInput = el('input', {
      className: 'ab-panel__cwd',
      type: 'text',
      placeholder: 'Рабочая папка (на ПК)',
      title: 'Папка, в которой будет выполнена команда',
    });
    cwdInput.value = defaultCwd;

    const runBtn = el('button', {
      className: 'ab-panel__btn ab-panel__btn--primary',
      type: 'button',
      text: 'Выполнить локально',
    });

    const status = el('div', { className: 'ab-panel__status' });
    const output = el('pre', { className: 'ab-panel__out' });
    output.hidden = true;

    const actions = el('div', { className: 'ab-panel__actions' });
    actions.hidden = true;

    const attachBtn = el('button', { className: 'ab-panel__btn', type: 'button', text: 'Прикрепить к чату' });
    const downloadBtn = el('button', { className: 'ab-panel__btn', type: 'button', text: 'Скачать .log' });
    const copyPathBtn = el('button', { className: 'ab-panel__btn', type: 'button', text: 'Копировать путь' });
    const fullLogBtn = el('button', { className: 'ab-panel__btn', type: 'button', text: 'Показать полный лог' });

    actions.append(attachBtn, downloadBtn, copyPathBtn, fullLogBtn);

    const row = el('div', { className: 'ab-panel__row' }, [cwdInput, runBtn]);
    panel.append(row, status, output, actions);

    return { panel, cmdBox, cwdInput, runBtn, status, output, actions, attachBtn, downloadBtn, copyPathBtn, fullLogBtn };
  }

  /** Двухшаговое подтверждение: первый клик — «Подтвердить», второй — запуск. */
  function armRun(parts, onRun) {
    let armed = false;
    let timer = null;

    const reset = () => {
      armed = false;
      parts.runBtn.textContent = 'Выполнить локально';
      parts.panel.classList.remove('ab-panel--armed');
      if (timer) clearTimeout(timer);
      timer = null;
    };

    parts.runBtn.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        parts.runBtn.textContent = 'Подтвердить выполнение';
        parts.panel.classList.add('ab-panel--armed');
        setStatus(parts.status, 'Команда будет выполнена на вашем ПК. Нажмите ещё раз для подтверждения.', 'warn');
        timer = setTimeout(reset, 60000);
        return;
      }
      reset();
      await onRun();
    });
  }

  // ------------------------------------------------------------- запуск

  function formatDuration(ms) {
    if (!ms && ms !== 0) return '';
    if (ms < 1000) return `${ms} мс`;
    return `${(ms / 1000).toFixed(1)} с`;
  }

  async function execute(parts, command) {
    const cwd = (parts.cwdInput.value || '').trim() || defaultCwd;

    parts.runBtn.disabled = true;
    parts.actions.hidden = true;
    parts.output.hidden = true;
    parts.output.textContent = '';
    setStatus(parts.status, 'Выполняется… (сборка может занять несколько минут)', 'busy');

    let res = await send({ type: 'bridge:exec', command, cwd });

    // Фолбэк: если service worker был выгружен, пробуем выполнить запрос напрямую.
    if (!res.ok && /context|invalidated|отключ/i.test(String(res.error || ''))) {
      res = await directExec(command, cwd);
    }

    parts.runBtn.disabled = false;

    if (!res.ok) {
      const reason = (res.data && (res.data.reason || res.data.message)) || res.error || 'неизвестная ошибка';
      setStatus(parts.status, `Ошибка: ${reason}`, 'error');
      return;
    }

    const data = res.data || {};
    const exitCode = data.exitCode;
    const ok = exitCode === 0;
    const kind = ok ? 'ok' : 'error';
    const flags = [];
    if (data.killed) flags.push('процесс прерван');
    if (data.truncated) flags.push('вывод обрезан');
    if (data.timedOut) flags.push('таймаут');

    setStatus(
      parts.status,
      `Готово: exit code ${exitCode === null ? 'n/a' : exitCode}, ${formatDuration(data.durationMs)}`
      + `${flags.length ? ` (${flags.join(', ')})` : ''} · файл ${data.file}`,
      kind,
    );

    parts.output.hidden = false;
    parts.output.textContent = data.preview || '(пустой вывод)';
    parts.actions.hidden = false;

    parts.panel.dataset.abFile = data.file || '';
    parts.panel.dataset.abPath = data.filePath || '';

    parts.attachBtn.onclick = () => attachToChat(parts, data.file);
    parts.downloadBtn.onclick = () => downloadFile(parts, data.file);
    parts.copyPathBtn.onclick = () => copyToClipboard(parts, data.filePath || data.file, 'Путь скопирован');
    parts.fullLogBtn.onclick = () => showFullLog(parts, data.file);
  }

  /** Прямой запрос к серверу из content script (фолбэк, если SW перезапущен). */
  async function directExec(command, cwd) {
    try {
      const settings = await chrome.storage.local.get({ serverUrl: 'http://127.0.0.1:7842', token: '' });
      const base = String(settings.serverUrl || 'http://127.0.0.1:7842').replace(/\/+$/, '');
      const res = await fetch(base + '/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Token': settings.token || '' },
        body: JSON.stringify({ command, cwd: cwd || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return { ok: false, data, error: (data && (data.reason || data.message)) || `HTTP ${res.status}` };
      }
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  }

  // --------------------------------------------------- работа с файлом вывода

  async function fetchFileText(name) {
    const res = await send({ type: 'bridge:file', name });
    if (!res.ok) return { ok: false, error: res.error || 'не удалось получить файл' };
    return { ok: true, text: res.text || '', name: res.name || name };
  }

  async function showFullLog(parts, name) {
    setStatus(parts.status, 'Загружаю полный лог…', 'busy');
    const res = await fetchFileText(name);
    if (!res.ok) {
      setStatus(parts.status, `Ошибка: ${res.error}`, 'error');
      return;
    }
    parts.output.hidden = false;
    parts.output.textContent = res.text;
    parts.output.scrollTop = 0;
    setStatus(parts.status, `Полный лог (${res.text.length} символов)`, 'ok');
  }

  async function downloadFile(parts, name) {
    const res = await fetchFileText(name);
    if (!res.ok) {
      setStatus(parts.status, `Ошибка: ${res.error}`, 'error');
      return;
    }
    const blob = new Blob([res.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { attrs: { href: url, download: name } });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus(parts.status, `Файл ${name} скачан`, 'ok');
  }

  async function copyToClipboard(parts, value, okMessage) {
    if (!value) {
      setStatus(parts.status, 'Путь неизвестен', 'warn');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setStatus(parts.status, okMessage, 'ok');
    } catch (e) {
      setStatus(parts.status, `Не удалось скопировать: ${(e && e.message) || e}`, 'error');
    }
  }

  // -------------------------------------------------------- прикрепление в чат

  /** Найти input[type=file] в интерфейсе чата. */
  function findFileInput() {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    if (!inputs.length) return null;
    const byAccept = inputs.find((i) => {
      const accept = (i.getAttribute('accept') || '').toLowerCase();
      return accept.includes('text/plain') || accept.includes('.txt') || accept.includes('.log') || accept.includes('text/*');
    });
    return byAccept || inputs[0];
  }

  /** Найти кнопку «прикрепить файл» (нужна, если input создаётся по клику). */
  function findAttachButton() {
    const pattern = /attach|upload|прикреп|файл|file|paperclip|скреп/i;
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], a[href="#"]'));
    return nodes.find((n) => {
      const label = [
        n.getAttribute('aria-label') || '',
        n.getAttribute('title') || '',
        n.textContent || '',
      ].join(' ');
      return pattern.test(label);
    }) || null;
  }

  /** Положить файл в input[type=file] (с обходом трекера значений React). */
  async function setFilesToInput(file) {
    let input = findFileInput();
    if (!input) {
      const button = findAttachButton();
      if (button) {
        button.click();
        for (let i = 0; i < 10 && !input; i += 1) {
          await sleep(200);
          input = findFileInput();
        }
      }
    }
    if (!input) return false;

    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
      if (descriptor && descriptor.set) descriptor.set.call(input, transfer.files);
      else input.files = transfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return Boolean(input.files && input.files.length);
    } catch (e) {
      return false;
    }
  }

  async function attachToChat(parts, name) {
    setStatus(parts.status, 'Готовлю файл для прикрепления…', 'busy');
    const res = await fetchFileText(name);
    if (!res.ok) {
      setStatus(parts.status, `Ошибка: ${res.error}`, 'error');
      return;
    }
    const file = new File([res.text], name, { type: 'text/plain' });
    const attached = await setFilesToInput(file);
    if (attached) {
      setStatus(parts.status, `Файл ${name} прикреплён к чату — отправьте сообщение.`, 'ok');
    } else {
      setStatus(
        parts.status,
        `Не удалось прикрепить автоматически. Скачайте файл (${name}) и прикрепите вручную.`,
        'warn',
      );
    }
  }

  // ------------------------------------------------------------- разметка

  /**
   * Элемент, после которого вставляется панель.
   * Если блок лежит внутри <pre><code>, панель ставится после <pre>,
   * а не внутрь него (внутри <pre> ломается форматирование).
   */
  function insertionAnchor(container) {
    let node = container;
    let parent = node.parentElement;
    while (parent && /^(PRE|CODE)$/.test(parent.tagName)) {
      node = parent;
      parent = parent.parentElement;
    }
    return node;
  }

  function insertPanel(container, command) {
    const parts = buildPanel(command);
    armRun(parts, () => execute(parts, command));

    const anchor = insertionAnchor(container);
    const parent = anchor.parentNode;
    if (parent) {
      parent.insertBefore(parts.panel, anchor.nextSibling);
    } else {
      anchor.appendChild(parts.panel);
    }
    return parts;
  }

  /** Обработать один найденный контейнер: вставить панели под каждым блоком. */
  function processContainer(container) {
    if (!container || container.dataset[PROCESSED_ATTR]) return;
    const blocks = parseBlocks(container);
    if (!blocks.length) return;
    container.dataset[PROCESSED_ATTR] = 'true';
    blocks.forEach((command) => insertPanel(container, command));
  }

  /** Сканировать документ и вставить недостающие панели. */
  function scan() {
    if (!document.body) return;
    for (const node of findMarkerNodes(document.body)) {
      const container = findBlockContainer(node);
      if (!container) continue;
      processContainer(container);
    }
  }

  // ---------------------------------------------------------- инициализация

  async function loadSettings() {
    if (settingsLoaded) return;
    settingsLoaded = true;
    const res = await send({ type: 'bridge:status' });
    if (res.ok && res.data) {
      defaultCwd = res.data.workdir || '';
    } else {
      const local = await chrome.storage.local.get({ workdir: '' });
      defaultCwd = local.workdir || '';
    }
    const local = await chrome.storage.local.get({ serverUrl: 'http://127.0.0.1:7842' });
    serverUrl = local.serverUrl || serverUrl;
  }

  function startObservers() {
    const observer = new MutationObserver(() => {
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Периодический fallback: SPA могла отрисовать сообщение до подписки.
    setInterval(scheduleScan, 2000);
  }

  let scanTimer = null;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      try {
        scan();
      } catch (e) {
        console.warn('[arena-bridge] scan failed', e);
      }
    }, 120);
  }

  loadSettings().then(() => {
    scan();
    startObservers();
    console.info('[arena-bridge] content script готов');
  });
})();
