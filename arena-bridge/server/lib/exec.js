'use strict';

/** Выполнение команды через child_process с лимитами по времени и размеру вывода. */

const { spawn } = require('child_process');

/**
 * Запустить команду в shell.
 *
 * @param {object} options
 * @param {string} options.command     команда
 * @param {string} options.cwd         рабочая директория
 * @param {number} options.timeoutMs   таймаут
 * @param {number} options.maxOutputBytes лимит на суммарный вывод
 * @param {object} [options.env]       дополнительные переменные окружения
 * @returns {Promise<object>} результат выполнения
 */
function runCommand(options) {
  const {
    command,
    cwd,
    timeoutMs = 300000,
    maxOutputBytes = 24000000,
    env = {},
  } = options || {};

  return new Promise((resolve) => {
    const startedAt = Date.now();
    let child;
    try {
      child = spawn(command, {
        cwd,
        shell: true,
        windowsHide: true,
        env: Object.assign({}, process.env, env),
      });
    } catch (e) {
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        killed: false,
        truncated: false,
        stdout: '',
        stderr: String(e && e.message ? e.message : e),
        durationMs: Date.now() - startedAt,
        startedAt: new Date(startedAt).toISOString(),
      });
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let totalBytes = 0;
    let truncated = false;
    let killed = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killed = true;
      try { child.kill('SIGTERM'); } catch (_) { /* ignore */ }
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
      }, 2000).unref?.();
    }, Math.max(1000, timeoutMs));

    const append = (target, chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
      totalBytes += buf.length;
      if (totalBytes > maxOutputBytes) {
        if (!truncated) {
          truncated = true;
          killed = true;
          try { child.kill('SIGTERM'); } catch (_) { /* ignore */ }
          setTimeout(() => {
            try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
          }, 2000).unref?.();
        }
        return;
      }
      if (target === 'out') {
        stdoutBytes += buf.length;
        stdoutChunks.push(buf);
      } else {
        stderrBytes += buf.length;
        stderrChunks.push(buf);
      }
    };

    child.stdout.on('data', (chunk) => append('out', chunk));
    child.stderr.on('data', (chunk) => append('err', chunk));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        killed,
        truncated,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8') + (err ? `\n[ошибка запуска] ${err.message}` : ''),
        durationMs: Date.now() - startedAt,
        startedAt: new Date(startedAt).toISOString(),
      });
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: true,
        exitCode: code === null ? null : code,
        signal: signal || null,
        killed,
        timedOut,
        truncated,
        stdoutBytes,
        stderrBytes,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        durationMs: Date.now() - startedAt,
        startedAt: new Date(startedAt).toISOString(),
      });
    });
  });
}

module.exports = { runCommand };
