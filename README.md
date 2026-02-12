# CryptoPro CAdES `cadesplugin_api` (Modern TypeScript)

Modern, typed, Promise-like CryptoPro CAdES Browser Plug-in API loader for **Chromium** browsers.

Goals:
- Keep the upstream runtime behavior (`window.cadesplugin` is a thenable + has API methods).
- Drop legacy paths (IE/NPAPI/old Safari/iOS/etc).
- Make the loader testable and maintainable in strict TypeScript.

Non-goals:
- Firefox/Safari/iOS support (not tested, not targeted).

## Install / Use

### Recommended (modern async init)

This avoids the common pitfall with thenables where `await installCadesPlugin(...)` would resolve to `void`.

```ts
import { initCadesPlugin } from 'cryptopro-cadesplugin-api-ts';

const cadesplugin = await initCadesPlugin(window, document);
const store = await cadesplugin.CreateObjectAsync('CAdESCOM.Store');
```

### 1) Global drop-in (`window.cadesplugin`)

```ts
import 'cryptopro-cadesplugin-api-ts/cadesplugin_api';

// Later:
await window.cadesplugin;
const o = await window.cadesplugin!.CreateObjectAsync('CAdESCOM.Store');
```

### 2) Explicit initializer (tests / custom wiring)

```ts
import { installCadesPlugin } from 'cryptopro-cadesplugin-api-ts';

const cadesplugin = installCadesPlugin(window, document);
await cadesplugin;
```

## CSP Notes

If your application uses a strict CSP, you must allow the CryptoPro extension script origin(s) in:
- `script-src`
- `script-src-elem`

Also note: CSP is delivered via HTTP headers, so **SPA navigation does not change CSP**.
If your server applies different CSP per route, you may need a full reload to apply the correct policy.

## Upstream Reference (2.4.2)

This project is based on CryptoPro's upstream `cadesplugin_api.js` (`JSModuleVersion = "2.4.2"`).

For redistribution safety, the upstream script is **not committed** here by default.
Use `npm run upstream:fetch` to download it locally (see `upstream/README.md`).
