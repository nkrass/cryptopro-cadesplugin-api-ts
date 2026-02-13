import type { CadesPluginGlobal, LogLevel } from './cadesplugin_api.types';
import {
  buildCryptoProExtensionApiUrls,
  detectBrowser,
  isCadesPluginLoadedMessage,
  parsePostMessageStringResponse,
} from './cadesplugin_api.utils';

type ChromeNmcadesApi = {
  check_chrome_plugin: (onOk: () => void, onError: (e?: unknown) => void) => void;
  ReleasePluginObjects?: () => unknown;
};

type PluginObject = {
  CreateObjectAsync?: (name: string) => unknown;
  getLastError?: () => string;
};

function isErrorWithMessage(value: unknown): value is { message: string } {
  return Boolean(value && typeof value === 'object' && 'message' in value);
}

function getMessageFromException(exception: unknown): string {
  if (isErrorWithMessage(exception) && typeof exception.message === 'string') {
    return exception.message;
  }
  if (typeof exception === 'string') return exception;
  try {
    return JSON.stringify(exception);
  } catch {
    return String(exception);
  }
}

type CspViolationInfo = {
  blockedURI: string;
  effectiveDirective: string;
  violatedDirective: string;
};

function createCspViolationRecorder(doc: Document) {
  const violations: CspViolationInfo[] = [];

  const handler = (event: Event) => {
    const blockedURI = String((event as any)?.blockedURI ?? '');
    if (!blockedURI) return;
    violations.push({
      blockedURI,
      effectiveDirective: String((event as any)?.effectiveDirective ?? ''),
      violatedDirective: String((event as any)?.violatedDirective ?? ''),
    });
  };

  doc.addEventListener('securitypolicyviolation', handler as any);

  return {
    findByBlockedUri: (uri: string): CspViolationInfo | null =>
      violations.find((v) => v.blockedURI === uri) ?? null,
    stop: () => doc.removeEventListener('securitypolicyviolation', handler as any),
  };
}

function loadScript(doc: Document, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.defer = true;
    script.src = src;

    const cleanup = () => {
      script.onload = null;
      script.onerror = null;
    };

    script.onload = () => {
      cleanup();
      resolve();
    };

    script.onerror = () => {
      cleanup();
      try {
        script.remove();
      } catch {
        // ignore
      }
      reject(new Error(`Failed to load script: ${src}`));
    };

    doc.head.appendChild(script);
  });
}

function waitForMessage(
  win: Window,
  predicate: (event: MessageEvent) => boolean,
  timeoutMs: number,
): Promise<MessageEvent> {
  return new Promise((resolve, reject) => {
    const timer = win.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for CryptoPro extension handshake'));
    }, Math.max(0, timeoutMs));

    const handler = (event: MessageEvent) => {
      try {
        if (!predicate(event)) return;
        cleanup();
        resolve(event);
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    const cleanup = () => {
      win.clearTimeout(timer);
      win.removeEventListener('message', handler as any, false);
    };

    win.addEventListener('message', handler as any, false);
  });
}

function normalizeErrorForUser(error: unknown): string {
  const message = getMessageFromException(error);
  return message || 'CryptoPro plugin is not available';
}

