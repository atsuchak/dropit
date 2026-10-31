import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { shares } from '@/features/shares/server/model'
import { deleteObjects } from '@/lib/server/storage'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const secret = process.env.CLEANUP_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (
    !secret ||
    secret.length < 32 ||
    !supplied ||
    Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
  ) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  try {
    const collection = await shares()
    const now = new Date()
    const expired = await collection
      .find({
        $or: [
          {
            status: 'ready',
            expiresAt: { $lte: now },
            uploadExpiresAt: { $lte: now },
          },
          { status: 'uploading', uploadExpiresAt: { $lte: now } },
          { status: 'deleting', uploadExpiresAt: { $lte: now } },
        ],
      })
      .limit(50)
      .toArray()
    let deleted = 0
    for (const share of expired) {
      await deleteObjects([
        ...share.files.map((file) => file.key),
        ...(share.pendingFiles ?? []).map((file) => file.key),
        ...(share.retiredKeys ?? []),
      ])
      await collection.deleteOne({ _id: share._id, status: share.status })
      deleted++
    }
    const retired = await collection
      .find({
        status: 'ready',
        expiresAt: { $gt: now },
        uploadExpiresAt: { $lte: now },
        'retiredKeys.0': { $exists: true },
      })
      .limit(50)
      .toArray()
    for (const share of retired) {
      await deleteObjects(share.retiredKeys ?? [])
      await collection.updateOne(
        { _id: share._id, status: 'ready', uploadExpiresAt: { $lte: now } },
        { $set: { retiredKeys: [] } },
      )
    }
    return NextResponse.json({ deleted })
  } catch {
    return NextResponse.json({ error: 'Cleanup failed.' }, { status: 500 })
  }
}
