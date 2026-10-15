'use strict';

/**
 * Интеграционный тест content script на настоящем DOM (jsdom).
 *
 * jsdom — необязательная dev-зависимость: если пакета нет, тест пропускается.
 * Установить: npm install (в корне arena-bridge).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let JSDOM = null;
try {
  ({ JSDOM } = require('jsdom'));
} catch (_) {
  JSDOM = null;
}

const skip = JSDOM ? false : 'jsdom не установлен (выполните npm install)';

const EXT_DIR = path.join(__dirname, '..');
const MARKERS_SRC = fs.readFileSync(path.join(EXT_DIR, 'lib', 'markers.js'), 'utf8');
const CONTENT_SRC = fs.readFileSync(path.join(EXT_DIR, 'content.js'), 'utf8');

const CHAT_HTML = `
<!doctype html>
<html>
  <body>
    <main>
      <div class="message" data-role="assistant">
        <div class="bubble">
          <p>Соберём проект:</p>
          <pre><code>&lt;&lt;&lt;LOCAL_CMD&gt;&gt;&gt;
mvn -q -o clean package
&lt;&lt;&lt;END&gt;&gt;&gt;</code></pre>
        </div>
      </div>
      <div class="composer">
        <textarea placeholder="Спросите что-нибудь"></textarea>
        <input type="file" accept="text/plain,.txt,.log" />
        <button type="button">Отправить</button>
      </div>
    </main>
  </body>
</html>
`;

/** Создать окно с чатом и заглушками chrome API. */
function createWindow() {
  const dom = new JSDOM(CHAT_HTML, { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;

  const calls = [];
  window.chrome = {
    runtime: {
      sendMessage(message, callback) {
        calls.push(message);
        if (message.type === 'bridge:status') {
          callback({ ok: true, data: { workdir: 'C:\\projects\\app' } });
          return;
        }
        if (message.type === 'bridge:exec') {
          callback({
            ok: true,
            data: {
              ok: true,
              exitCode: 0,
              durationMs: 1234,
              file: 'out-test.log',
              filePath: 'C:\\Users\\me\\.arena-bridge\\out\\out-test.log',
              preview: 'BUILD SUCCESS',
            },
          });
          return;
        }
        if (message.type === 'bridge:file') {
          callback({ ok: true, name: message.name, text: 'полный лог' });
          return;
        }
        callback({ ok: false, error: 'unknown' });
      },
    },
    storage: {
      local: {
        get(defaults, callback) {
          const result = Object.assign(
            { serverUrl: 'http://127.0.0.1:7842', token: 't' },
            defaults && typeof defaults === 'object' ? defaults : {},
          );
          if (typeof callback === 'function') {
            callback(result);
            return undefined;
          }
          return Promise.resolve(result);
        },
        set() {},
      },
    },
  };

  // jsdom не реализует DataTransfer и строгий FileList — делаем минимальные заглушки,
  // чтобы проверить логику content script, а не возможности jsdom.
  window.DataTransfer = class DataTransfer {
    constructor() {
      this.files = [];
      this.items = {
        add: (file) => {
          this.files.push(file);
        },
      };
    }
  };
  Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
    configurable: true,
    get() {
      return this.__abFiles || [];
    },
    set(value) {
      this.__abFiles = value;
    },
  });

  window.eval(MARKERS_SRC);
  window.eval(CONTENT_SRC);

  return { dom, window, calls };
}

const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

test('content script вставляет панель под блоком команды', { skip }, async (t) => {
  const { window, dom } = createWindow();
  t.after(() => dom.window.close());
  await tick(120);

  const panels = window.document.querySelectorAll('[data-ab-panel]');
  assert.equal(panels.length, 1, 'ожидалась одна панель');

  const panel = panels[0];
  assert.match(panel.textContent, /mvn -q -o clean package/);
  assert.match(panel.textContent, /Выполнить локально/);

  // Панель должна стоять сразу после блока кода.
  const pre = window.document.querySelector('pre');
  assert.equal(pre.nextElementSibling, panel);
});

test('повторный скан не создаёт дубликаты панели', { skip }, async (t) => {
  const { window, dom } = createWindow();
  t.after(() => dom.window.close());
  await tick(120);
  await tick(120);
  assert.equal(window.document.querySelectorAll('[data-ab-panel]').length, 1);
});

test('команда выполняется только после двойного подтверждения', { skip }, async (t) => {
  const { window, dom, calls } = createWindow();
  t.after(() => dom.window.close());
  await tick(120);

  const panel = window.document.querySelector('[data-ab-panel]');
  const runBtn = panel.querySelector('.ab-panel__btn--primary');
  assert.ok(runBtn, 'нет кнопки запуска');

  // Первый клик — только подготовка (армирование), выполнения быть не должно.
  runBtn.click();
  await tick(30);
  assert.equal(calls.filter((c) => c.type === 'bridge:exec').length, 0);
  assert.match(runBtn.textContent, /Подтвердить/);

  // Второй клик — собственно запуск.
  runBtn.click();
  await tick(60);
  const execCalls = calls.filter((c) => c.type === 'bridge:exec');
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].command, 'mvn -q -o clean package');
  assert.equal(execCalls[0].cwd, 'C:\\projects\\app');

  // В панели показан результат и доступны действия с файлом.
  assert.match(panel.textContent, /exit code 0/);
  assert.match(panel.textContent, /out-test\.log/);
  const attachBtn = panel.querySelector('.ab-panel__actions .ab-panel__btn');
  assert.ok(attachBtn, 'нет кнопок действий');
});

test('кнопка «прикрепить» кладёт файл в input[type=file] чата', { skip }, async (t) => {
  const { window, dom } = createWindow();
  t.after(() => dom.window.close());
  await tick(120);

  const panel = window.document.querySelector('[data-ab-panel]');
  panel.querySelector('.ab-panel__btn--primary').click();
  await tick(20);
  panel.querySelector('.ab-panel__btn--primary').click();
  await tick(60);

  const buttons = Array.from(panel.querySelectorAll('.ab-panel__actions button'));
  const attachBtn = buttons.find((b) => b.textContent === 'Прикрепить к чату');
  assert.ok(attachBtn, 'нет кнопки «Прикрепить к чату»');

  attachBtn.click();
  await tick(60);

  const input = window.document.querySelector('input[type="file"]');
  assert.equal(input.files.length, 1, 'файл не прикреплён');
  assert.equal(input.files[0].name, 'out-test.log');
  assert.equal(input.files[0].type, 'text/plain');
});
