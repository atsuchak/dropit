import { ShareView } from '@/features/shares/components/share-view'
import type { Metadata } from 'next'
import { openGraphMetadata } from '@/features/shares/metadata'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return {
    robots: { index: false, follow: false },
    openGraph: openGraphMetadata(`/s/${slug}`),
  }
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <ShareView slug={slug} siteKey={process.env.TURNSTILE_SITE_KEY} />
}
