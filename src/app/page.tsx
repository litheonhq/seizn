import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { locales, defaultLocale, getLocaleFromCountry, type Locale } from '@/i18n/config';
import { ENGINE_HOST, normalizeHost } from '@/lib/surface';

export default async function RootPage() {
  const headersList = await headers();

  // Engine surface fallback — proxy.ts rewrites engine.seizn.com to /engine,
  // but if the request reaches root with engine host, send it to /engine.
  const host = normalizeHost(headersList.get('x-forwarded-host') || headersList.get('host'));
  if (host === ENGINE_HOST) {
    redirect('/engine');
  }

  // Check for saved locale preference in cookie
  const cookieHeader = headersList.get('cookie') || '';
  const localeMatch = cookieHeader.match(/NEXT_LOCALE=([^;]+)/);
  const savedLocale = localeMatch?.[1] as Locale | undefined;

  if (savedLocale && locales.includes(savedLocale)) {
    redirect(`/${savedLocale}`);
  }

  // Check IP-based geolocation
  const country = headersList.get('x-vercel-ip-country');
  if (country) {
    const detectedLocale = getLocaleFromCountry(country);
    redirect(`/${detectedLocale}`);
  }

  // Check Accept-Language header
  const acceptLanguage = headersList.get('accept-language');
  if (acceptLanguage) {
    const preferredLocale = acceptLanguage
      .split(',')
      .map((lang) => lang.split(';')[0].trim().substring(0, 2).toLowerCase())
      .find((lang) => locales.includes(lang as Locale)) as Locale | undefined;

    if (preferredLocale) {
      redirect(`/${preferredLocale}`);
    }
  }

  // Default fallback
  redirect(`/${defaultLocale}`);
}
