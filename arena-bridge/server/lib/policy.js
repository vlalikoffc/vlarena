'use strict';

/**
 * Политика выполнения команд: allowlist программ, denylist паттернов,
 * проверка рабочей директории и запрет опасных shell-конструкций.
 */

const path = require('path');

const PROGRAM_EXTENSIONS = ['.exe', '.cmd', '.bat', '.ps1', '.com', '.sh', '.mjs', '.cjs', '.jar'];

/**
 * Разбить команду на сегменты по операторам `&&`, `||`, `;`, `|`, `&`, переводу строки.
 * Каждый сегмент проверяется отдельно — так `mvn package && rm -rf /` не пройдёт целиком.
 */
function splitSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    const next = command[i + 1];

    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '&' && next === '&') {
      segments.push(current);
      current = '';
      i += 1;
      continue;
    }
    if (ch === '|' && next === '|') {
      segments.push(current);
      current = '';
      i += 1;
      continue;
    }
    if (ch === '|' || ch === ';' || ch === '\n' || ch === '\r') {
      segments.push(current);
      current = '';
      continue;
    }
    if (ch === '&') {
      // `2>&1` — это не разделитель
      if (/>\s*$/.test(current)) {
        current += ch;
        continue;
      }
      segments.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments.map((s) => s.trim()).filter(Boolean);
}

/** Извлечь имя программы (первый токен) из сегмента команды. */
function extractProgram(segment) {
  const s = String(segment || '').trim();
  if (!s) return null;
  if (s[0] === '"' || s[0] === "'") {
    const quote = s[0];
    let i = 1;
    while (i < s.length && s[i] !== quote) i += 1;
    return s.slice(1, i);
  }
  const match = s.match(/^[^\s|<>&;()]+/);
  return match ? match[0] : null;
}

/** Нормализовать имя программы: базовое имя без расширения, в нижний регистр. */
function normalizeProgram(program) {
  if (!program) return '';
  const base = String(program).split(/[\\/]/).pop() || '';
  const lower = base.toLowerCase();
  for (const ext of PROGRAM_EXTENSIONS) {
    if (lower.endsWith(ext)) return lower.slice(0, -ext.length);
  }
  return lower;
}

/** Есть ли в строке опасные shell-конструкции (подстановка/перенаправление). */
function findUnsafeShellSyntax(command) {
  const reasons = [];
  if (command.includes('`')) reasons.push('подстановка через ` `` `');
  if (command.includes('$(')) reasons.push('подстановка $(...)');
  if (command.includes('${')) reasons.push('подстановка ${...}');
  if (command.includes('<')) reasons.push('перенаправление ввода (<)');
  // `>` разрешён только в виде `>&` (например, 2>&1)
  for (let i = 0; i < command.length; i += 1) {
    if (command[i] === '>' && command[i + 1] !== '&') {
      reasons.push('перенаправление вывода (>)');
      break;
    }
  }
  return reasons;
}

/** Проверить, что путь внутри разрешённых корней. */
function isInsideRoots(targetPath, roots) {
  const resolved = path.resolve(targetPath);
  for (const root of roots || []) {
    const rootResolved = path.resolve(root);
    if (resolved === rootResolved) return true;
    const rel = path.relative(rootResolved, resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return true;
  }
  return false;
}

/** Разрешить и проверить рабочую директорию команды. */
function resolveCwd(cwd, config) {
  const roots = config.allowedRoots && config.allowedRoots.length
    ? config.allowedRoots
    : [config.workdir];

  if (!cwd) {
    return { ok: true, cwd: config.workdir };
  }

  const raw = String(cwd);
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(config.workdir, raw);
  if (!isInsideRoots(resolved, roots)) {
    return {
      ok: false,
      reason: `рабочая директория вне разрешённых корней: ${resolved} (разрешено: ${roots.join(', ')})`,
    };
  }
  return { ok: true, cwd: resolved };
}

/**
 * Главная проверка команды.
 * Возвращает {allowed: true} либо {allowed: false, reason, segment}.
 */
function checkCommand(command, config) {
  const cmd = String(command || '').trim();
  if (!cmd) {
    return { allowed: false, reason: 'пустая команда' };
  }

  // 1. denylist по всей строке
  for (const pattern of config.deniedPatterns || []) {
    let re;
    try {
      re = new RegExp(pattern, 'i');
    } catch (_) {
      continue; // битый паттерн игнорируем
    }
    if (re.test(cmd)) {
      return { allowed: false, reason: `команда попадает в запрещённый паттерн /${pattern}/i` };
    }
  }

  // 2. опасные shell-конструкции
  if (!config.allowShellMetacharacters) {
    const unsafe = findUnsafeShellSyntax(cmd);
    if (unsafe.length) {
      return {
        allowed: false,
        reason: `неподдерживаемые shell-конструкции: ${unsafe.join(', ')} (разрешить: allowShellMetacharacters=true)`,
      };
    }
  }

  // 3. allowlist по каждому сегменту
  const allowedNames = new Set((config.allowedCommands || []).map(normalizeProgram).filter(Boolean));
  const allowedPaths = (config.allowedProgramPaths || []).map((p) => path.resolve(String(p)));

  const segments = splitSegments(cmd);
  if (!segments.length) {
    return { allowed: false, reason: 'не удалось разобрать команду' };
  }

  for (const segment of segments) {
    const program = extractProgram(segment);
    if (!program) {
      return { allowed: false, reason: `не удалось определить программу в сегменте: ${segment}` };
    }
    const normalized = normalizeProgram(program);
    if (!allowedNames.has(normalized)) {
      return {
        allowed: false,
        reason: `команда «${program}» не входит в allowlist (разрешено: ${[...allowedNames].slice(0, 12).join(', ')}…)`,
        segment,
      };
    }

    // программа с явным путём — проверяем, что она внутри разрешённых корней
    if (/[\\/]/.test(program) && !config.allowAbsoluteProgramPaths) {
      const abs = path.isAbsolute(program) ? path.resolve(program) : path.resolve(config.workdir, program);
      const inAllowedPaths = allowedPaths.some((p) => abs === p || abs.startsWith(p + path.sep));
      const inRoots = isInsideRoots(abs, config.allowedRoots && config.allowedRoots.length
        ? config.allowedRoots
        : [config.workdir]);
      if (!inAllowedPaths && !inRoots) {
        return {
          allowed: false,
          reason: `программа «${program}» вне разрешённых директорий (добавьте путь в allowedProgramPaths)`,
          segment,
        };
      }
    }
  }

  return { allowed: true, segments };
}

module.exports = {
  splitSegments,
  extractProgram,
  normalizeProgram,
  findUnsafeShellSyntax,
  isInsideRoots,
  resolveCwd,
  checkCommand,
};
