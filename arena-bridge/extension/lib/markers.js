/**
 * Чистая логика работы с маркерами <<<LOCAL_CMD>>>.
 *
 * Файл загружается и как content script (Chrome), и через require() в тестах
 * (Node), поэтому используется UMD-обёртка.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ArenaBridgeMarkers = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const START = '<<<LOCAL_CMD>>>';
  const END = '<<<END>>>';

  /** Найти диапазоны маркеров в тексте: [{start, end, command}]. */
  function findMarkerRanges(text) {
    const source = String(text || '');
    const ranges = [];
    let cursor = 0;
    for (;;) {
      const startIndex = source.indexOf(START, cursor);
      if (startIndex < 0) break;
      const endIndex = source.indexOf(END, startIndex + START.length);
      if (endIndex < 0) break;
      const command = source.slice(startIndex + START.length, endIndex).trim();
      if (command) {
        ranges.push({ start: startIndex, end: endIndex, command });
      }
      cursor = endIndex + END.length;
    }
    return ranges;
  }

  /** Разобрать все команды из текста контейнера. */
  function parseBlocks(text) {
    return findMarkerRanges(text).map((range) => range.command);
  }

  /** Текстовые узлы, содержащие маркер начала блока. */
  function findMarkerNodes(root) {
    const found = [];
    if (!root) return found;
    if (typeof document !== 'undefined' && root === document.body) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue && node.nodeValue.includes(START)) found.push(node);
      }
      return found;
    }
    // Фолбэк для окружений без document (тесты): рекурсивный обход.
    const visit = (node) => {
      if (!node) return;
      const children = node.childNodes || [];
      for (const child of children) {
        if (child.nodeType === 3) {
          if (child.nodeValue && child.nodeValue.includes(START)) found.push(child);
        } else {
          visit(child);
        }
      }
    };
    visit(root);
    return found;
  }

  /**
   * Наименьший элемент, содержащий и начало, и конец блока.
   * Возвращает null, если блок разнесён по разным элементам.
   */
  function findBlockContainer(startNode, boundary) {
    const stop = boundary || (typeof document !== 'undefined' ? document.body : null);
    let element = startNode && startNode.parentElement;
    while (element && element !== stop) {
      const text = element.textContent || '';
      if (text.includes(START) && text.includes(END)) return element;
      element = element.parentElement;
    }
    return null;
  }

  return { START, END, findMarkerRanges, parseBlocks, findMarkerNodes, findBlockContainer };
}));
