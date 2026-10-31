import type { Metadata } from 'next'
import '../styles/globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://dropsit.tech'),
  title: 'Dropit | Simple file sharing',
  description:
    'Private file sharing with short links, QR codes, and expiry controls.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    type: 'website',
    siteName: 'Dropit',
    title: 'Dropit | Simple file sharing',
    description:
      'Private file sharing with short links, QR codes, and expiry controls.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Dropit. Drop files. Share simply.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dropit | Simple file sharing',
    description:
      'Private file sharing with short links, QR codes, and expiry controls.',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
