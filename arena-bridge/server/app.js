'use strict';

/**
 * HTTP-сервер arena-bridge.
 *
 * Маршруты:
 *   GET  /health   — проверка живости (без токена)
 *   GET  /status   — состояние сервера (токен)
 *   POST /exec     — выполнить команду (токен)
 *   GET  /file/:n  — скачать файл вывода (токен в X-Token или ?token=)
 *   GET  /history  — история команд (токен)
 *   GET  /config   — текущий конфиг без токена (токен)
 *   PUT  /config   — обновить allowlist/denylist/пути (токен)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { runCommand } = require('./lib/exec');
const { checkCommand, resolveCwd } = require('./lib/policy');
const { writeOutputFile, resolveOutputFile, buildPreview } = require('./lib/output');
const { readHistory, appendHistory, clearHistory } = require('./lib/history');
const { json, text, readBody, extractToken, safeEqual } = require('./lib/util');
const { publicConfig, isLoopback } = require('./lib/config');

const VERSION = '1.0.0';
const EXTENSION_CORS_ORIGIN = /^(chrome-extension|moz-extension|edge-extension):\/\//i;

/** Разрешён ли origin (для CORS). */
function isAllowedOrigin(origin, config) {
  if (!origin) return false;
  if (EXTENSION_CORS_ORIGIN.test(origin)) return true;
  const list = (config && config.allowedOrigins) || [];
  return list.some((entry) => {
    const pattern = String(entry || '').trim();
    if (!pattern) return false;
    if (pattern === '*') return true;
    if (pattern.startsWith('*.')) {
      return origin.toLowerCase().endsWith(pattern.slice(1).toLowerCase());
    }
    return origin.toLowerCase() === pattern.toLowerCase();
  });
}

function sendCorsHeaders(req, res, config) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin, config)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'X-Token, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

