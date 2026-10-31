import { NextRequest, NextResponse } from 'next/server'
import { shares } from '@/features/shares/server/model'
import { randomId } from '@/features/shares/server/security'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params
    if (!/^(?:[a-z]{11}|[A-Za-z0-9_-]{12})$/.test(slug)) {
      return NextResponse.json(
        { error: 'This share is unavailable or expired.' },
        { status: 404 },
      )
    }
    const collection = await shares()
    const share = await collection.findOne(
      { slug, status: 'ready', expiresAt: { $gt: new Date() } },
      {
        projection: {
          pinHash: 1,
          expiresAt: 1,
          accessCount: 1,
          accessLimit: 1,
        },
      },
    )
    if (!share)
      return NextResponse.json(
        { error: 'This share is unavailable or expired.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      )
    if (share.accessCount >= share.accessLimit)
      return NextResponse.json(
        { error: 'Access limit reached.' },
        { status: 410, headers: { 'Cache-Control': 'no-store' } },
      )
    const response = NextResponse.json(
      { hasPin: Boolean(share.pinHash), expiresAt: share.expiresAt },
      { headers: { 'Cache-Control': 'no-store' } },
    )
    const cookieName = `dropit_session_${slug}`
    // Each page visit gets a new session, so reopening a share uses another access.
    response.cookies.set(cookieName, randomId(18), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: `/api/shares/${slug}`,
      expires: share.expiresAt,
    })
    return response
  } catch {
    return NextResponse.json(
      { error: 'Could not load share.' },
      { status: 500 },
    )
  }
}
