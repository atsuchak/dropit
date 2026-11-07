import { NextResponse } from 'next/server'
import { shares } from '@/features/shares/server/model'
import { isValidSlug } from '@/features/shares/slug'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params
    if (!isValidSlug(slug))
      return NextResponse.json(
        { active: false },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    const collection = await shares()
    const share = await collection.findOne(
      { slug, status: 'ready', expiresAt: { $gt: new Date() } },
      { projection: { expiresAt: 1 } },
    )
    return NextResponse.json(
      { active: Boolean(share), expiresAt: share?.expiresAt },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { error: 'Could not check share.' },
      { status: 500 },
    )
  }
}
