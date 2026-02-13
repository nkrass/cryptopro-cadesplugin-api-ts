import { installCadesPlugin } from './cadesplugin_api.install';
import type { CadesPluginClient } from './cadesplugin_api.types';

export { installCadesPlugin } from './cadesplugin_api.install';
export type { CadesPluginClient, CadesPluginGlobal, LogLevel } from './cadesplugin_api.types';

/**
 * Modern non-thenable wrapper. The `ready` Promise resolves when the extension/native host handshake is complete.
 */
export function createCadesPluginClient(win: Window, doc: Document): CadesPluginClient {
  const raw = installCadesPlugin(win, doc);
  return {
    raw,
    ready: Promise.resolve(raw),
    async_spawn: raw.async_spawn,
    CreateObjectAsync: raw.CreateObjectAsync,
    getLastError: raw.getLastError,
  };
}

export async function initCadesPluginClient(win: Window, doc: Document): Promise<CadesPluginClient> {
  const client = createCadesPluginClient(win, doc);
  await client.ready;
  return client;
}