export function installCadesPlugin(win: Window, doc: Document): CadesPluginGlobal {
  const existing = (win as any).cadesplugin as unknown;
  if (
    existing &&
    typeof (existing as any).then === 'function' &&
    typeof (existing as any).CreateObjectAsync === 'function' &&
    typeof (existing as any).async_spawn === 'function'
  ) {
    return existing as CadesPluginGlobal;
  }

  let pluginObject: PluginObject | null = null;
  let settled = false;
  let resolveInit: (() => void) | null = null;
  let rejectInit: ((reason?: unknown) => void) | null = null;

  const initPromise = new Promise<void>((resolve, reject) => {
    resolveInit = resolve;
    rejectInit = reject;
  });

  const resolveOnce = () => {
    if (settled) return;
    settled = true;
    resolveInit?.();
  };

  const rejectOnce = (reason?: unknown) => {
    if (settled) return;
    settled = true;
    rejectInit?.(reason);
  };

  const LOG_LEVEL_DEBUG: LogLevel = 4;
  const LOG_LEVEL_INFO: LogLevel = 2;
  const LOG_LEVEL_ERROR: LogLevel = 1;

  let currentLogLevel: LogLevel = LOG_LEVEL_ERROR;

  const cpcsp_console_log = (level: LogLevel, msg: unknown) => {
    // Avoid crashing on environments without a console (unlikely in modern browsers).
    if (typeof console === 'undefined') return;
    if (level > currentLogLevel) return;
    if (level === LOG_LEVEL_DEBUG) console.log('DEBUG:', msg);
    else if (level === LOG_LEVEL_INFO) console.info('INFO:', msg);
    else if (level === LOG_LEVEL_ERROR) console.error('ERROR:', msg);
  };

  const set_pluginObject = (obj: unknown) => {
    pluginObject = (obj ?? null) as any;
  };

  const CreateObjectAsync = (name: string) => {
    if (!pluginObject?.CreateObjectAsync) {
      throw new Error('CryptoPro plugin is not ready (plugin object is missing)');
    }
    return pluginObject.CreateObjectAsync(name);
  };

  const async_spawn = async function <T>(
    generatorFunc: (args: any[]) => Generator<any, T, any>,
    ...args: any[]
  ): Promise<T> {
    // Upstream `cadesplugin_api.js` passes all args (except generatorFunc) as a single array argument.
    // The extension scripts (nmcades_plugin_api.js) rely on this calling convention.
    const generator = generatorFunc(args);

    const step = (verb: 'next' | 'throw', arg?: any): Promise<any> => {
      let result: IteratorResult<any, T>;
      try {
        result = (generator as any)[verb](arg);
      } catch (err) {
        return Promise.reject(err);
      }

      if (result.done) {
        return Promise.resolve(result.value);
      }

      return Promise.resolve(result.value).then(
        (val) => step('next', val),
        (err) => step('throw', err),
      );
    };

    return step('next');
  };

  const getLastError = (exception: unknown): string => {
    try {
      const lastError = pluginObject?.getLastError?.();
      if (typeof lastError === 'string' && lastError) {
        return lastError;
      }
    } catch {
      // ignore
    }
    return normalizeErrorForUser(exception);
  };

  const get_extension_version = (callback: (version: string) => void) => {
    const origin = (() => {
      try {
        return win.location.origin;
      } catch {
        return null;
      }
    })();

    win.postMessage('cadesplugin_extension_version_request', '*');
    const handler = (event: MessageEvent) => {
      if (event.source !== win) return;
      if (origin && event.origin !== origin) return;

      const version = parsePostMessageStringResponse(
        event.data,
        'cadesplugin_extension_version_response:',
      );
      if (!version) return;

      win.removeEventListener('message', handler as any, false);
      callback(version);
    };

    win.addEventListener('message', handler as any, false);
  };

  const get_extension_id = (callback: (id: string) => void) => {
    const origin = (() => {
      try {
        return win.location.origin;
      } catch {
        return null;
      }
    })();

    win.postMessage('cadesplugin_extension_id_request', '*');
    const handler = (event: MessageEvent) => {
      if (event.source !== win) return;
      if (origin && event.origin !== origin) return;

      const id = parsePostMessageStringResponse(
        event.data,
        'cadesplugin_extension_id_response:',
      );
      if (!id) return;

      win.removeEventListener('message', handler as any, false);
      callback(id);
    };

    win.addEventListener('message', handler as any, false);
  };

  const set_log_level = (level: LogLevel) => {
    if (level !== LOG_LEVEL_DEBUG && level !== LOG_LEVEL_INFO && level !== LOG_LEVEL_ERROR) {
      cpcsp_console_log(LOG_LEVEL_ERROR, `Incorrect log_level: ${String(level)}`);
      return;
    }

    currentLogLevel = level;

    // Forward the level to the extension (best-effort).
    const suffix = level === LOG_LEVEL_DEBUG ? 'debug' : level === LOG_LEVEL_INFO ? 'info' : 'error';
    try {
      win.postMessage(`set_log_level=${suffix}`, '*');
    } catch {
      // ignore
    }
  };

  const ReleasePluginObjects = () => {
    const api = (win as any).cpcsp_chrome_nmcades as ChromeNmcadesApi | undefined;
    if (!api?.ReleasePluginObjects) {
      throw new Error('CryptoPro extension API is not available (cpcsp_chrome_nmcades missing)');
    }
    return api.ReleasePluginObjects();
  };

  // Thenable object (Promise-like) extended with CryptoPro API methods.
  const cadesplugin: CadesPluginGlobal = {
    then: initPromise.then.bind(initPromise),
    catch: initPromise.catch.bind(initPromise),
    finally: initPromise.finally.bind(initPromise),

    JSModuleVersion: '2.4.2',

    LOG_LEVEL_DEBUG,
    LOG_LEVEL_INFO,
    LOG_LEVEL_ERROR,
    get current_log_level() {
      return currentLogLevel;
    },
    set current_log_level(level: LogLevel) {
      currentLogLevel = level;
    },
    set_log_level,

    get_extension_version,
    get_extension_id,

    async_spawn,
    CreateObjectAsync,
    getLastError,

    set: set_pluginObject,
    ReleasePluginObjects,
  };

  // CryptoPro extension scripts expect `window.cadesplugin` to exist and expose `.set(...)`.
  // Setting it here makes the functional API usable without relying on a side-effect import.
  try {
    (win as any).cadesplugin = cadesplugin;
  } catch {
    // ignore
  }

  const loadTimeoutMsRaw = Number((win as any).cadesplugin_load_timeout);
  const loadTimeoutMs = Number.isFinite(loadTimeoutMsRaw) && loadTimeoutMsRaw > 0 ? loadTimeoutMsRaw : 20_000;

  const timeoutId = win.setTimeout(() => {
    rejectOnce(new Error('CryptoPro plugin load timeout (extension missing or blocked)'));
  }, loadTimeoutMs);

  const settleOk = () => {
    win.clearTimeout(timeoutId);
    resolveOnce();
  };

  const settleError = (error?: unknown) => {
    win.clearTimeout(timeoutId);
    if (error instanceof Error) {
      rejectOnce(error);
      return;
    }
    rejectOnce(new Error(normalizeErrorForUser(error)));
  };

  const init = async () => {
    try {
      // If your app uses route-scoped CSP headers, note that SPA navigation does not change CSP.
      // When extension script loading fails, a full reload on the target route is often required.

      const browser = detectBrowser(win.navigator.userAgent);
      const urls = buildCryptoProExtensionApiUrls(browser);

      let loadedUrl: string | null = null;
      let lastLoadError: unknown = null;
      let lastCspViolation: CspViolationInfo | null = null;

      const csp = createCspViolationRecorder(doc);
      try {
        for (const url of urls) {
          try {
            await loadScript(doc, url);
            loadedUrl = url;
            break;
          } catch (e) {
            lastLoadError = e;
            lastCspViolation = csp.findByBlockedUri(url) ?? lastCspViolation;
          }
        }
      } finally {
        csp.stop();
      }

      if (!loadedUrl) {
        const details = normalizeErrorForUser(lastLoadError);
        const cspHint = lastCspViolation
          ? `CSP blocked the extension script (directive: ${
              lastCspViolation.effectiveDirective || lastCspViolation.violatedDirective || 'unknown'
            }, blockedURI: ${lastCspViolation.blockedURI}).`
          : '';
        throw new Error(
          [
            'CryptoPro extension API script failed to load.',
            'Make sure the CryptoPro CAdES extension is installed and enabled.',
            'If your site uses strict CSP, it must allow the CryptoPro extension origins in script-src/script-src-elem.',
            'If your server applies CSP per-route, do a full page reload on the route where CryptoPro is enabled.',
            cspHint,
            `Details: ${details}`,
          ]
            .filter(Boolean)
            .join(' '),
        );
      }

      const api = (win as any).cpcsp_chrome_nmcades as ChromeNmcadesApi | undefined;
      if (!api?.check_chrome_plugin) {
        throw new Error(
          'CryptoPro extension API loaded, but `cpcsp_chrome_nmcades.check_chrome_plugin` is missing.',
        );
      }

      // Ask the extension content-script to announce itself.
      win.postMessage('cadesplugin_echo_request', '*');

      const origin = (() => {
        try {
          return win.location.origin;
        } catch {
          return null;
        }
      })();

      await waitForMessage(
        win,
        (event) => {
          if (event.source !== win) return false;
          if (origin && event.origin !== origin) return false;
          return isCadesPluginLoadedMessage(event.data);
        },
        Math.min(5_000, loadTimeoutMs),
      );

      await new Promise<void>((resolve, reject) => {
        api.check_chrome_plugin(
          () => resolve(),
          (e) =>
            reject(
              new Error(
                [
                  'CryptoPro extension is present, but the native host handshake failed.',
                  normalizeErrorForUser(e),
                ].join(' '),
              ),
            ),
        );
      });

      // `check_chrome_plugin` should have called `window.cadesplugin.set(...)` by now,
      // which populates `pluginObject` used by `CreateObjectAsync`.
      if (!pluginObject?.CreateObjectAsync) {
        throw new Error('CryptoPro handshake completed, but plugin object is still missing.');
      }

      settleOk();
    } catch (e) {
      settleError(e);
    }
  };

  // Kick off initialization asynchronously; consumers can `await window.cadesplugin`.
  void init();

  return cadesplugin;
}
