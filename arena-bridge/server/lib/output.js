'use strict';

/** Файл вывода команды: заголовок с метаданными + STDOUT + STDERR. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { timestampSlug } = require('./util');

function outDir(stateDir) {
  return path.join(stateDir, 'out');
}

/** Собрать текст файла вывода. */
function buildOutputText({ command, cwd, result }) {
  const header = [
    '# arena-bridge: результат выполнения команды',
    `# command : ${command}`,
    `# cwd     : ${cwd}`,
    `# started : ${result.startedAt || new Date().toISOString()}`,
    `# duration: ${result.durationMs} ms`,
    `# exitCode: ${result.exitCode === null || result.exitCode === undefined ? 'n/a' : result.exitCode}`,
    `# killed  : ${result.killed ? 'yes' : 'no'}`,
    `# truncated: ${result.truncated ? 'yes' : 'no'}`,
    '',
    '===== STDOUT =====',
  ];
  const body = [
    header.join('\n'),
    result.stdout || '',
    '',
    '===== STDERR =====',
    result.stderr || '',
    '',
  ];
  return body.join('\n');
}

/** Сохранить вывод в файл. Возвращает {name, filePath, size}. */
function writeOutputFile({ stateDir, command, cwd, result }) {
  const dir = outDir(stateDir);
  fs.mkdirSync(dir, { recursive: true });

  const name = `out-${timestampSlug()}-${crypto.randomBytes(3).toString('hex')}.log`;
  const filePath = path.join(dir, name);
  const text = buildOutputText({ command, cwd, result });
  fs.writeFileSync(filePath, text, 'utf8');

  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch (_) { size = Buffer.byteLength(text, 'utf8'); }

  return { name, filePath, size };
}

/** Полный путь к файлу вывода по имени (с защитой от выхода за пределы каталога). */
function resolveOutputFile(stateDir, name) {
  const dir = outDir(stateDir);
  const safe = String(name || '').split(/[\\/]/).pop() || '';
  if (!/^[A-Za-z0-9._-]+$/.test(safe)) return null;
  const filePath = path.join(dir, safe);
  if (path.dirname(path.resolve(filePath)) !== path.resolve(dir)) return null;
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

/** Короткий предпросмотр вывода (первые N строк). */
function buildPreview({ result, lines = 40, maxChars = 4000 }) {
  const combined = [result.stdout || '', result.stderr || '']
    .filter(Boolean)
    .join('\n');
  const split = combined.split(/\r?\n/);
  const head = split.slice(0, lines).join('\n');
  const more = split.length > lines ? `\n… ещё ${split.length - lines} строк` : '';
  const preview = head + more;
  return preview.length > maxChars ? preview.slice(0, maxChars) + '\n…' : preview;
}

module.exports = {
  outDir,
  buildOutputText,
  writeOutputFile,
  resolveOutputFile,
  buildPreview,
};
