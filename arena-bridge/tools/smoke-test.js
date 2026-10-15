'use strict';

/**
 * Быстрая проверка bridge-сервера из командной строки (этап 0 плана).
 *
 *   node tools/smoke-test.js [http://127.0.0.1:7842] [token]
 *
 * Если токен не передан — берётся из server/config.json.
 * Скрипт проверяет /health, выполняет безопасную команду, скачивает файл вывода
 * и печатает результат.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'server', 'config.json');

async function readToken() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return raw.token || '';
  } catch (_) {
    return '';
  }
}

async function main() {
  const base = (process.argv[2] || 'http://127.0.0.1:7842').replace(/\/+$/, '');
  const token = process.argv[3] || await readToken();

  if (!token) {
    console.error('Токен не найден. Запустите сервер и скопируйте токен из консоли.');
    process.exit(2);
  }

  console.log(`→ сервер: ${base}`);

  const health = await fetch(base + '/health').then((r) => r.json()).catch((e) => ({ ok: false, error: e.message }));
  if (!health.ok) {
    console.error(`✗ сервер недоступен: ${health.error || 'нет ответа'}`);
    process.exit(1);
  }
  console.log(`✓ /health: arena-bridge ${health.version}`);

  const command = 'echo arena-bridge smoke test';
  console.log(`→ /exec: ${command}`);

  const res = await fetch(base + '/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Token': token },
    body: JSON.stringify({ command }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    console.error(`✗ команда отклонена: ${data.reason || data.message || data.error}`);
    process.exit(1);
  }
  console.log(`✓ exit code: ${data.exitCode}, ${data.durationMs} мс`);
  console.log(`✓ файл: ${data.file} (${data.size} байт)`);
  console.log('--- preview ---');
  console.log(data.preview);

  const fileRes = await fetch(`${base}/file/${encodeURIComponent(data.file)}`, {
    headers: { 'X-Token': token },
  });
  if (!fileRes.ok) {
    console.error(`✗ не удалось скачать файл (HTTP ${fileRes.status})`);
    process.exit(1);
  }
  const text = await fileRes.text();
  console.log('--- файл вывода (первые 12 строк) ---');
  console.log(text.split(/\r?\n/).slice(0, 12).join('\n'));
  console.log('\n✓ всё работает. Теперь можно ставить расширение и пробовать блок <<<LOCAL_CMD>>>.');
}

main().catch((err) => {
  console.error(`✗ ${err && err.message ? err.message : err}`);
  process.exit(1);
});
