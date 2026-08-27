import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import { nav, site } from '@/lib/content';
import './globals.css';

/*
 * Bricolage Grotesque — display. A French-designed grotesque with warm,
 * slightly handcrafted letterforms ("bricolage" = tinkering). Loaded as a true
 * variable font on all three axes: `opsz` and `wdth` are requested explicitly
 * because next/font only ships non-weight axes you name, and without them the
 * whole typographic argument (§4 of the master prompt) silently collapses to a
 * static face.
 */
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz', 'wdth'],
  display: 'swap',
  variable: '--font-display',
  fallback: ['Georgia', 'serif'],
});

/** Hanken Grotesk — body/UI. Stays quiet and highly legible for dense text. */
const body = Hanken_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
});

const SITE_URL = `https://${site.domain}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: site.title,
  description: site.description,
  applicationName: site.name,
  // Single language: no `alternates.languages`, no hreflang.
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fr_CA',
    url: SITE_URL,
    siteName: site.name,
    title: site.title,
    description: site.description,
  },
  twitter: { card: 'summary_large_image', title: site.title, description: site.description },
  icons: { icon: '/brand/favicon.svg' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never maximumScale/userScalable — pinch-zoom is an accessibility requirement.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF9F7' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1712' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        {/*
          Applied before first paint so a dark-mode visitor never sees an ivory
          flash. Kept inline and tiny on purpose; it is the one script that must
          not wait for hydration.
        */}
        <script
          dangerouslySetInnerHTML={{
            // `js` gates every hidden-until-revealed rule, so with scripting off
              // nothing is ever hidden. See the .reveal block in globals.css.
              __html: `(function(){var e=document.documentElement;e.classList.add('js');try{var s=localStorage.getItem('sougouba-theme');var d=s?s==='dark':matchMedia('(prefers-color-scheme:dark)').matches;if(d)e.classList.add('dark')}catch(x){}})()`,
          }}
        />
      </head>
      <body>
        {/*
          SoftwareApplication, deliberately WITHOUT aggregateRating or
          downloadUrl: there is no rating and nothing to download yet, and
          claiming either in structured data is the same lie as printing it.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'LocalBusiness',
                  name: site.name,
                  description: site.description,
                  email: site.support,
                  url: SITE_URL,
                  areaServed: ['Montréal', 'Montréal-Nord', 'Laval', 'Longueuil'].map((n) => ({
                    '@type': 'City', name: n, address: { '@type': 'PostalAddress', addressRegion: 'QC', addressCountry: 'CA' },
                  })),
                  currenciesAccepted: 'CAD',
                },
                {
                  '@type': 'SoftwareApplication',
                  name: site.name,
                  applicationCategory: 'ShoppingApplication',
                  operatingSystem: 'iOS, Android',
                  inLanguage: 'fr-CA',
                  description: site.description,
                },
              ],
            }),
          }}
        />
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-5 focus:py-3 focus:text-primary-foreground"
        >
          {nav.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
