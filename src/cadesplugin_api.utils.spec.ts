import { describe, expect, it } from 'vitest';
import {
  CRYPTOPRO_EXTENSION_IDS,
  CRYPTOPRO_EXTENSION_ORIGINS,
  buildCryptoProExtensionApiUrls,
  detectBrowser,
  isCadesPluginLoadedMessage,
  isLikelyAdminPathname,
  isValidCryptoProExtensionApiUrl,
  parsePostMessageStringResponse,
} from './cadesplugin_api.utils';

describe('CryptoPro cadesplugin_api utils', () => {
  it('detectBrowser: detects Edge', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0';
    expect(detectBrowser(ua)).toEqual({ name: 'Edg', major: 121 });
  });

  it('detectBrowser: detects Opera (prefers OPR over Chrome)', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 OPR/106.0.0.0';
    expect(detectBrowser(ua)).toEqual({ name: 'Opera', major: 106 });
  });

  it('detectBrowser: detects Yandex Browser', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 YaBrowser/24.12.0.0 Safari/537.36';
    expect(detectBrowser(ua)).toEqual({ name: 'YaBrowser', major: 24 });
  });

  it('detectBrowser: detects Chrome', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
    expect(detectBrowser(ua)).toEqual({ name: 'Chrome', major: 121 });
  });

  it('buildCryptoProExtensionApiUrls: uses upstream order for Opera/YaBrowser', () => {
    expect(buildCryptoProExtensionApiUrls({ name: 'Opera', major: 100 })).toEqual([
      `chrome-extension://${CRYPTOPRO_EXTENSION_IDS.opera}/nmcades_plugin_api.js`,
      `chrome-extension://${CRYPTOPRO_EXTENSION_IDS.manifestV2}/nmcades_plugin_api.js`,
      `chrome-extension://${CRYPTOPRO_EXTENSION_IDS.manifestV3}/nmcades_plugin_api.js`,
    ]);
  });

  it('buildCryptoProExtensionApiUrls: uses store ids for Chrome/Edge', () => {
    expect(buildCryptoProExtensionApiUrls({ name: 'Chrome', major: 120 })).toEqual([
      `chrome-extension://${CRYPTOPRO_EXTENSION_IDS.manifestV2}/nmcades_plugin_api.js`,
      `chrome-extension://${CRYPTOPRO_EXTENSION_IDS.manifestV3}/nmcades_plugin_api.js`,
    ]);
    expect(buildCryptoProExtensionApiUrls({ name: 'Edg', major: 120 })).toEqual([
      `chrome-extension://${CRYPTOPRO_EXTENSION_IDS.manifestV2}/nmcades_plugin_api.js`,
      `chrome-extension://${CRYPTOPRO_EXTENSION_IDS.manifestV3}/nmcades_plugin_api.js`,
    ]);
  });

  it('isValidCryptoProExtensionApiUrl: accepts only known extension origins', () => {
    for (const origin of CRYPTOPRO_EXTENSION_ORIGINS) {
      expect(isValidCryptoProExtensionApiUrl(`${origin}/nmcades_plugin_api.js`)).toBe(true);
      expect(isValidCryptoProExtensionApiUrl(`${origin}/other.js`)).toBe(false);
    }

    expect(isValidCryptoProExtensionApiUrl('')).toBe(false);
    expect(isValidCryptoProExtensionApiUrl('https://example.com/nmcades_plugin_api.js')).toBe(false);
  });

  it('parsePostMessageStringResponse: parses responses with a prefix', () => {
    expect(parsePostMessageStringResponse('prefix:hello', 'prefix:')).toBe('hello');
    expect(parsePostMessageStringResponse('nope:hello', 'prefix:')).toBe(null);
    expect(parsePostMessageStringResponse(123, 'prefix:')).toBe(null);
  });

  it('isCadesPluginLoadedMessage: detects cadesplugin_loaded', () => {
    expect(isCadesPluginLoadedMessage('cadesplugin_loaded')).toBe(true);
    expect(isCadesPluginLoadedMessage('{"type":"cadesplugin_loaded"}')).toBe(true);
    expect(isCadesPluginLoadedMessage('cadesplugin_loading')).toBe(false);
    expect(isCadesPluginLoadedMessage(null)).toBe(false);
  });

  it('isLikelyAdminPathname: detects /admin and /{lang}/admin', () => {
    expect(isLikelyAdminPathname('/admin')).toBe(true);
    expect(isLikelyAdminPathname('/admin/crpt')).toBe(true);
    expect(isLikelyAdminPathname('/en/admin')).toBe(true);
    expect(isLikelyAdminPathname('/en/admin/crpt')).toBe(true);

    expect(isLikelyAdminPathname('/en')).toBe(false);
    expect(isLikelyAdminPathname('/en/account/orders')).toBe(false);
    expect(isLikelyAdminPathname('/english/admin')).toBe(false);
    expect(isLikelyAdminPathname('/foo/admin')).toBe(false);
  });
});

