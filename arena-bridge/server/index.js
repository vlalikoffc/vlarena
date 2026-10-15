#!/usr/bin/env node
'use strict';

/**
 * Точка входа bridge-сервера.
 *
 *   node server/index.js [--port 7842] [--host 127.0.0.1] [--workdir C:\path\to\project]
 *                        [--config C:\path\config.json] [--print-token]
 */

const fs = require('fs');
const path = require('path');

const { loadConfig, saveConfig, isLoopback } = require('./lib/config');
const { start } = require('./app');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(
    args.config || path.join(__dirname, 'config.json'),
  );

  let config;
  try {
    config = loadConfig(configPath);
  } catch (e) {
    console.error(`[arena-bridge] ${e.message}`);
    process.exit(1);
  }

  if (args.port) config.port = Number(args.port);
  if (args.host) config.host = String(args.host);
  if (args.workdir) config.workdir = path.resolve(String(args.workdir));
  if (args['print-token']) {
    console.log(config.token);
    return;
  }

  if (!isLoopback(config.host)) {
    console.error(
      '[arena-bridge] ВНИМАНИЕ: сервер слушает не только loopback-интерфейс.\n'
      + '  Это открывает удалённое выполнение команд. Токен — единственная защита.',
    );
  }

  // Файл конфига создаётся при первом запуске, токен в нём сохраняется.
  if (!config.configFileExists || fs.existsSync(configPath)) {
    try {
      saveConfig(configPath, config);
    } catch (e) {
      console.error(`[arena-bridge] Не удалось сохранить конфиг: ${e.message}`);
    }
  }

  fs.mkdirSync(config.stateDir, { recursive: true });

  start(config).then(() => {
    const banner = [
      '',
      '  arena-bridge — локальный сервер выполнения команд',
      '  ------------------------------------------------',
      `  адрес        : http://${config.host}:${config.port}`,
      `  токен       : ${config.token}`,
      `  рабочая папка: ${config.workdir}`,
      `  корни       : ${config.allowedRoots.join(', ')}`,
      `  история     : ${path.join(config.stateDir, 'history.json')}`,
      `  конфиг      : ${configPath}`,
      '',
      '  Введите токен в popup расширения arena-bridge.',
      '  Остановить: Ctrl+C',
      '',
    ].join('\n');
    console.log(banner);
  }).catch((err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[arena-bridge] Порт ${config.port} уже занят. Укажите другой: --port 7843`);
    } else if (err && err.code === 'EACCES') {
      console.error(`[arena-bridge] Нет прав на порт ${config.port}. Укажите другой: --port 7843`);
    } else {
      console.error(`[arena-bridge] Не удалось запустить сервер: ${err.message}`);
    }
    process.exit(1);
  });
}

if (require.main === module) {
  main();
}

module.exports = { main };
