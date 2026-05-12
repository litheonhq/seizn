/**
 * JSON-LD structured data (plan W5.6).
 *
 * Three schemas, served on the landing page:
 *   1. Organization — Litheon LLC, the legal entity behind Seizn.
 *   2. SoftwareApplication — Seizn Author, the flagship product.
 *   3. WebSite — Seizn website with sitelinks search box (when applicable).
 *
 * Used in [locale]/page.tsx via <StructuredData />.
 *
 * Reference:
 *   schema.org/Organization
 *   schema.org/SoftwareApplication
 *   schema.org/WebSite
 *   developers.google.com/search/docs/appearance/structured-data/sitelinks-searchbox
 */

const BASE_URL = 'https://www.seizn.com';

const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${BASE_URL}/#organization`,
  name: 'Seizn',
  alternateName: 'Litheon LLC',
  legalName: 'Litheon LLC',
  url: BASE_URL,
  logo: `${BASE_URL}/brand/seizn-mark-source.png`,
  foundingDate: '2026',
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'US',
    addressRegion: 'WY',
  },
  sameAs: [
    'https://github.com/litheonhq',
    'https://www.linkedin.com/company/litheon',
  ],
  contactPoint: [
    {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@seizn.com',
      availableLanguage: ['en', 'ko'],
    },
    {
      '@type': 'ContactPoint',
      contactType: 'privacy',
      email: 'privacy@seizn.com',
    },
  ],
};

const softwareApplicationLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': `${BASE_URL}/#software`,
  name: 'Seizn Author',
  applicationCategory: 'WritingApplication',
  operatingSystem: 'Web',
  url: BASE_URL,
  publisher: {
    '@id': `${BASE_URL}/#organization`,
  },
  description:
    'AI memory infrastructure for fiction authors and game studios. Extract canon, detect conflicts, simulate scenes — with full audit trail and zero training-data leakage.',
  offers: [
    {
      '@type': 'Offer',
      name: 'Indie',
      price: '29',
      priceCurrency: 'USD',
      priceValidUntil: '2027-05-01',
      availability: 'https://schema.org/InStock',
      url: `${BASE_URL}/en/pricing`,
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '112',
      priceCurrency: 'USD',
      priceValidUntil: '2027-05-01',
      availability: 'https://schema.org/InStock',
      url: `${BASE_URL}/en/pricing`,
    },
    {
      '@type': 'Offer',
      name: 'Studio',
      price: '374',
      priceCurrency: 'USD',
      priceValidUntil: '2027-05-01',
      availability: 'https://schema.org/InStock',
      url: `${BASE_URL}/en/pricing`,
    },
  ],
};

const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${BASE_URL}/#website`,
  url: BASE_URL,
  name: 'Seizn',
  publisher: {
    '@id': `${BASE_URL}/#organization`,
  },
  inLanguage: ['en', 'ko'],
};

export function StructuredData() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static, build-time JSON. Safe with dangerouslySetInnerHTML — no user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
      />
    </>
  );
}
