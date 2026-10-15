'use strict';

/**
 * Генератор демо-страницы extension/demo.html — визуальный превью панели
 * arena-bridge без установки расширения.
 *
 *   node tools/make-demo.js
 *
 * Требуется jsdom (dev-зависимость): npm install
 */

const fs = require('fs');
const path = require('path');

let JSDOM = null;
try {
  ({ JSDOM } = require('jsdom'));
} catch (_) {
  console.error('Нужен jsdom: выполните npm install в корне arena-bridge');
  process.exit(1);
}

const EXT_DIR = path.join(__dirname, '..', 'extension');
const MARKERS_SRC = fs.readFileSync(path.join(EXT_DIR, 'lib', 'markers.js'), 'utf8');
const CONTENT_SRC = fs.readFileSync(path.join(EXT_DIR, 'content.js'), 'utf8');

const CHAT_HTML = `<!doctype html>
<html><body>
  <main>
    <div class="message">
      <div class="bubble">
        <p>Соберём проект и проверим, что всё компилируется:</p>
        <pre><code>&lt;&lt;&lt;LOCAL_CMD&gt;&gt;&gt;
mvn -q -o clean package
&lt;&lt;&lt;END&gt;&gt;&gt;</code></pre>
      </div>
    </div>
  </main>
</body></html>`;

function build() {
  const dom = new JSDOM(CHAT_HTML, { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;

  window.chrome = {
    runtime: {
      sendMessage(message, callback) {
        if (message.type === 'bridge:status') {
          callback({ ok: true, data: { workdir: 'C:\\projects\\minecraft-client' } });
          return;
        }
        if (message.type === 'bridge:exec') {
          callback({
            ok: true,
            data: {
              ok: true,
              exitCode: 0,
              durationMs: 48210,
              file: 'out-2026-10-15T13-10-00-123Z-a1b2c3.log',
              filePath: 'C:\\Users\\me\\.arena-bridge\\out\\out-2026-10-15T13-10-00-123Z-a1b2c3.log',
              preview: [
                '[INFO] Scanning for projects...',
                '[INFO] --- maven-clean-plugin:3.2.0:clean (default-clean) @ client ---',
                '[INFO] Deleting C:\\projects\\minecraft-client\\target',
                '[INFO] --- maven-compiler-plugin:3.13.0:compile (default-compile) @ client ---',
                '[INFO] Compiling 412 source files to C:\\projects\\minecraft-client\\target\\classes',
                '[WARNING] /src/client/java/.../Renderer.java:[42,17] deprecated method',
                '[INFO] BUILD SUCCESS',
                '[INFO] Total time: 48 s',
              ].join('\n'),
            },
          });
          return;
        }
        callback({ ok: false, error: 'unknown' });
      },
    },
    storage: {
      local: {
        get(defaults, callback) {
          const result = Object.assign({ serverUrl: 'http://127.0.0.1:7842', token: 't' }, defaults || {});
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

  window.eval(MARKERS_SRC);
  window.eval(CONTENT_SRC);

  return new Promise((resolve) => {
    setTimeout(() => {
      const panel = window.document.querySelector('[data-ab-panel]');
      resolve({ panelHtml: panel ? panel.outerHTML : '', window });
    }, 150);
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function main() {
  const { panelHtml, window } = await build();

  const demo = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>arena-bridge — превью панели</title>
  <link rel="stylesheet" href="content.css" />
  <style>
    body {
      margin: 0;
      padding: 32px 20px;
      background: #0d1117;
      color: #e6edf3;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    .wrap { max-width: 760px; margin: 0 auto; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .lead { color: #8b949e; margin: 0 0 24px; font-size: 13px; }
    .message { margin-bottom: 20px; }
    .bubble {
      padding: 14px 16px;
      border: 1px solid #30363d;
      border-radius: 12px;
      background: #161b22;
    }
    .bubble p { margin: 0 0 10px; font-size: 14px; }
    .bubble pre {
      margin: 0;
      padding: 12px;
      border-radius: 8px;
      background: rgba(127,127,127,0.1);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12.5px;
      white-space: pre-wrap;
    }
    .note { color: #8b949e; font-size: 12.5px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>arena-bridge — превью</h1>
    <p class="lead">Так выглядит блок с локальной командой и панель расширения в чате arena.ai.</p>

    <div class="message">
      <div class="bubble">
        <p>Соберём проект и проверим, что всё компилируется:</p>
        <pre><code>${escapeHtml('<<<LOCAL_CMD>>>\nmvn -q -o clean package\n<<<END>>>')}</code></pre>
        ${panelHtml}
      </div>
    </div>

    <p class="note">
      Панель появляется под блоком <code>&lt;&lt;&lt;LOCAL_CMD&gt;&gt;&gt;</code>, требует двух кликов
      («Выполнить локально» → «Подтвердить выполнение»), показывает exit code и превью вывода,
      а файл <code>out-*.log</code> можно прикрепить к чату одной кнопкой.
    </p>
  </div>
</body>
</html>
`;

  const out = path.join(EXT_DIR, 'demo.html');
  fs.writeFileSync(out, demo, 'utf8');
  console.log(`[demo] ${path.relative(process.cwd(), out)}`);

  // Закрываем окно jsdom: content script держит таймеры, иначе процесс не завершится.
  if (window) window.close();
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

main();
