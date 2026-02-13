import {
  CadesPluginError,
  type CadesPluginErrorCode,
  type CadesPluginGlobal,
  type CadesPluginInstallOptions,
  type CadesPluginLogger,
  type LogLevel,
} from './cadesplugin_api.types';
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

function defaultLogger(level: 'debug' | 'info' | 'error', message: string, data?: unknown) {
  if (typeof console === 'undefined') return;
  if (level === 'debug') console.log(message, data);
  else if (level === 'info') console.info(message, data);
  else console.error(message, data);
}

function toFinitePositiveMs(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function buildExtensionApiUrlFromId(id: string): string {
  return `chrome-extension://${id}/nmcades_plugin_api.js`;
}

function normalizeExtensionIds(ids: readonly string[]): string[] {
  const normalized: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id) continue;
    // Chrome extension ids are typically 32 characters (a-p).
    if (!/^[a-p]{32}$/i.test(id)) continue;
    normalized.push(id.toLowerCase());
  }
  return normalized;
}

function normalizeExtensionApiUrls(urls: readonly string[]): string[] {
  const normalized: string[] = [];
  for (const raw of urls) {
    if (typeof raw !== 'string') continue;
    const url = raw.trim();
    if (!url) continue;
    if (!url.startsWith('chrome-extension://')) continue;
    normalized.push(url);
  }
  return normalized;
}

function cadesError(
  code: CadesPluginErrorCode,
  message: string,
  details?: Record<string, unknown>,
  cause?: unknown,
): CadesPluginError {
  return new CadesPluginError(code, message, details, cause !== undefined ? { cause } : undefined);
}

