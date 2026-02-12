export { installCadesPlugin } from './cadesplugin_api.install';
export type { CadesPluginGlobal, LogLevel } from './cadesplugin_api.types';

import { installCadesPlugin } from './cadesplugin_api.install';
import type { CadesPluginGlobal } from './cadesplugin_api.types';

/**
 * Ergonomic initializer for modern code:
 * - returns a real Promise (so `await initCadesPlugin(...)` gives you the plugin object)
 * - still keeps upstream compatibility (`installCadesPlugin` returns a thenable)
 */
export async function initCadesPlugin(win: Window, doc: Document): Promise<CadesPluginGlobal> {
  const cadesplugin = installCadesPlugin(win, doc);
  await cadesplugin;
  return cadesplugin;
}
