# Разведка DOM arena.ai

Chat arena.ai — SPA на React, классы хешированные и меняются между сборками.
Поэтому расширение **не опирается на конкретные селекторы**: блок находится
по текстовому маркеру `<<<LOCAL_CMD>>>` внутри текстовых узлов документа.

Документ описывает, как проверить и починить поведение расширения, если
разметка чата изменится.

## Быстрая проверка в консоли страницы

Откройте `https://arena.ai`, F12 → Console:

```js
// 1. Найти текстовые узлы с маркером
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
const hits = [];
let n;
while ((n = walker.nextNode())) {
  if (n.nodeValue && n.nodeValue.includes('<<<LOCAL_CMD>>>')) hits.push(n);
}
console.log('маркеров:', hits.length);
hits.forEach((t) => console.log(t.parentElement.tagName, t.parentElement.className.slice(0, 80)));

// 2. Наименьший элемент, содержащий и начало, и конец блока
function blockContainer(node) {
  let el = node.parentElement;
  while (el && el !== document.body) {
    const t = el.textContent || '';
    if (t.includes('<<<LOCAL_CMD>>>') && t.includes('<<<END>>>')) return el;
    el = el.parentElement;
  }
  return null;
}
console.log(blockContainer(hits[0]));

// 3. Поле вложений чата
const files = Array.from(document.querySelectorAll('input[type="file"]'));
console.log(files.map((f) => ({ accept: f.accept, hidden: f.offsetParent === null })));

// 4. Кнопка «прикрепить файл»
const pattern = /attach|upload|прикреп|файл|file|paperclip/i;
console.log(Array.from(document.querySelectorAll('button,[role="button"]'))
  .filter((b) => pattern.test([b.getAttribute('aria-label'), b.title, b.textContent].join(' ')))
  .map((b) => b.getAttribute('aria-label') || b.textContent.trim().slice(0, 40)));

// 5. Поле ввода сообщения (для контекста)
console.log(Array.from(document.querySelectorAll('textarea,[contenteditable="true"]'))
  .map((t) => ({ tag: t.tagName, ph: t.placeholder || t.getAttribute('data-placeholder') })));
```

## Проверка прикрепления файла

```js
const input = document.querySelector('input[type="file"]');
const dt = new DataTransfer();
dt.items.add(new File(['test'], 'test.txt', { type: 'text/plain' }));
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set;
setter.call(input, dt.files);           // обход value-трекера React
input.dispatchEvent(new Event('change', { bubbles: true }));
console.log('файлов в input:', input.files.length);
```

Если файлы появились в input, но не отобразились в чате — интерфейс ждёт
нажатия кнопки отправки; это нормально, отправляет пользователь.

## Что делает расширение

1. **Поиск.** `content.js` обходит текстовые узлы (`TreeWalker`), находит узлы с
   маркером `<<<LOCAL_CMD>>>`.
2. **Контейнер.** Поднимается вверх до наименьшего элемента, чей `textContent`
   содержит и `<<<LOCAL_CMD>>>`, и `<<<END>>>` (обычно это `<pre>` с блоком кода).
3. **Разбор.** Из текста контейнера вырезаются все пары «маркер…маркер» — их может
   быть несколько в одном сообщении.
4. **Панель.** Сразу после контейнера вставляется панель `arena-bridge`.
5. **Дедуплизация.** Обработанный контейнер помечается атрибутом
   `data-ab-processed="1"`, повторный скан не дублирует панели.
6. **Реактивность.** `MutationObserver` на `document.body` + резервный
   `setInterval` на 2 секунды (SPA могла отрисовать сообщение до инициализации).

## Если блоки перестали находиться

1. Откройте консоль страницы и выполните «Быстрая проверка» выше.
2. Если `маркеров: 0` — модель не вывела блок в нужном формате (проверьте
   инструкцию из `docs/AI_INSTRUCTIONS.md`).
3. Если маркеры есть, а панели нет — проверьте, что расширение включено для
   `https://arena.ai` (`chrome://extensions` → «Подробнее» → «Разрешения сайта»).
4. Если контейнер не найден (маркеры разнесены по разным элементам) — правило
   «наименьший элемент с обоими маркерами» не срабатывает; поправьте
   `findBlockContainer()` в `extension/content.js`.

## Если файл не прикрепляется

1. Проверьте наличие `input[type="file"]` (пункт 3 выше). Если его нет до клика
   «прикрепить», расширение попробует нажать кнопку-скрепку и подождёт до 2 с.
2. Если input есть, но файл не виден в чате — интерфейс использует собственный
   обработчик; попробуйте «Скачать .log» + ручное прикрепление.
3. В крайнем случае используйте «Копировать путь» — файл лежит в
   `~/.arena-bridge/out/`.