export function installCadesPlugin(
  win: Window,
  doc: Document,
  options?: CadesPluginInstallOptions,
): CadesPluginGlobal {
  const existing = (win as any).cadesplugin as unknown;
  if (
    existing &&
    typeof (existing as any).then === 'function' &&
    typeof (existing as any).CreateObjectAsync === 'function' &&
    typeof (existing as any).async_spawn === 'function'
  ) {
    return existing as CadesPluginGlobal;
  }

  const opts = options ?? {};
  const logger: CadesPluginLogger = typeof opts.logger === 'function' ? opts.logger : defaultLogger;

  const timeoutMsOpt = opts.timeoutMs !== undefined ? toFinitePositiveMs(opts.timeoutMs) : null;
  if (opts.timeoutMs !== undefined && timeoutMsOpt === null) {
    throw cadesError('INVALID_OPTIONS', 'timeoutMs must be a finite positive number', {
      timeoutMs: opts.timeoutMs,
    });
  }

  const handshakeTimeoutMsOpt =
    opts.handshakeTimeoutMs !== undefined ? toFinitePositiveMs(opts.handshakeTimeoutMs) : null;
  if (opts.handshakeTimeoutMs !== undefined && handshakeTimeoutMsOpt === null) {
    throw cadesError('INVALID_OPTIONS', 'handshakeTimeoutMs must be a finite positive number', {
      handshakeTimeoutMs: opts.handshakeTimeoutMs,
    });
  }

  const extensionApiUrlsOpt =
    opts.extensionApiUrls !== undefined ? normalizeExtensionApiUrls(opts.extensionApiUrls) : null;
  if (opts.extensionApiUrls !== undefined && (!extensionApiUrlsOpt || extensionApiUrlsOpt.length === 0)) {
    throw cadesError('INVALID_OPTIONS', 'extensionApiUrls must include at least one chrome-extension:// URL', {
      extensionApiUrls: opts.extensionApiUrls,
    });
  }

  const extensionIdsOpt =
    opts.extensionIds !== undefined ? normalizeExtensionIds(opts.extensionIds) : null;
  if (opts.extensionIds !== undefined && (!extensionIdsOpt || extensionIdsOpt.length === 0)) {
    throw cadesError('INVALID_OPTIONS', 'extensionIds must include at least one valid extension id', {
      extensionIds: opts.extensionIds,
    });
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

  const initialLogLevelRaw = opts.logLevel ?? LOG_LEVEL_ERROR;
  if (initialLogLevelRaw !== LOG_LEVEL_DEBUG && initialLogLevelRaw !== LOG_LEVEL_INFO && initialLogLevelRaw !== LOG_LEVEL_ERROR) {
    throw cadesError('INVALID_OPTIONS', 'logLevel must be 1 (error), 2 (info) or 4 (debug)', {
      logLevel: initialLogLevelRaw,
    });
  }

  let currentLogLevel: LogLevel = initialLogLevelRaw;

  const cpcsp_console_log = (level: LogLevel, msg: unknown) => {
    if (level > currentLogLevel) return;
    const levelName = level === LOG_LEVEL_DEBUG ? 'debug' : level === LOG_LEVEL_INFO ? 'info' : 'error';
    let message = '';
    if (typeof msg === 'string') message = msg;
    else {
      try {
        message = JSON.stringify(msg);
      } catch {
        message = String(msg);
      }
    }
    logger(levelName, message, typeof msg === 'string' ? undefined : msg);
  };

  const set_pluginObject = (obj: unknown) => {
    pluginObject = (obj ?? null) as any;
  };

  const CreateObjectAsync = (name: string) => {
    if (!pluginObject?.CreateObjectAsync) {
      throw cadesError('PLUGIN_OBJECT_MISSING', 'CryptoPro plugin is not ready (plugin object is missing)');
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
      throw cadesError(
        'EXTENSION_API_MISSING',
        'CryptoPro extension API is not available (cpcsp_chrome_nmcades missing)',
      );
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

  const loadTimeoutMsFromWindow = toFinitePositiveMs((win as any).cadesplugin_load_timeout);
  const loadTimeoutMs = timeoutMsOpt ?? loadTimeoutMsFromWindow ?? 20_000;
  const handshakeTimeoutMs = handshakeTimeoutMsOpt ?? Math.min(5_000, loadTimeoutMs);

  const timeoutId = win.setTimeout(() => {
    rejectOnce(
      cadesError('PLUGIN_LOAD_TIMEOUT', 'CryptoPro plugin load timeout (extension missing or blocked)', {
        timeoutMs: loadTimeoutMs,
      }),
    );
  }, loadTimeoutMs);

  const settleOk = () => {
    win.clearTimeout(timeoutId);
    resolveOnce();
  };

  const settleError = (error?: unknown) => {
    win.clearTimeout(timeoutId);
    if (error instanceof CadesPluginError) {
      rejectOnce(error);
      return;
    }

    if (error instanceof Error) {
      rejectOnce(cadesError('UNKNOWN', normalizeErrorForUser(error), { name: error.name }, error));
      return;
    }

    rejectOnce(cadesError('UNKNOWN', normalizeErrorForUser(error), undefined, error));
  };

  const init = async () => {
    try {
      // If your app uses route-scoped CSP headers, note that SPA navigation does not change CSP.
      // When extension script loading fails, a full reload on the target route is often required.

      const browser = detectBrowser(win.navigator.userAgent);
      const urls =
        extensionApiUrlsOpt ??
        (extensionIdsOpt ? extensionIdsOpt.map(buildExtensionApiUrlFromId) : buildCryptoProExtensionApiUrls(browser));

      let loadedUrl: string | null = null;
      let lastLoadError: unknown = null;
      let lastCspViolation: CspViolationInfo | null = null;

      const csp = createCspViolationRecorder(doc);
      try {
        for (const url of urls) {
          try {
            cpcsp_console_log(LOG_LEVEL_DEBUG, `Loading CryptoPro extension API script: ${url}`);
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
        const code: CadesPluginErrorCode = lastCspViolation ? 'CSP_BLOCKED' : 'EXTENSION_API_LOAD_FAILED';
        const prefix = code === 'CSP_BLOCKED' ? 'CSP blocked. ' : '';

        throw cadesError(
          code,
          [
            `${prefix}CryptoPro extension API script failed to load.`,
            'Make sure the CryptoPro CAdES extension is installed and enabled.',
            'If your site uses strict CSP, it must allow the CryptoPro extension origins in script-src/script-src-elem.',
            'If your server applies CSP per-route, do a full page reload on the route where CryptoPro is enabled.',
            `Details: ${details}`,
          ].join(' '),
          {
            attemptedUrls: urls,
            cspViolation: lastCspViolation ?? undefined,
          },
          lastLoadError,
        );
      }

      const api = (win as any).cpcsp_chrome_nmcades as ChromeNmcadesApi | undefined;
      if (!api?.check_chrome_plugin) {
        throw cadesError(
          'EXTENSION_API_MISSING',
          'CryptoPro extension API loaded, but `cpcsp_chrome_nmcades.check_chrome_plugin` is missing.',
          { loadedUrl },
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

      try {
        await waitForMessage(
          win,
          (event) => {
            if (event.source !== win) return false;
            if (origin && event.origin !== origin) return false;
            return isCadesPluginLoadedMessage(event.data);
          },
          handshakeTimeoutMs,
        );
      } catch (e) {
        throw cadesError(
          'HANDSHAKE_TIMEOUT',
          'Timed out waiting for CryptoPro extension handshake (cadesplugin_loaded).',
          { timeoutMs: handshakeTimeoutMs, loadedUrl },
          e,
        );
      }

      await new Promise<void>((resolve, reject) => {
        api.check_chrome_plugin(
          () => resolve(),
          (e) =>
            reject(e),
        );
      }).catch((e) => {
        throw cadesError(
          'NATIVE_HOST_HANDSHAKE_FAILED',
          [
            'CryptoPro extension is present, but the native host handshake failed.',
            normalizeErrorForUser(e),
          ].join(' '),
          { loadedUrl },
          e,
        );
      });

      // `check_chrome_plugin` should have called `window.cadesplugin.set(...)` by now,
      // which populates `pluginObject` used by `CreateObjectAsync`.
      if (!pluginObject?.CreateObjectAsync) {
        throw cadesError('PLUGIN_OBJECT_MISSING', 'CryptoPro handshake completed, but plugin object is still missing.', {
          loadedUrl,
        });
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
