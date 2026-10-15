'use strict';

const test = require('node:test');
const assert = require('node:assert');

const markers = require('../lib/markers.js');

/** Минимальный DOM-заглушка: элементы, текстовые узлы, textContent. */
class StubText {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.parentElement = null;
  }

  get textContent() {
    return this.nodeValue;
  }
}

class StubElement {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.parentElement = null;
    this.dataset = {};
  }

  appendChild(node) {
    node.parentElement = this;
    this.childNodes.push(node);
    return node;
  }

  appendText(value) {
    return this.appendChild(new StubText(value));
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent).join('');
  }
}

test('parseBlocks достаёт команду из блока', () => {
  const text = 'Вот команда:\n<<<LOCAL_CMD>>>\nmvn -q -o clean package\n<<<END>>>\nГотово.';
  assert.deepEqual(markers.parseBlocks(text), ['mvn -q -o clean package']);
});

test('parseBlocks достаёт несколько команд из одного сообщения', () => {
  const text = [
    '<<<LOCAL_CMD>>>',
    'echo one',
    '<<<END>>>',
    'а затем',
    '<<<LOCAL_CMD>>>',
    'echo two',
    '<<<END>>>',
  ].join('\n');
  assert.deepEqual(markers.parseBlocks(text), ['echo one', 'echo two']);
});

test('parseBlocks игнорирует незакрытый блок', () => {
  assert.deepEqual(markers.parseBlocks('<<<LOCAL_CMD>>>\necho one'), []);
  assert.deepEqual(markers.parseBlocks('обычный текст без маркера'), []);
});

test('findBlockContainer находит наименьший элемент с обоими маркерами', () => {
  const message = new StubElement('div');
  const pre = new StubElement('pre');
  pre.appendText('<<<LOCAL_CMD>>>\necho hi\n<<<END>>>');
  message.appendChild(pre);

  const textNode = pre.childNodes[0];
  const container = markers.findBlockContainer(textNode, message);
  assert.equal(container, pre);
});

test('findBlockContainer возвращает null, если маркеры в разных элементах', () => {
  const message = new StubElement('div');
  const first = new StubElement('p');
  first.appendText('<<<LOCAL_CMD>>>');
  const second = new StubElement('pre');
  second.appendText('echo hi\n<<<END>>>');
  message.appendChild(first);
  message.appendChild(second);

  const container = markers.findBlockContainer(first.childNodes[0], message);
  assert.equal(container, null);
});

test('findMarkerNodes находит текстовые узлы с маркером', () => {
  const message = new StubElement('div');
  const pre = new StubElement('pre');
  pre.appendText('<<<LOCAL_CMD>>>\necho hi\n<<<END>>>');
  const other = new StubElement('p');
  other.appendText('просто текст');
  message.appendChild(pre);
  message.appendChild(other);

  const found = markers.findMarkerNodes(message);
  assert.equal(found.length, 1);
  assert.equal(found[0].nodeValue, '<<<LOCAL_CMD>>>\necho hi\n<<<END>>>');
});
