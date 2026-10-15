'use strict';

/**
 * Сквозной тест: background service worker → реальный bridge-сервер.
 *
 * Проверяет HTTP-протокол целиком: health, exec, скачивание файла, историю.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const { createServer } = require('../../server/app');
const { defaultConfig } = require('../../server/lib/config');

const BACKGROUND_SRC = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

/** Поднять сервер и загрузить background.js с подменённым chrome API. */
async function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-bridge-bg-'));
  const workdir = path.join(tmp, 'project');
  fs.mkdirSync(workdir, { recursive: true });

  const config = defaultConfig();
  config.port = 0;
  config.host = '127.0.0.1';
  config.token = 'bg-token';
  config.workdir = workdir;
  config.allowedRoots = [workdir];
  config.stateDir = path.join(tmp, 'state');

  const { server } = createServer(config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const settings = { serverUrl: `http://127.0.0.1:${port}`, token: 'bg-token' };
  let messageHandler = null;

  const sandbox = {
    console,
    fetch,
    setTimeout,
    clearTimeout,
    AbortController,
    URL,
    chrome: {
      storage: {
        local: {
          async get(defaults) {
            return Object.assign({}, defaults, settings);
          },
          async set(patch) {
            Object.assign(settings, patch);
          },
        },
      },
      runtime: {
        onMessage: {
          addListener(fn) {
            messageHandler = fn;
          },
        },
      },
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(BACKGROUND_SRC, sandbox, { filename: 'background.js' });

  const send = (message) => new Promise((resolve) => {
    messageHandler(message, {}, resolve);
  });

  return {
    send,
    settings,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('background: health и status возвращают данные сервера', async (t) => {
  const ctx = await setup();
  t.after(() => ctx.close());

  const health = await ctx.send({ type: 'bridge:health' });
  assert.equal(health.ok, true);
  assert.equal(health.data.name, 'arena-bridge');

  const status = await ctx.send({ type: 'bridge:status' });
  assert.equal(status.ok, true);
  assert.ok(status.data.workdir);
});

test('background: exec выполняет команду и отдаёт файл', async (t) => {
  const ctx = await setup();
  t.after(() => ctx.close());

  const exec = await ctx.send({ type: 'bridge:exec', command: 'echo background-ok' });
  assert.equal(exec.ok, true);
  assert.equal(exec.data.exitCode, 0);
  assert.match(exec.data.preview, /background-ok/);

  const file = await ctx.send({ type: 'bridge:file', name: exec.data.file });
  assert.equal(file.ok, true);
  assert.match(file.text, /background-ok/);
});

test('background: команда вне allowlist отклоняется', async (t) => {
  const ctx = await setup();
  t.after(() => ctx.close());

  // chmod нет в allowlist по умолчанию
  const exec = await ctx.send({ type: 'bridge:exec', command: 'chmod 777 file' });
  assert.equal(exec.ok, false);
  assert.equal(exec.status, 403);
  assert.match(exec.error, /allowlist/);
});

test('background: деструктивная команда отклоняется denylist', async (t) => {
  const ctx = await setup();
  t.after(() => ctx.close());

  const exec = await ctx.send({ type: 'bridge:exec', command: 'rm -rf /' });
  assert.equal(exec.ok, false);
  assert.equal(exec.status, 403);
});

test('background: неверный токен даёт 401', async (t) => {
  const ctx = await setup();
  t.after(() => ctx.close());

  ctx.settings.token = 'wrong-token';
  const exec = await ctx.send({ type: 'bridge:exec', command: 'echo nope' });
  assert.equal(exec.ok, false);
  assert.equal(exec.status, 401);
});

test('background: недоступный сервер не роняет расширение', async (t) => {
  const ctx = await setup();
  t.after(() => ctx.close());

  ctx.settings.serverUrl = 'http://127.0.0.1:1';
  const health = await ctx.send({ type: 'bridge:health' });
  assert.equal(health.ok, false);
  assert.match(health.error, /Нет связи/);
});
