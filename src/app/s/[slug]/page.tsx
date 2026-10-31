import { ShareView } from '@/features/shares/components/share-view'
import type { Metadata } from 'next'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <ShareView slug={slug} siteKey={process.env.TURNSTILE_SITE_KEY} />
}
