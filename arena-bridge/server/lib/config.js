'use strict';

/**
 * Конфигурация bridge-сервера.
 *
 * Файл конфигурации — `server/config.json` (создаётся при первом запуске).
 * Токен сопряжения генерируется автоматически, если он не задан.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/** Команды, разрешённые по умолчанию (сравнение идёт по имени программы). */
const DEFAULT_ALLOWED_COMMANDS = [
  // сборка / VCS
  'mvn', 'mvnw', 'gradle', 'gradlew', 'git',
  // node / python
  'npm', 'npx', 'pnpm', 'yarn', 'node', 'python', 'python3', 'py', 'pip', 'pip3',
  // jvm
  'java', 'javac', 'jar', 'javap', 'jshell', 'kotlin', 'kotlinc', 'scala', 'sbt',
  // прочие языки / сборщики
  'cargo', 'rustc', 'go', 'make', 'cmake', 'ninja', 'dotnet', 'swift', 'flutter', 'dart',
  // shell-обвязка
  'pwsh', 'powershell', 'cmd', 'bash', 'sh',
  // чтение окружения
  'ls', 'dir', 'cat', 'type', 'echo', 'pwd', 'cd', 'whoami', 'date', 'where', 'which',
  'head', 'tail', 'grep', 'find', 'wc', 'env', 'printenv', 'tree',
  // сеть
  'curl', 'wget',
];

/** Паттерны, которые запрещены всегда (даже если команда разрешена по allowlist). */
const DEFAULT_DENIED_PATTERNS = [
  // linux/unix
  'rm\\s+(-[a-zA-Z]*[rR][a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*[rR])\\s+[/~.]',
  'rm\\s+-rf\\s+\\*',
  'chmod\\s+-R\\s+777\\s+/',
  'chown\\s+-R\\s+\\S+\\s+/',
  'dd\\s+if=',
  'mkfs(\\.[a-z0-9]+)?',
  '>\\s*/dev/[sh]d',
  'shred\\s',
  // windows
  'del\\s+/[sfq]',
  'rd\\s+/s',
  'rmdir\\s+/s',
  'format\\s+[a-z]:',
  'format\\s+\\w',
  'diskpart',
  'takeown',
  'icacls',
  'vssadmin\\s+delete',
  'cipher\\s+/w',
  'bcdedit',
  'reg\\s+delete',
  'reg\\s+import',
  'net\\s+user\\b.*\\s+/add',
  'wmic\\s+.*\\s+delete',
  'remove-item\\b.*-recurse.*-force.*[a-z]:\\\\\\s*$',
  'start-process\\b.*-verb\\s+runas',
  // управление машиной
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'stop-computer',
  'restart-computer',
  // риски prompt-injection / скрытых загрузок
  'curl\\s+[^|]*\\|\\s*(ba)?sh',
  'wget\\s+[^|]*\\|\\s*(ba)?sh',
  'iex\\s*\\(',
  'invoke-expression',
  'powershell.*-enc(odedcommand)?\\b',
  'downloadstring',
  'frombase64string',
  // прочее опасное
  'git\\s+clean\\s+-[a-zA-Z]*f',
  'history\\s+-c',
  'nuke',
];

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0:0:0:0:0:0:0:1']);

