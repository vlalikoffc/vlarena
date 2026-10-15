# vlarena

Репозиторий с проектом **arena-bridge** — мост между чатом [arena.ai](https://arena.ai)
и локальным ПК пользователя.

Модель в чате предлагает команду в блоке `<<<LOCAL_CMD>>>`, браузерное расширение
показывает её пользователю, после подтверждения команда выполняется на локальной
машине, а файл с выводом прикрепляется обратно в чат.

```
arena-bridge/
├── server/      # локальный HTTP-сервер выполнения команд (Node.js, без зависимостей)
├── extension/   # Chrome/Edge MV3-расширение для arena.ai
├── docs/        # протокол, инструкция для ИИ, разведка DOM
└── tools/       # генератор иконок, smoke-тест
```

## Быстрый старт

```bash
cd arena-bridge
node server/index.js        # поднимет сервер на 127.0.0.1:7842 и напечатает токен
```

Далее: `chrome://extensions` → «Режим разработчика» → «Загрузить распакованное
расширение» → папка `arena-bridge/extension`; в popup вставить токен из консоли.

Полная инструкция: **[arena-bridge/README.md](arena-bridge/README.md)**.

## Документация

* [Установка и использование](arena-bridge/README.md)
* [HTTP-протокол сервера](arena-bridge/docs/PROTOCOL.md)
* [Инструкция для модели arena.ai](arena-bridge/docs/AI_INSTRUCTIONS.md)
* [Разведка DOM arena.ai](arena-bridge/docs/DOM_RESEARCH.md)
* [Селекторы расширения и устойчивость](arena-bridge/extension/selectors.md)

## Тесты

```bash
cd arena-bridge
npm install   # только dev-зависимость jsdom для тестов расширения
npm test      # 38 тестов: сервер + content script в jsdom + сквозной тест background
```

## Безопасность

Сервер слушает только `127.0.0.1`, требует токен сопряжения, выполняет только
команды из allowlist, отклоняет деструктивные паттерны и никогда не запускает
команду без подтверждения пользователя в чате. Подробности — в
[arena-bridge/README.md](arena-bridge/README.md#5-безопасность).
