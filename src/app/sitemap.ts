import { MetadataRoute } from 'next';
import { locales } from '@/i18n/config';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.seizn.com';

  // Define locale-specific routes with priorities
  const localeRoutes = [
    { path: '', priority: 1.0, changeFreq: 'weekly' as const },
    { path: '/enterprise', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/pricing', priority: 0.9, changeFreq: 'weekly' as const },
    { path: '/demo', priority: 0.85, changeFreq: 'weekly' as const },
    { path: '/comparison', priority: 0.8, changeFreq: 'monthly' as const },
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
          languages: {
            en: `${baseUrl}/en${route.path}`,
            ko: `${baseUrl}/ko${route.path}`,
            ja: `${baseUrl}/ja${route.path}`,
          },
        },
      });
    }
  }

  // Add static docs routes (non-locale)
  const docsRoutes = [
    { path: '/pricing', priority: 0.9, changeFreq: 'weekly' as const },
    { path: '/demo', priority: 0.85, changeFreq: 'weekly' as const },
    { path: '/docs', priority: 0.9, changeFreq: 'weekly' as const },
    { path: '/docs/tutorial', priority: 0.85, changeFreq: 'monthly' as const },
    { path: '/docs/api-reference', priority: 0.85, changeFreq: 'monthly' as const },
    { path: '/docs/faq', priority: 0.7, changeFreq: 'monthly' as const },
  ];

  for (const route of docsRoutes) {
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
  ];

  for (const route of localizedLegalRoutes) {
    for (const locale of ['en', 'ko', 'ja', 'zh-hans'] as const) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}${route.path}`,
        lastModified: new Date(),
        changeFrequency: route.changeFreq,
        priority: route.priority,
      });
    }
  }

  // Add auth routes
  const authRoutes = ['/login', '/signup'];
  for (const route of authRoutes) {
    sitemapEntries.push({
      url: `${baseUrl}${route}`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    });
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
