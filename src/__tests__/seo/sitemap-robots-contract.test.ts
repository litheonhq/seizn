import { describe, expect, it } from 'vitest';
import { locales } from '@/i18n/config';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

describe('SEO surface contract', () => {
  it('keeps private and redirect-only routes out of the sitemap', () => {
    const urls = sitemap().map((entry) => new URL(entry.url));
    const paths = urls.map((url) => url.pathname);

    expect(paths).not.toContain('/docs');
    expect(paths).not.toContain('/docs/tutorial');
    expect(paths).not.toContain('/login');
    expect(paths).not.toContain('/signup');
    expect(paths.some((path) => path.startsWith('/dashboard'))).toBe(false);
    expect(paths.some((path) => path.startsWith('/api/'))).toBe(false);
  });

  it('emits hreflang alternates for every supported locale on localized routes', () => {
    const localizedEntry = sitemap().find((entry) => entry.url === 'https://www.seizn.com/en/pricing');

    expect(localizedEntry?.alternates?.languages).toBeDefined();
    for (const locale of locales) {
      const expectedLocale = locale === 'en' || locale === 'ko' ? locale : 'en';
      expect(localizedEntry?.alternates?.languages?.[locale]).toBe(`https://www.seizn.com/${expectedLocale}/pricing`);
    }
    expect(localizedEntry?.alternates?.languages?.['x-default']).toBe('https://www.seizn.com/en/pricing');
  });

  it('disallows API and dashboard crawling for broad crawlers', () => {
    const rules = Array.isArray(robots().rules) ? robots().rules : [robots().rules];
    const wildcardRule = rules.find((rule) => rule.userAgent === '*');

    expect(wildcardRule?.disallow).toContain('/api/');
    expect(wildcardRule?.disallow).toContain('/dashboard/');
  });
});
