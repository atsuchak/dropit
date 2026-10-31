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
      <body>{children}</body>
    </html>
  )
}
