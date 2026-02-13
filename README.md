# CryptoPro CAdES `cadesplugin_api` (Modern TypeScript)

Modern, typed loader for CryptoPro CAdES Browser Plug-in API on **Chromium** browsers.

- [English](#english)
- [Русский](#русский)

---

## English

What this package provides:
- A typed implementation compatible with CryptoPro's upstream `cadesplugin_api.js` runtime behavior:
`window.cadesplugin` is a **thenable** (Promise-like) object extended with API methods.
- A **modern non-thenable client** wrapper to avoid the common “thenable unwrapping” trap in `async/await`.
- A maintainable, testable TypeScript codebase (no IE/NPAPI/Safari/iOS legacy paths).

Non-goals:
- Firefox/Safari/iOS support (not tested, not targeted).

## Requirements

- Chromium browser (Chrome / Edge / Opera / Yandex).
- CryptoPro CAdES browser extension installed + enabled.
- CryptoPro native components installed (extension must be able to handshake with the native host).

## Install

```bash
npm i cryptopro-cadesplugin-api-ts
```

## Usage

### Recommended (modern client API)

```ts
import { initCadesPluginClient } from 'cryptopro-cadesplugin-api-ts';

const cades = await initCadesPluginClient(window, document, {
  timeoutMs: 20_000,
});

const store = await cades.CreateObjectAsync('CAdESCOM.Store');
```

### Global drop-in (`window.cadesplugin`)

```ts
import 'cryptopro-cadesplugin-api-ts/cadesplugin_api';

await window.cadesplugin;
const store = await window.cadesplugin!.CreateObjectAsync('CAdESCOM.Store');
```

### Explicit initializer (tests / custom wiring)

```ts
import { installCadesPlugin } from 'cryptopro-cadesplugin-api-ts';

const cadesplugin = installCadesPlugin(window, document);
await cadesplugin;
```

## Install Options

All options are optional:
- `timeoutMs`: overall init timeout (defaults to ~20000ms; also respects `window.cadesplugin_load_timeout`).
- `handshakeTimeoutMs`: postMessage handshake timeout (defaults to `min(5000, timeoutMs)`).
- `extensionIds`: override extension IDs to try (converted to `chrome-extension://<id>/nmcades_plugin_api.js`).
- `extensionApiUrls`: override full `chrome-extension://.../nmcades_plugin_api.js` URLs to try.
- `logger`: custom logger callback.
- `logLevel`: `1` (error), `2` (info), `4` (debug).

## Error Handling (Stable Error Codes)

Initialization rejects with `CadesPluginError` that includes a stable `.code`:

```ts
import {
  initCadesPluginClient,
  isCadesPluginError,
} from 'cryptopro-cadesplugin-api-ts';

try {
  const cades = await initCadesPluginClient(window, document);
  // ...
} catch (e) {
  if (isCadesPluginError(e)) console.error('CryptoPro init failed:', e.code, e.details);
  throw e;
}
```

Error codes:
- `INVALID_OPTIONS`
- `PLUGIN_LOAD_TIMEOUT`
- `EXTENSION_API_LOAD_FAILED`
- `CSP_BLOCKED`
- `EXTENSION_API_MISSING`
- `HANDSHAKE_TIMEOUT`
- `NATIVE_HOST_HANDSHAKE_FAILED`
- `PLUGIN_OBJECT_MISSING`
- `UNKNOWN`

## CSP Notes

CryptoPro loads an extension script (`nmcades_plugin_api.js`) from a `chrome-extension://...` origin.
If your site uses strict CSP, allow the CryptoPro extension origin(s) in:
- `script-src`
- `script-src-elem`

This package exports known origins as `CRYPTOPRO_EXTENSION_ORIGINS` (and IDs as `CRYPTOPRO_EXTENSION_IDS`).

Important: CSP is delivered via HTTP headers, so **SPA navigation does not change CSP**.
If your server applies different CSP per route, you may need a full reload to apply the correct policy.

## Security Notes

If your app has public pages and an admin area, prefer allowing `chrome-extension://...` script sources
only on trusted routes (for example `/admin`) via route-scoped CSP headers.

## Upstream Reference (2.4.2)

This project is compatible with CryptoPro's upstream `cadesplugin_api.js` (`JSModuleVersion = "2.4.2"`).

For redistribution safety, the upstream script is **not committed** here by default.
Use `npm run upstream:fetch` to download it locally (see `upstream/README.md`).

---

## Русский

Современный и типизированный загрузчик CryptoPro CAdES Browser Plug-in API для **Chromium** браузеров.

Что дает пакет:
- Типизированная реализация, совместимая с поведением оригинального `cadesplugin_api.js`:
`window.cadesplugin` — это **thenable** (Promise-like) объект, расширенный методами API.
- **Современный non-thenable client**-wrapper, чтобы избежать типичной ловушки “thenable unwrapping” в `async/await`.
- Поддерживаемый TypeScript-код без legacy-путей (IE/NPAPI/Safari/iOS).

Не цель:
- Firefox/Safari/iOS (не тестируется, не поддерживается).

### Требования

- Chromium браузер (Chrome / Edge / Opera / Yandex).
- Установлено и включено расширение CryptoPro CAdES.
- Установлены нативные компоненты CryptoPro (расширение должно уметь сделать handshake с native host).

### Установка

```bash
npm i cryptopro-cadesplugin-api-ts
```

### Использование

#### Рекомендуемый вариант (modern client API)

```ts
import { initCadesPluginClient } from 'cryptopro-cadesplugin-api-ts';

const cades = await initCadesPluginClient(window, document, {
  timeoutMs: 20_000,
});

const store = await cades.CreateObjectAsync('CAdESCOM.Store');
```

#### Drop-in глобально (`window.cadesplugin`)

```ts
import 'cryptopro-cadesplugin-api-ts/cadesplugin_api';

await window.cadesplugin;
const store = await window.cadesplugin!.CreateObjectAsync('CAdESCOM.Store');
```

#### Явная инициализация (тесты / кастомная интеграция)

```ts
import { installCadesPlugin } from 'cryptopro-cadesplugin-api-ts';

const cadesplugin = installCadesPlugin(window, document);
await cadesplugin;
```

### Опции установки

Все опции необязательны:
- `timeoutMs`: общий таймаут инициализации (по умолчанию ~20000ms; также учитывается `window.cadesplugin_load_timeout`).
- `handshakeTimeoutMs`: таймаут postMessage-handshake (по умолчанию `min(5000, timeoutMs)`).
- `extensionIds`: переопределить extension ID (конвертируется в `chrome-extension://<id>/nmcades_plugin_api.js`).
- `extensionApiUrls`: переопределить полный список URL `chrome-extension://.../nmcades_plugin_api.js`.
- `logger`: кастомный логгер.
- `logLevel`: `1` (error), `2` (info), `4` (debug).

### Обработка ошибок (стабильные error-codes)

При ошибке инициализации будет `CadesPluginError` со стабильным `.code`:

```ts
import { initCadesPluginClient, isCadesPluginError } from 'cryptopro-cadesplugin-api-ts';

try {
  const cades = await initCadesPluginClient(window, document);
  // ...
} catch (e) {
  if (isCadesPluginError(e)) console.error('CryptoPro init failed:', e.code, e.details);
  throw e;
}
```

Коды ошибок:
- `INVALID_OPTIONS`
- `PLUGIN_LOAD_TIMEOUT`
- `EXTENSION_API_LOAD_FAILED`
- `CSP_BLOCKED`
- `EXTENSION_API_MISSING`
- `HANDSHAKE_TIMEOUT`
- `NATIVE_HOST_HANDSHAKE_FAILED`
- `PLUGIN_OBJECT_MISSING`
- `UNKNOWN`

### CSP (важно)

CryptoPro подгружает extension-скрипт (`nmcades_plugin_api.js`) с `chrome-extension://...` origin.
Если у вас строгий CSP, разрешите CryptoPro origins в:
- `script-src`
- `script-src-elem`

Пакет экспортирует известные origins как `CRYPTOPRO_EXTENSION_ORIGINS` (и IDs как `CRYPTOPRO_EXTENSION_IDS`).

Важно: CSP приходит через HTTP headers, поэтому **SPA-навигация CSP не меняет**.
Если CSP на сервере отличается по роутам — часто требуется полный reload на нужном роуте.

### Security

Если у вас есть публичная часть сайта и админка, лучше разрешать `chrome-extension://...` только
на доверенных роутам (например `/admin`) через route-scoped CSP headers.

### Upstream Reference (2.4.2)

Проект совместим с оригинальным `cadesplugin_api.js` от CryptoPro (`JSModuleVersion = "2.4.2"`).

Для безопасности распространения оригинальный upstream-скрипт по умолчанию **не коммитится**.
Используйте `npm run upstream:fetch` чтобы скачать его локально (см. `upstream/README.md`).
