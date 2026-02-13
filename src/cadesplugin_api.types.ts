export type LogLevel = 1 | 2 | 4;

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
