import { MetadataRoute } from 'next';
import { locales } from '@/i18n/config';

// Surfaces that MUST NOT be crawled (W3.5 launch-gate rule).
// /admin: internal only, IP-allowlisted.
// /cli-auth: short-lived auth handshake URLs, leak risk if cached.
// /invite, /t, /trace: tokenized one-time URLs.
// /checkout: Stripe context bound to session, no SEO value.
// /offline: PWA fallback, no SEO value.
// /api/*, /dashboard/*: data + auth-required surfaces.
const blockedPaths = [
  '/api',
  '/api/',
  '/dashboard',
  '/dashboard/',
  '/admin',
  '/admin/',
  '/cli-auth',
  '/cli-auth/',
  '/invite',
  '/invite/',
  '/t/',
  '/trace/',
  '/offline',
  ...locales.flatMap((locale) => [
    `/${locale}/dashboard`,
    `/${locale}/dashboard/`,
    `/${locale}/checkout`,
    `/${locale}/checkout/`,
  ]),
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