function defaultConfig() {
  return {
    version: 1,
    host: '127.0.0.1',
    port: 7842,
    token: null, // генерируется автоматически
    workdir: null, // по умолчанию — каталог запуска сервера
    allowedRoots: [], // по умолчанию — [workdir]
    allowedCommands: DEFAULT_ALLOWED_COMMANDS.slice(),
    deniedPatterns: DEFAULT_DENIED_PATTERNS.slice(),
    allowedProgramPaths: [], // дополнительные абсолютные пути к программам
    allowedOrigins: ['https://arena.ai', 'https://*.arena.ai'], // CORS: origins чата
    allowShellMetacharacters: false, // перенаправления и подстановки в вывод
    allowAbsoluteProgramPaths: false, // разрешать программы вне allowedRoots
    maxOutputBytes: 24000000, // < 25 МБ (лимит вложений arena.ai)
    execTimeoutMs: 300000, // 5 минут
    previewLines: 40,
    historyLimit: 200,
    stateDir: path.join(os.homedir(), '.arena-bridge'),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Глубокое слияние объектов (массивы заменяются целиком). */
function deepMerge(base, override) {
  const result = Object.assign({}, base);
  if (!isPlainObject(override)) return result;
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      result[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/** Прочитать конфиг (или создать дефолтный) из указанного пути. */
function loadConfig(configPath) {
  const cfg = defaultConfig();
  let raw = {};
  let existed = false;

  if (configPath && fs.existsSync(configPath)) {
    existed = true;
    const text = fs.readFileSync(configPath, 'utf8');
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error(`Не удалось разобрать ${configPath}: ${e.message}`);
    }
  }

  const merged = deepMerge(cfg, raw);
  merged.configPath = configPath || null;
  merged.configFileExists = existed;

  if (!merged.token) merged.token = crypto.randomBytes(32).toString('hex');
  if (!merged.workdir) merged.workdir = process.cwd();
  merged.workdir = path.resolve(merged.workdir);

  if (!Array.isArray(merged.allowedRoots) || merged.allowedRoots.length === 0) {
    merged.allowedRoots = [merged.workdir];
  }
  merged.allowedRoots = merged.allowedRoots.map((p) => path.resolve(String(p)));

  if (!Array.isArray(merged.allowedCommands)) merged.allowedCommands = DEFAULT_ALLOWED_COMMANDS.slice();
  if (!Array.isArray(merged.deniedPatterns)) merged.deniedPatterns = DEFAULT_DENIED_PATTERNS.slice();
  if (!Array.isArray(merged.allowedProgramPaths)) merged.allowedProgramPaths = [];
  if (!Array.isArray(merged.allowedOrigins)) merged.allowedOrigins = [];

  merged.stateDir = path.resolve(String(merged.stateDir));
  merged.port = Number(merged.port) || 7842;
  merged.maxOutputBytes = Math.max(1024, Number(merged.maxOutputBytes) || 24000000);
  merged.execTimeoutMs = Math.max(1000, Number(merged.execTimeoutMs) || 300000);
  merged.previewLines = Math.max(1, Number(merged.previewLines) || 40);
  merged.historyLimit = Math.max(1, Number(merged.historyLimit) || 200);

  return merged;
}

/** Сохранить конфиг на диск (без приватных полей вроде configPath). */
function saveConfig(configPath, config) {
  if (!configPath) return;
  const out = {
    version: config.version,
    host: config.host,
    port: config.port,
    token: config.token,
    workdir: config.workdir,
    allowedRoots: config.allowedRoots,
    allowedCommands: config.allowedCommands,
    deniedPatterns: config.deniedPatterns,
    allowedProgramPaths: config.allowedProgramPaths,
    allowedOrigins: config.allowedOrigins,
    allowShellMetacharacters: config.allowShellMetacharacters,
    allowAbsoluteProgramPaths: config.allowAbsoluteProgramPaths,
    maxOutputBytes: config.maxOutputBytes,
    execTimeoutMs: config.execTimeoutMs,
    previewLines: config.previewLines,
    historyLimit: config.historyLimit,
    stateDir: config.stateDir,
  };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
  try {
    fs.chmodSync(configPath, 0o600); // токен не должен быть доступен другим пользователям
  } catch (_) { /* windows игнорирует chmod */ }
}

/** Публичное представление конфига (без токена). */
function publicConfig(config) {
  return {
    version: config.version,
    host: config.host,
    port: config.port,
    workdir: config.workdir,
    allowedRoots: config.allowedRoots,
    allowedCommands: config.allowedCommands,
    deniedPatterns: config.deniedPatterns,
    allowedProgramPaths: config.allowedProgramPaths,
    allowedOrigins: config.allowedOrigins,
    allowShellMetacharacters: config.allowShellMetacharacters,
    allowAbsoluteProgramPaths: config.allowAbsoluteProgramPaths,
    maxOutputBytes: config.maxOutputBytes,
    execTimeoutMs: config.execTimeoutMs,
    previewLines: config.previewLines,
    historyLimit: config.historyLimit,
    stateDir: config.stateDir,
    configPath: config.configPath,
  };
}

/** Сервер по умолчанию слушает только loopback. */
function isLoopback(host) {
  return LOOPBACK_HOSTS.has(String(host).toLowerCase());
}

module.exports = {
  DEFAULT_ALLOWED_COMMANDS,
  DEFAULT_DENIED_PATTERNS,
  defaultConfig,
  deepMerge,
  loadConfig,
  saveConfig,
  publicConfig,
  isLoopback,
};
