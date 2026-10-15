'use strict';

/** История выполненных команд: ~/.arena-bridge/history.json (последние N записей). */

const fs = require('fs');
const path = require('path');

function historyPath(stateDir) {
  return path.join(stateDir, 'history.json');
}

/** Прочитать историю. */
function readHistory(stateDir) {
  const file = historyPath(stateDir);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/** Добавить запись в историю (атомарная запись, с обрезкой до limit). */
function appendHistory(stateDir, entry, limit = 200) {
  const history = readHistory(stateDir);
  history.push(entry);
  while (history.length > limit) history.shift();

  fs.mkdirSync(stateDir, { recursive: true });
  const file = historyPath(stateDir);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(history, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return history;
}

/** Очистить историю. */
function clearHistory(stateDir) {
  const file = historyPath(stateDir);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return [];
}

module.exports = { historyPath, readHistory, appendHistory, clearHistory };
