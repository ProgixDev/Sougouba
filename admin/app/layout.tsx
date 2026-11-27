import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import './globals.css';
import { LanguageGate } from '@/components/LanguageGate';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz', 'wdth'],
  display: 'swap',
  variable: '--font-display',
  // i18n-ignore: a font name.
  fallback: ['Georgia', 'serif'],
});

const body = Hanken_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
});

export const metadata: Metadata = {
  // i18n-ignore: the tab's title is fixed at build time, before any language is known; a name reads the same in both.
  title: 'Sougouba',
  // i18n-ignore: read by no person — the site is not indexed.
  description: 'Sougouba — console.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF9F7' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1712' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // i18n-ignore: the default until the inline script below sets the reader's own.
    <html lang="fr-CA" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var e=document.documentElement;try{var s=localStorage.getItem('sougouba-admin-theme');var d=s?s==='dark':matchMedia('(prefers-color-scheme:dark)').matches;if(d)e.classList.add('dark')}catch(x){}})()`,
          }}
        />
        {/* The document's language, by the same rule as `lib/i18n`: the saved choice, else the browser's. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var l=localStorage.getItem('sougouba-admin-lang');if(l!=='fr'&&l!=='en')l=(navigator.language||'').toLowerCase().indexOf('en')===0?'en':'fr';document.documentElement.lang=l==='en'?'en-CA':'fr-CA'}catch(x){}})()`,
          }}
        />
      </head>
      <body>
        <LanguageGate>{children}</LanguageGate>
      </body>
    </html>
  );
}
