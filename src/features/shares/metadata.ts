const title = 'Dropit | Private file sharing'
const description =
  'Share files privately with short links, QR codes, expiry times, and access limits.'

export function openGraphMetadata(url: string) {
  return {
    type: 'website' as const,
    siteName: 'Dropit',
    title,
    description,
    url,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Dropit. Drop files. Share simply.',
      },
    ],
  }
}

export const siteTitle = title
export const siteDescription = description
