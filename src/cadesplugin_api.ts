import type { CadesPluginGlobal } from './cadesplugin_api.types';
import { installCadesPlugin } from './cadesplugin_api.install';

declare global {
  interface Window {
    cadesplugin?: CadesPluginGlobal;
  }
}

// Side-effect entrypoint: installs `window.cadesplugin` when imported.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.cadesplugin = installCadesPlugin(window, document);
}

export { installCadesPlugin } from './cadesplugin_api.install';
export type { CadesPluginGlobal, LogLevel } from './cadesplugin_api.types';
