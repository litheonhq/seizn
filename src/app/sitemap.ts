import { MetadataRoute } from 'next';
import { defaultLocale, locales } from '@/i18n/config';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.seizn.com';

  // Define locale-specific routes with priorities
  const localeRoutes = [
    { path: '', priority: 1.0, changeFreq: 'weekly' as const },
    { path: '/enterprise', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/pricing', priority: 0.9, changeFreq: 'weekly' as const },
    { path: '/demo', priority: 0.85, changeFreq: 'weekly' as const },
    { path: '/comparison', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/docs', priority: 0.9, changeFreq: 'weekly' as const },
    { path: '/docs/tutorial', priority: 0.85, changeFreq: 'monthly' as const },
    { path: '/docs/api-reference', priority: 0.85, changeFreq: 'monthly' as const },
    { path: '/docs/faq', priority: 0.7, changeFreq: 'monthly' as const },
  ];

  // Generate sitemap entries for each locale
  const sitemapEntries: MetadataRoute.Sitemap = [];

  for (const route of localeRoutes) {
    for (const locale of locales) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}${route.path}`,
        lastModified: new Date(),
        changeFrequency: route.changeFreq,
        priority: route.priority,
        alternates: {
          languages: buildLanguageAlternates(baseUrl, route.path),
        },
      });
    }
  }

  // Add root public routes that exist without locale prefixes.
  const rootPublicRoutes = [
    { path: '/pricing', priority: 0.9, changeFreq: 'weekly' as const },
    { path: '/demo', priority: 0.85, changeFreq: 'weekly' as const },
  ];

  for (const route of rootPublicRoutes) {
    sitemapEntries.push({
      url: `${baseUrl}${route.path}`,
      lastModified: new Date(),
      changeFrequency: route.changeFreq,
      priority: route.priority,
    });
  }

  // Add legal/policy routes
  const legalRoutes = [
    { path: '/refund', priority: 0.5, changeFreq: 'monthly' as const },
    { path: '/privacy', priority: 0.5, changeFreq: 'monthly' as const },
    { path: '/terms', priority: 0.5, changeFreq: 'monthly' as const },
    { path: '/legal/privacy', priority: 0.5, changeFreq: 'monthly' as const },
    { path: '/legal/terms', priority: 0.5, changeFreq: 'monthly' as const },
    { path: '/legal/beta-disclosure', priority: 0.5, changeFreq: 'monthly' as const },
  ];
  for (const route of legalRoutes) {
    sitemapEntries.push({
      url: `${baseUrl}${route.path}`,
      lastModified: new Date(),
      changeFrequency: route.changeFreq,
      priority: route.priority,
    });
  }

  const localizedLegalRoutes = [
    { path: '/legal/privacy', priority: 0.5, changeFreq: 'monthly' as const },
    { path: '/legal/terms', priority: 0.5, changeFreq: 'monthly' as const },
    { path: '/legal/beta-disclosure', priority: 0.5, changeFreq: 'monthly' as const },
    // W3.7 additions
    { path: '/legal/refund', priority: 0.5, changeFreq: 'monthly' as const },
    { path: '/legal/subprocessors', priority: 0.5, changeFreq: 'monthly' as const },
    { path: '/legal/ai-disclosure', priority: 0.6, changeFreq: 'monthly' as const },
    { path: '/legal/dpa', priority: 0.5, changeFreq: 'monthly' as const },
  ];

  for (const route of localizedLegalRoutes) {
    for (const locale of locales) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}${route.path}`,
        lastModified: new Date(),
        changeFrequency: route.changeFreq,
        priority: route.priority,
        alternates: {
          languages: buildLanguageAlternates(baseUrl, route.path),
        },
      });
    }
  }

  // Add API spec
  sitemapEntries.push({
    url: `${baseUrl}/openapi.json`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  });

  // Add llms.txt for AI crawlers
  sitemapEntries.push({
    url: `${baseUrl}/llms.txt`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.5,
  });

  return sitemapEntries;
}

// hreflang strategy parallels [locale]/layout.tsx (W4.4): only en + ko declare
// their own URL; the other 22 fallback locales point at /en so Google doesn't
// treat each fallback URL as a distinct translated version.
const FULLY_TRANSLATED = new Set<string>(['en', 'ko']);
function buildLanguageAlternates(baseUrl: string, routePath: string) {
  return {
    ...Object.fromEntries(
      locales.map((locale) => [
        locale,
        FULLY_TRANSLATED.has(locale)
          ? `${baseUrl}/${locale}${routePath}`
          : `${baseUrl}/en${routePath}`,
      ])
    ),
    'x-default': `${baseUrl}/${defaultLocale}${routePath}`,
  };
}
