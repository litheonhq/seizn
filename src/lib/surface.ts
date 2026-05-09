export const ENGINE_HOST = 'engine.seizn.com';
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
