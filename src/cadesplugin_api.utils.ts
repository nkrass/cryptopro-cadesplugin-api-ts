export type BrowserSpec = {
  name: 'Chrome' | 'Edg' | 'YaBrowser' | 'Opera' | 'Other';
  major: number | null;
};

export const CRYPTOPRO_EXTENSION_IDS = {
  opera: 'epebfcehmdedogndhlcacafjaacknbcm',
  manifestV2: 'iifchhfnnmpdbibifmljnfjhpififfog',
  manifestV3: 'pfhgbfnnjiafkhfdkmpiflachepdcjod',
} as const;

export const CRYPTOPRO_EXTENSION_ORIGINS = [
  `chrome-extension://${CRYPTOPRO_EXTENSION_IDS.opera}`,
  `chrome-extension://${CRYPTOPRO_EXTENSION_IDS.manifestV2}`,
  `chrome-extension://${CRYPTOPRO_EXTENSION_IDS.manifestV3}`,
] as const;

export function detectBrowser(userAgent: string): BrowserSpec {
  const ua = userAgent ?? '';
  const patterns: Array<{ name: BrowserSpec['name']; re: RegExp }> = [
    { name: 'Edg', re: /\bEdg\/(\d+)/ },
    { name: 'Opera', re: /\bOPR\/(\d+)/ },
    { name: 'YaBrowser', re: /\bYaBrowser\/(\d+)/ },
    { name: 'Chrome', re: /\bChrome\/(\d+)/ },
  ];

  for (const { name, re } of patterns) {
    const match = ua.match(re);
    if (!match) continue;
    const major = Number(match[1]);
    return { name, major: Number.isFinite(major) ? major : null };
  }

  return { name: 'Other', major: null };
}

export function buildCryptoProExtensionApiUrls(browser: BrowserSpec): string[] {
  const build = (id: string) => `chrome-extension://${id}/nmcades_plugin_api.js`;

  // Keep the upstream priority:
  // - Opera/Yandex: try Opera-specific id first, then store ids
  // - Others (Chrome/Edge): try store ids (V2 -> V3)
  if (browser.name === 'Opera' || browser.name === 'YaBrowser') {
    return [
      build(CRYPTOPRO_EXTENSION_IDS.opera),
      build(CRYPTOPRO_EXTENSION_IDS.manifestV2),
      build(CRYPTOPRO_EXTENSION_IDS.manifestV3),
    ];
  }

  return [
    build(CRYPTOPRO_EXTENSION_IDS.manifestV2),
    build(CRYPTOPRO_EXTENSION_IDS.manifestV3),
  ];
}

export function isValidCryptoProExtensionApiUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length === 0) return false;
  return CRYPTOPRO_EXTENSION_ORIGINS.some(
    (origin) => url === `${origin}/nmcades_plugin_api.js`,
  );
}

export function parsePostMessageStringResponse(
  data: unknown,
  prefix: string,
): string | null {
  if (typeof data !== 'string') return null;
  if (!data.startsWith(prefix)) return null;
  return data.slice(prefix.length);
}

export function isCadesPluginLoadedMessage(data: unknown): boolean {
  return typeof data === 'string' && data.includes('cadesplugin_loaded');
}

/**
 * Detect `/admin` pages even when language-url-prefix routing is enabled (`/en/admin/...`).
 * This is used for CSP-related diagnostics client-side.
 */
export function isLikelyAdminPathname(pathname: string): boolean {
  const normalized = (pathname || '').startsWith('/')
    ? (pathname || '')
    : `/${pathname || ''}`;

  if (normalized === '/admin' || normalized.startsWith('/admin/')) return true;

  const match = normalized.match(/^\/([^/]+)(?=\/|$)/);
  const firstSegment = match?.[1] ?? null;
  if (!firstSegment) return false;

  // URL prefix languages in this repo are 2-letter codes (`en`, `ru`, ...).
  if (!/^[a-z]{2}$/i.test(firstSegment)) return false;

  const prefix = `/${firstSegment}/admin`;
  return normalized === prefix || normalized.startsWith(`${prefix}/`);
}

