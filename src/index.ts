import { installCadesPlugin } from './cadesplugin_api.install';
import type { CadesPluginClient, CadesPluginInstallOptions } from './cadesplugin_api.types';
import { CRYPTOPRO_EXTENSION_IDS, CRYPTOPRO_EXTENSION_ORIGINS } from './cadesplugin_api.utils';

export { installCadesPlugin } from './cadesplugin_api.install';
export { CadesPluginError, isCadesPluginError } from './cadesplugin_api.types';
export { CRYPTOPRO_EXTENSION_IDS, CRYPTOPRO_EXTENSION_ORIGINS } from './cadesplugin_api.utils';
export type {
  CadesPluginClient,
  CadesPluginErrorCode,
  CadesPluginErrorDetails,
  CadesPluginGlobal,
  CadesPluginInstallOptions,
  CadesPluginLogLevelName,
  CadesPluginLogger,
  LogLevel,
} from './cadesplugin_api.types';

/**
 * Modern non-thenable wrapper. The `ready` Promise resolves when the extension/native host handshake is complete.
 */
export function createCadesPluginClient(
  win: Window,
  doc: Document,
  options?: CadesPluginInstallOptions,
): CadesPluginClient {
  const raw = installCadesPlugin(win, doc, options);
  return {
    raw,
    ready: Promise.resolve(raw),
    async_spawn: raw.async_spawn,
    CreateObjectAsync: raw.CreateObjectAsync,
    getLastError: raw.getLastError,
  };
}

export async function initCadesPluginClient(
  win: Window,
  doc: Document,
  options?: CadesPluginInstallOptions,
): Promise<CadesPluginClient> {
  const client = createCadesPluginClient(win, doc, options);
  await client.ready;
  return client;
}
