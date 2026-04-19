import { MetadataRoute } from 'next';
import { locales } from '@/i18n/config';

const blockedPaths = [
  '/api',
  '/api/',
  '/dashboard',
  '/dashboard/',
  ...locales.flatMap((locale) => [`/${locale}/dashboard`, `/${locale}/dashboard/`]),
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: blockedPaths,
      },
      // AI Crawlers - explicitly allow
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow: blockedPaths,
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
        disallow: blockedPaths,
      },
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow: blockedPaths,
      },
      {
        userAgent: 'Claude-Web',
        allow: '/',
        disallow: blockedPaths,
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: blockedPaths,
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: blockedPaths,
      },
      {
        userAgent: 'Google-Extended',
        allow: '/',
        disallow: blockedPaths,
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: blockedPaths,
      },
    ],
    sitemap: 'https://www.seizn.com/sitemap.xml',
  };
}
