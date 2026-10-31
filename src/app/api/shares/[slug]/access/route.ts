import { NextRequest, NextResponse } from 'next/server'
import { shares } from '@/features/shares/server/model'
import {
  checkPin,
  tokenHash,
  verifyTurnstile,
} from '@/features/shares/server/security'
import { downloadUrl } from '@/lib/server/storage'

export const runtime = 'nodejs'

export async function POST(
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
    const body = await request.json()
    const sessionId = request.cookies.get(`dropit_session_${slug}`)?.value
    if (!sessionId || !/^[A-Za-z0-9_-]{24}$/.test(sessionId)) {
      return NextResponse.json(
        { error: 'Reload the share page and try again.' },
        { status: 400 },
      )
    }
    const sessionHash = tokenHash(`${slug}:${sessionId}`)
    const collection = await shares()
    const now = new Date()
    let share = await collection.findOne({
      slug,
      status: 'ready',
      expiresAt: { $gt: now },
    })
    if (!share || !share.expiresAt)
      return NextResponse.json(
        { error: 'This share is unavailable or expired.' },
        { status: 404 },
      )

    const alreadyAdmitted = share.accessSessions.includes(sessionHash)
    if (!alreadyAdmitted) {
      if (share.accessCount >= share.accessLimit)
        return NextResponse.json(
          { error: 'Access limit reached.' },
          { status: 410 },
        )
      if (!(await verifyTurnstile(body.turnstileToken))) {
        return NextResponse.json(
          { error: 'Security check failed.' },
          { status: 403 },
        )
      }
      if (
        share.pinHash &&
        (typeof body.pin !== 'string' || !checkPin(body.pin, share.pinHash))
      ) {
        return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 403 })
      }
      share = await collection.findOneAndUpdate(
        {
          slug,
          status: 'ready',
          expiresAt: { $gt: new Date() },
          accessSessions: { $ne: sessionHash },
          $expr: { $lt: ['$accessCount', '$accessLimit'] },
        },
        {
          $inc: { accessCount: 1 },
          $addToSet: { accessSessions: sessionHash },
        },
        { returnDocument: 'after' },
      )
      if (!share) {
        share = await collection.findOne({
          slug,
          status: 'ready',
          expiresAt: { $gt: new Date() },
          accessSessions: sessionHash,
        })
      }
      if (!share || !share.expiresAt)
        return NextResponse.json(
          { error: 'Access limit reached or share expired.' },
          { status: 410 },
        )
    }

    const seconds = Math.floor((share.expiresAt.getTime() - Date.now()) / 1000)
    if (seconds < 1)
      return NextResponse.json(
        { error: 'This share has expired.' },
        { status: 410 },
      )
    const files = await Promise.all(
      share.files.map(async (file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
        url: await downloadUrl(file.key, Math.min(60, seconds)),
      })),
    )
    return NextResponse.json(
      { files, expiresAt: share.expiresAt },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { error: 'Could not open share.' },
      { status: 500 },
    )
  }
}
