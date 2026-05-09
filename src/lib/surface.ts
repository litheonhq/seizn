export const ENGINE_HOST = 'engine.seizn.com';
export const ENGINE_ORIGIN = `https://${ENGINE_HOST}`;
export const AUTHOR_FLAGSHIP_ORIGIN = 'https://www.seizn.com';

export type SeiznSurface = 'engine' | 'author';

export function normalizeHost(value: string | null | undefined): string {
  const raw = (value ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  if (!raw) return '';
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end >= 0 ? raw.slice(0, end + 1) : raw;
  }
  return raw.split(':')[0] ?? raw;
}

export function resolveSurfaceFromHeaders(headers: Pick<Headers, 'get'>): SeiznSurface {
  const forwardedHost = headers.get('x-forwarded-host');
  const host = forwardedHost || headers.get('host');
  return normalizeHost(host) === ENGINE_HOST ? 'engine' : 'author';
}

const ENGINE_MARKETING_ROUTE_PREFIXES = [
  '/bench',
  '/comparison',
  '/design-partners',
  '/docs',
  '/enterprise',
  '/playground',
] as const;

export function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split('/');
  const maybeLocale = segments[1];
  if (
    maybeLocale &&
    /^(en|ko|ja|zh-hans|zh-hant|es|ru|uk|he|ar|fr|de|it|sv|nl|pl|hi|th|id|vi|pt-BR|pt-PT)$/.test(
      maybeLocale
    )
  ) {
    const stripped = `/${segments.slice(2).join('/')}`;
    return stripped === '/' ? '/' : stripped.replace(/\/+$/, '') || '/';
  }
  return pathname.replace(/\/+$/, '') || '/';
}

export function isEngineMarketingRoute(pathname: string): boolean {
  const stripped = stripLocalePrefix(pathname);
  return ENGINE_MARKETING_ROUTE_PREFIXES.some(
    (prefix) => stripped === prefix || stripped.startsWith(`${prefix}/`)
  );
}
