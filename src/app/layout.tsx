import type { Metadata } from 'next'
import {
  openGraphMetadata,
  siteDescription,
  siteTitle,
} from '@/features/shares/metadata'
import '../styles/globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://dropsit.tech'),
  title: siteTitle,
  description: siteDescription,
  icons: { icon: '/favicon.svg' },
  openGraph: openGraphMetadata('/'),
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="site-footer">
          <p>
            © {new Date().getFullYear()} Ahnaf Tajwar Suchak. All rights
            reserved.
          </p>
          <nav className="footer-links" aria-label="Social links">
            <a
              href="https://atsuchak.me"
              aria-label="Portfolio"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
              </svg>
            </a>
            <a href="mailto:ahnaftajwarsuchak@gmail.com" aria-label="Email">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/in/atsuchak"
              aria-label="LinkedIn"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M5.5 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3.5 9.5h4v11h-4v-11Zm6.5 0h3.8V11c.6-1 1.7-1.7 3.2-1.7 3.1 0 4.5 1.8 4.5 5v6.2h-4v-5.8c0-1.4-.5-2.2-1.7-2.2-1.3 0-1.8.9-1.8 2.2v5.8h-4v-11Z" />
              </svg>
            </a>
            <a
              href="https://github.com/atsuchak"
              aria-label="GitHub"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.77.6-3.36-1.18-3.36-1.18-.45-1.15-1.1-1.46-1.1-1.46-.9-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.64.35-1.08.63-1.33-2.21-.25-4.53-1.1-4.53-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.65c.85 0 1.7.11 2.5.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.85-2.32 4.68-4.54 4.93.36.31.68.92.68 1.85v2.94c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
              </svg>
            </a>
          </nav>
        </footer>
      </body>
    </html>
  )
}
