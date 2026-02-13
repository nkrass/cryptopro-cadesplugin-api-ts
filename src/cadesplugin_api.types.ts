export type LogLevel = 1 | 2 | 4;
export type CadesPluginLogLevelName = 'debug' | 'info' | 'error';

export type CadesPluginLogger = (
  level: CadesPluginLogLevelName,
  message: string,
  data?: unknown,
) => void;

export type CadesPluginErrorCode =
  | 'UNKNOWN'
  | 'INVALID_OPTIONS'
  | 'PLUGIN_LOAD_TIMEOUT'
  | 'EXTENSION_API_LOAD_FAILED'
  | 'CSP_BLOCKED'
  | 'EXTENSION_API_MISSING'
  | 'HANDSHAKE_TIMEOUT'
  | 'NATIVE_HOST_HANDSHAKE_FAILED'
  | 'PLUGIN_OBJECT_MISSING';

export type CadesPluginErrorDetails = Record<string, unknown>;

export class CadesPluginError extends Error {
  readonly code: CadesPluginErrorCode;
  readonly details: CadesPluginErrorDetails | undefined;

  constructor(
    code: CadesPluginErrorCode,
    message: string,
    details?: CadesPluginErrorDetails,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CadesPluginError';
    this.code = code;
    this.details = details;
  }
}

export type CadesPluginInstallOptions = {
  /**
   * Overall initialization timeout. If not provided:
   * - uses `window.cadesplugin_load_timeout` when present
   * - otherwise defaults to 20000ms (matches upstream behavior)
   */
  timeoutMs?: number;

  /**
   * Timeout for the postMessage handshake (`cadesplugin_loaded`).
   * Defaults to `min(5000, timeoutMs)`.
   */
  handshakeTimeoutMs?: number;

  /**
   * Override the extension API script URLs to try (in order).
   * Example: `chrome-extension://<id>/nmcades_plugin_api.js`
   */
  extensionApiUrls?: readonly string[];

  /**
   * Override the extension ids to try (in order). These are converted to
   * `chrome-extension://<id>/nmcades_plugin_api.js`.
   */
  extensionIds?: readonly string[];

  /**
   * Optional logger (defaults to console).
   */
  logger?: CadesPluginLogger;

  /**
   * Initial log level for internal diagnostics (defaults to ERROR).
   */
  logLevel?: LogLevel;
};

/**
 * `window.cadesplugin` is a Promise-like object (thenable) that is also extended
 * with CryptoPro API methods. This matches how the upstream script behaves,
 * but we implement it as a typed thenable instead of mutating a real Promise.
 */
export interface CadesPluginGlobal extends PromiseLike<void> {
  JSModuleVersion: string;

  // Logging
  LOG_LEVEL_DEBUG: LogLevel;
  LOG_LEVEL_INFO: LogLevel;
  LOG_LEVEL_ERROR: LogLevel;
  current_log_level: LogLevel;
  set_log_level(level: LogLevel): void;

  // Extension info
  get_extension_version(callback: (version: string) => void): void;
  get_extension_id(callback: (id: string) => void): void;

  // Core API used by the portal
  async_spawn<T>(
    generatorFunc: (args: any[]) => Generator<any, T, any>,
    ...args: any[]
  ): Promise<T>;
  CreateObjectAsync(name: string): any;

  // Diagnostics
  getLastError(exception: unknown): string;

  // Extension bridge (the extension calls this to provide the underlying plugin object)
  set(pluginObject: unknown): void;

  // Optional (provided by the extension API)
  ReleasePluginObjects?: () => any;

  // Promise convenience methods (implemented by our thenable)
  catch?<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<void | TResult>;
  finally?(onfinally?: (() => void) | null): Promise<void>;
}

/**
 * Modern non-thenable wrapper around the upstream thenable `window.cadesplugin`.
 * Useful because Promises/async functions cannot "return a thenable" without it being unwrapped to `void`.
 */
export interface CadesPluginClient {
  raw: CadesPluginGlobal;
  ready: Promise<void>;

  async_spawn: CadesPluginGlobal['async_spawn'];
  CreateObjectAsync: CadesPluginGlobal['CreateObjectAsync'];
  getLastError: CadesPluginGlobal['getLastError'];
}
