# Протокол arena-bridge

HTTP + JSON, только loopback. Базовый адрес по умолчанию: `http://127.0.0.1:7842`.

Аутентификация: заголовок `X-Token: <token>`. Для скачивания файла браузером
(`<a download>`) допускается альтернатива — query-параметр `?token=<token>`.

| Метод | Путь | Токен | Назначение |
|---|---|---|---|
| `GET` | `/health` | нет | проверка живости сервера |
| `GET` | `/status` | да | состояние сервера, workdir, allowlist |
| `POST` | `/exec` | да | выполнить команду |
| `GET` | `/file/:name` | да | скачать файл вывода |
| `GET` | `/history` | да | последние команды |
| `DELETE` | `/history` | да | очистить историю |
| `GET` | `/config` | да | текущий конфиг без токена |
| `PUT` | `/config` | да | изменить allowlist / denylist / workdir |

Ошибки авторизации: `401 {ok:false, error:"unauthorized"}`.
Ошибки политики: `403 {ok:false, error:"command_denied"|"cwd_denied", reason:"…"}`.
Ошибки разбора: `400 {ok:false, error:"bad_json"|"empty_command"}`.

## GET /health

```json
{ "ok": true, "name": "arena-bridge", "version": "1.0.0", "uptimeSec": 42, "tokenRequired": true }
```

## POST /exec

Запрос:

```json
{ "command": "mvn -q -o clean package", "cwd": "C:\\projects\\app", "timeoutMs": 300000 }
```

* `command` — обязательное поле, одна или несколько команд, соединённых `&&`, `||`, `;`, `|`.
* `cwd` — необязательное; по умолчанию `workdir` из конфига. Должен быть внутри `allowedRoots`.
* `timeoutMs` — необязательное; по умолчанию `execTimeoutMs`, максимум 3 600 000.

Ответ `200`:

```json
{
  "ok": true,
  "command": "mvn -q -o clean package",
  "cwd": "C:\\projects\\app",
  "exitCode": 0,
  "signal": null,
  "killed": false,
  "timedOut": false,
  "truncated": false,
  "durationMs": 12840,
  "file": "out-2026-10-15T13-10-00-123Z-a1b2c3.log",
  "filePath": "C:\\Users\\me\\.arena-bridge\\out\\out-2026-10-15T13-10-00-123Z-a1b2c3.log",
  "size": 18244,
  "preview": "…первые ~40 строк вывода…",
  "stdoutBytes": 17000,
  "stderrBytes": 1200,
  "downloadUrl": "http://127.0.0.1:7842/file/out-2026-10-15T13-10-00-123Z-a1b2c3.log",
  "fileUrl": "/file/out-2026-10-15T13-10-00-123Z-a1b2c3.log"
}
```

`exitCode: null` + `killed: true` — процесс убит по таймауту или из-за превышения
лимита вывода. `truncated: true` — вывод обрезан по `maxOutputBytes`.

Ответ `403`:

```json
{ "ok": false, "error": "command_denied", "reason": "команда «rm» не входит в allowlist …" }
```

## GET /file/:name

Отдаёт файл вывода как `text/plain; charset=utf-8` с заголовком
`Content-Disposition: attachment`. Имя файла проверяется по шаблону
`[A-Za-z0-9._-]+`, выход за пределы каталога `out` невозможен.

## Формат файла вывода

```
# arena-bridge: результат выполнения команды
# command : mvn -q -o clean package
# cwd     : C:\projects\app
# started : 2026-10-15T13:10:00.000Z
# duration: 12840 ms
# exitCode: 0
# killed  : no
# truncated: no

===== STDOUT =====
…

===== STDERR =====
…
```

## GET /history

```json
{ "ok": true, "count": 12, "entries": [
  { "ts": "2026-10-15T13:10:00.000Z", "command": "mvn -q -o clean package",
    "cwd": "C:\\projects\\app", "status": "done", "exitCode": 0,
    "durationMs": 12840, "file": "out-….log", "size": 18244 }
] }
```

`status` — `done` или `denied` (запись о заблокированной команде тоже попадает в историю).

## GET /config и PUT /config

`GET` возвращает конфиг без токена. `PUT` принимает изменяемые поля:
`workdir`, `allowedRoots`, `allowedCommands`, `deniedPatterns`, `allowedProgramPaths`,
`allowedOrigins`, `allowShellMetacharacters`, `allowAbsoluteProgramPaths`,
`maxOutputBytes`, `execTimeoutMs`, `previewLines`, `historyLimit`.
Изменения сразу применяются в работающем сервере и сохраняются в `config.json`.

## CORS

Сервер отвечает с `Access-Control-Allow-Origin` только для:

* расширений (`chrome-extension://…`, `moz-extension://…`, `edge-extension://…`);
* origins из списка `allowedOrigins` (по умолчанию `https://arena.ai`, `https://*.arena.ai`).

Используется только как фолбэк, когда service worker расширения был выгружен
браузером и content script выполняет запрос напрямую. Токен при этом всё равно
нужен — CORS не даёт доступа без него.
