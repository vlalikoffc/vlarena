'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createServer } = require('../app');
const { defaultConfig } = require('../lib/config');

function makeServer() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-bridge-test-'));
  const workdir = path.join(tmp, 'project');
  fs.mkdirSync(workdir, { recursive: true });

  const config = defaultConfig();
  config.port = 0;
  config.host = '127.0.0.1';
  config.token = 'test-token-123';
  config.workdir = workdir;
  config.allowedRoots = [workdir];
  config.stateDir = path.join(tmp, 'state');
  config.allowedCommands = ['echo', 'node', 'pwd', 'mvn'];

  const { server } = createServer(config);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        config,
        base: `http://127.0.0.1:${port}`,
        tmp,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

async function req(base, pathname, options = {}) {
  const res = await fetch(base + pathname, options);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  return { status: res.status, body, text, headers: res.headers };
}

test('GET /health работает без токена', async (t) => {
  const s = await makeServer();
  t.after(() => s.close());
  const r = await req(s.base, '/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('POST /exec без токена возвращает 401', async (t) => {
  const s = await makeServer();
  t.after(() => s.close());
  const r = await req(s.base, '/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'echo hi' }),
  });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'unauthorized');
});

test('POST /exec выполняет разрешённую команду и отдаёт файл', async (t) => {
  const s = await makeServer();
  t.after(() => s.close());

  const r = await req(s.base, '/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Token': s.config.token },
    body: JSON.stringify({ command: 'echo hello-bridge' }),
  });

  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.exitCode, 0);
  assert.match(r.body.preview, /hello-bridge/);
  assert.ok(r.body.file.endsWith('.log'));
  assert.ok(r.body.size > 0);

  const fileRes = await req(s.base, `/file/${r.body.file}`, {
    headers: { 'X-Token': s.config.token },
  });
  assert.equal(fileRes.status, 200);
  assert.match(fileRes.text, /hello-bridge/);
  assert.match(fileRes.text, /===== STDOUT =====/);
});

test('POST /exec отклоняет команду вне allowlist (403)', async (t) => {
  const s = await makeServer();
  t.after(() => s.close());
  const r = await req(s.base, '/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Token': s.config.token },
    body: JSON.stringify({ command: 'curl http://example.com' }),
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'command_denied');
});

test('POST /exec отклоняет cwd вне разрешённых корней', async (t) => {
  const s = await makeServer();
  t.after(() => s.close());
  const r = await req(s.base, '/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Token': s.config.token },
    body: JSON.stringify({ command: 'echo hi', cwd: '/etc' }),
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'cwd_denied');
});

test('GET /history возвращает выполненные команды', async (t) => {
  const s = await makeServer();
  t.after(() => s.close());

  await req(s.base, '/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Token': s.config.token },
    body: JSON.stringify({ command: 'echo history-entry' }),
  });

  const r = await req(s.base, '/history', { headers: { 'X-Token': s.config.token } });
  assert.equal(r.status, 200);
  assert.ok(r.body.entries.length >= 1);
  assert.equal(r.body.entries[0].command, 'echo history-entry');
});

test('GET /config не отдаёт токен, PUT /config сохраняет allowlist', async (t) => {
  const s = await makeServer();
  t.after(() => s.close());

  const cfg = await req(s.base, '/config', { headers: { 'X-Token': s.config.token } });
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.token, undefined);
  assert.ok(Array.isArray(cfg.body.allowedCommands));

  const upd = await req(s.base, '/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Token': s.config.token },
    body: JSON.stringify({ allowedCommands: ['echo'] }),
  });
  assert.equal(upd.status, 200);
  assert.deepEqual(s.config.allowedCommands, ['echo']);
});

test('CORS: preflight для origin из allowedOrigins разрешён', async (t) => {
  const s = await makeServer();
  t.after(() => s.close());

  const res = await fetch(s.base + '/exec', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://arena.ai',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'x-token',
    },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://arena.ai');
  assert.match(res.headers.get('access-control-allow-headers') || '', /X-Token/i);
});

test('CORS: чужой origin не получает разрешение', async (t) => {
  const s = await makeServer();
  t.after(() => s.close());

  const res = await fetch(s.base + '/health', { headers: { Origin: 'https://evil.example' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('файл вывода нельзя выкачать за пределами каталога out', async (t) => {
  const s = await makeServer();
  t.after(() => s.close());
  const r = await req(s.base, '/file/..%2F..%2Fetc%2Fpasswd', { headers: { 'X-Token': s.config.token } });
  assert.equal(r.status, 404);
});
