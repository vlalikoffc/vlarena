'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  splitSegments,
  extractProgram,
  normalizeProgram,
  findUnsafeShellSyntax,
  resolveCwd,
  checkCommand,
} = require('../lib/policy');
const { defaultConfig } = require('../lib/config');

function config(overrides = {}) {
  const cfg = defaultConfig();
  cfg.workdir = '/tmp/project';
  cfg.allowedRoots = ['/tmp/project'];
  return Object.assign(cfg, overrides);
}

test('splitSegments разделяет по операторам shell', () => {
  assert.deepEqual(splitSegments('mvn package && gradle build'), ['mvn package', 'gradle build']);
  assert.deepEqual(splitSegments('a | b ; c'), ['a', 'b', 'c']);
  assert.deepEqual(splitSegments('echo one && echo two | wc -l'), ['echo one', 'echo two', 'wc -l']);
});

test('splitSegments не путает 2>&1 с оператором &', () => {
  assert.deepEqual(splitSegments('mvn -q 2>&1'), ['mvn -q 2>&1']);
});

test('extractProgram достаёт имя программы', () => {
  assert.equal(extractProgram('mvn -q clean package'), 'mvn');
  assert.equal(extractProgram('"C:\\Program Files\\Java\\bin\\java.exe" -version'), 'C:\\Program Files\\Java\\bin\\java.exe');
  assert.equal(extractProgram('git status'), 'git');
});

test('normalizeProgram убирает путь и расширение', () => {
  assert.equal(normalizeProgram('C:\\tools\\mvn.cmd'), 'mvn');
  assert.equal(normalizeProgram('./gradlew'), 'gradlew');
  assert.equal(normalizeProgram('java.exe'), 'java');
});

test('findUnsafeShellSyntax ловит подстановки и перенаправления', () => {
  assert.ok(findUnsafeShellSyntax('mvn `whoami`').length > 0);
  assert.ok(findUnsafeShellSyntax('mvn $(whoami)').length > 0);
  assert.ok(findUnsafeShellSyntax('mvn > out.txt').length > 0);
  assert.equal(findUnsafeShellSyntax('mvn -q 2>&1').length, 0);
});

test('checkCommand разрешает команды из allowlist', () => {
  const res = checkCommand('mvn -q -o clean package', config());
  assert.equal(res.allowed, true);
});

test('checkCommand отклоняет команду вне allowlist', () => {
  const res = checkCommand('curl http://example.com', config({ allowedCommands: ['mvn'] }));
  assert.equal(res.allowed, false);
  assert.match(res.reason, /allowlist/);
});

test('checkCommand отклоняет скрытую деструктивную команду в цепочке', () => {
  const res = checkCommand('mvn package && rm -rf /', config());
  assert.equal(res.allowed, false);
});

test('checkCommand отклоняет denylist-паттерны', () => {
  const res = checkCommand('echo hello', config({ deniedPatterns: ['hello'] }));
  assert.equal(res.allowed, false);
});

test('checkCommand отклоняет перенаправление по умолчанию', () => {
  assert.equal(checkCommand('mvn package > build.log', config()).allowed, false);
  assert.equal(
    checkCommand('mvn package > build.log', config({ allowShellMetacharacters: true })).allowed,
    true,
  );
});

test('checkCommand проверяет путь к программе', () => {
  const res = checkCommand('C:\\Windows\\System32\\calc.exe', config());
  assert.equal(res.allowed, false);
});

test('resolveCwd ограничивает рабочую директорию', () => {
  assert.equal(resolveCwd(null, config()).ok, true);
  assert.equal(resolveCwd('/tmp/project/module', config()).ok, true);
  assert.equal(resolveCwd('/etc', config()).ok, false);
});