/** Создать HTTP-сервер. */
function createServer(config) {
  const startedAt = Date.now();

  const server = http.createServer(async (req, res) => {
    sendCorsHeaders(req, res, config);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    } catch (_) {
      json(res, 400, { ok: false, error: 'bad_url' });
      return;
    }

    const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
    const token = extractToken(req, parsedUrl);
    const authorized = token && safeEqual(token, config.token);

    const requireAuth = () => {
      if (authorized) return false;
      json(res, 401, {
        ok: false,
        error: 'unauthorized',
        message: 'Нет или неверный X-Token. Введите токен из консоли сервера в popup расширения.',
      });
      return true;
    };

    try {
      // ---------- GET /health ----------
      if (req.method === 'GET' && pathname === '/health') {
        json(res, 200, {
          ok: true,
          name: 'arena-bridge',
          version: VERSION,
          uptimeSec: Math.round((Date.now() - startedAt) / 1000),
          tokenRequired: true,
        });
        return;
      }

      // ---------- GET /status ----------
      if (req.method === 'GET' && pathname === '/status') {
        if (requireAuth()) return;
        json(res, 200, {
          ok: true,
          version: VERSION,
          uptimeSec: Math.round((Date.now() - startedAt) / 1000),
          workdir: config.workdir,
          allowedRoots: config.allowedRoots,
          allowedCommands: config.allowedCommands,
          maxOutputBytes: config.maxOutputBytes,
          execTimeoutMs: config.execTimeoutMs,
          platform: process.platform,
          node: process.version,
        });
        return;
      }

      // ---------- POST /exec ----------
      if (req.method === 'POST' && pathname === '/exec') {
        if (requireAuth()) return;

        const raw = await readBody(req);
        let body;
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch (_) {
          json(res, 400, { ok: false, error: 'bad_json' });
          return;
        }

        const command = String(body.command || '').trim();
        if (!command) {
          json(res, 400, { ok: false, error: 'empty_command' });
          return;
        }

        const policy = checkCommand(command, config);
        if (!policy.allowed) {
          appendHistory(config.stateDir, {
            ts: new Date().toISOString(),
            command,
            cwd: body.cwd || config.workdir,
            status: 'denied',
            reason: policy.reason,
            exitCode: null,
            durationMs: 0,
          }, config.historyLimit);
          json(res, 403, {
            ok: false,
            error: 'command_denied',
            reason: policy.reason,
            message: 'Команда отклонена политикой безопасности.',
          });
          return;
        }

        const cwdResult = resolveCwd(body.cwd, config);
        if (!cwdResult.ok) {
          appendHistory(config.stateDir, {
            ts: new Date().toISOString(),
            command,
            cwd: body.cwd || config.workdir,
            status: 'denied',
            reason: cwdResult.reason,
            exitCode: null,
            durationMs: 0,
          }, config.historyLimit);
          json(res, 403, {
            ok: false,
            error: 'cwd_denied',
            reason: cwdResult.reason,
            message: 'Рабочая директория отклонена политикой безопасности.',
          });
          return;
        }

        const timeoutMs = Math.min(
          Math.max(1000, Number(body.timeoutMs) || config.execTimeoutMs),
          3600000,
        );

        const result = await runCommand({
          command,
          cwd: cwdResult.cwd,
          timeoutMs,
          maxOutputBytes: config.maxOutputBytes,
        });

        const file = writeOutputFile({
          stateDir: config.stateDir,
          command,
          cwd: cwdResult.cwd,
          result,
        });

        appendHistory(config.stateDir, {
          ts: new Date().toISOString(),
          command,
          cwd: cwdResult.cwd,
          status: 'done',
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          file: file.name,
          size: file.size,
        }, config.historyLimit);

        json(res, 200, {
          ok: true,
          command,
          cwd: cwdResult.cwd,
          exitCode: result.exitCode,
          signal: result.signal,
          killed: result.killed,
          timedOut: result.timedOut,
          truncated: result.truncated,
          durationMs: result.durationMs,
          file: file.name,
          filePath: file.filePath,
          size: file.size,
          preview: buildPreview({ result, lines: config.previewLines }),
          stdoutBytes: result.stdoutBytes || 0,
          stderrBytes: result.stderrBytes || 0,
          downloadUrl: `http://${config.host}:${config.port}/file/${file.name}`,
          fileUrl: `/file/${file.name}`,
        });
        return;
      }

      // ---------- GET /file/:name ----------
      const fileMatch = pathname.match(/^\/file\/([^/]+)$/);
      if (req.method === 'GET' && fileMatch) {
        if (requireAuth()) return;
        const filePath = resolveOutputFile(config.stateDir, decodeURIComponent(fileMatch[1]));
        if (!filePath) {
          json(res, 404, { ok: false, error: 'file_not_found' });
          return;
        }
        const body = fs.readFileSync(filePath);
        text(res, 200, body, 'text/plain; charset=utf-8', {
          'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
        });
        return;
      }

      // ---------- GET /history ----------
      if (req.method === 'GET' && pathname === '/history') {
        if (requireAuth()) return;
        const entries = readHistory(config.stateDir).slice().reverse();
        json(res, 200, { ok: true, count: entries.length, entries });
        return;
      }

      // ---------- DELETE /history ----------
      if (req.method === 'DELETE' && pathname === '/history') {
        if (requireAuth()) return;
        clearHistory(config.stateDir);
        json(res, 200, { ok: true, entries: [] });
        return;
      }

      // ---------- GET /config ----------
      if (req.method === 'GET' && pathname === '/config') {
        if (requireAuth()) return;
        json(res, 200, Object.assign({ ok: true }, publicConfig(config)));
        return;
      }

      // ---------- PUT /config ----------
      if (req.method === 'PUT' && pathname === '/config') {
        if (requireAuth()) return;
        const raw = await readBody(req);
        let body;
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch (_) {
          json(res, 400, { ok: false, error: 'bad_json' });
          return;
        }

        const mutable = [
          'workdir',
          'allowedRoots',
          'allowedCommands',
          'deniedPatterns',
          'allowedProgramPaths',
          'allowedOrigins',
          'allowShellMetacharacters',
          'allowAbsoluteProgramPaths',
          'maxOutputBytes',
          'execTimeoutMs',
          'previewLines',
          'historyLimit',
        ];
        for (const key of mutable) {
          if (body[key] === undefined) continue;
          if (key === 'workdir') {
            config.workdir = path.resolve(String(body[key]));
            // Если корни не заданы тем же запросом — рабочая папка становится единственным корнем.
            if (!Array.isArray(body.allowedRoots)) {
              config.allowedRoots = [config.workdir];
            }
            continue;
          }
          if (key === 'allowedOrigins') {
            if (!Array.isArray(body[key])) {
              json(res, 400, { ok: false, error: 'bad_value', field: key });
              return;
            }
            config.allowedOrigins = body[key].map((v) => String(v));
            continue;
          }
          if (key === 'allowedRoots' || key === 'allowedProgramPaths') {
            if (!Array.isArray(body[key])) {
              json(res, 400, { ok: false, error: 'bad_value', field: key });
              return;
            }
            config[key] = body[key].map((p) => path.resolve(String(p)));
            continue;
          }
          if (key === 'allowedCommands' || key === 'deniedPatterns') {
            if (!Array.isArray(body[key])) {
              json(res, 400, { ok: false, error: 'bad_value', field: key });
              return;
            }
            config[key] = body[key].map((v) => String(v));
            continue;
          }
          if (key === 'allowShellMetacharacters' || key === 'allowAbsoluteProgramPaths') {
            config[key] = Boolean(body[key]);
            continue;
          }
          config[key] = Number(body[key]) || config[key];
        }

        if (config.configPath) {
          const { saveConfig } = require('./lib/config');
          saveConfig(config.configPath, config);
        }

        json(res, 200, Object.assign({ ok: true, saved: Boolean(config.configPath) }, publicConfig(config)));
        return;
      }

      json(res, 404, { ok: false, error: 'not_found', path: pathname });
    } catch (err) {
      json(res, err && err.statusCode ? err.statusCode : 500, {
        ok: false,
        error: 'internal_error',
        message: err && err.message ? err.message : String(err),
      });
    }
  });

  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  return { server, config, version: VERSION };
}

/** Запустить сервер (Promise). */
function start(config) {
  const { server } = createServer(config);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      resolve(server);
    });
  });
}

module.exports = { createServer, start, VERSION, isLoopback };
