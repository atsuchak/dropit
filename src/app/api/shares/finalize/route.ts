import { NextRequest, NextResponse } from 'next/server'
import { shares } from '@/features/shares/server/model'
import { tokenHash } from '@/features/shares/server/security'
import { objectSize } from '@/lib/server/storage'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (
      typeof body.uploadId !== 'string' ||
      !/^[A-Za-z0-9_-]{24}$/.test(body.uploadId) ||
      typeof body.uploadToken !== 'string' ||
      !/^[A-Za-z0-9_-]{32}$/.test(body.uploadToken)
    ) {
      return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 })
    }
    const collection = await shares()
    const share = await collection.findOne({
      uploadId: body.uploadId,
      uploadTokenHash: tokenHash(body.uploadToken),
      status: 'uploading',
      uploadExpiresAt: { $gt: new Date() },
    })
    if (!share)
      return NextResponse.json(
        { error: 'Upload expired or invalid.' },
        { status: 404 },
      )

    const actualSizes = await Promise.all(
      share.files.map((file) => objectSize(file.key)),
    )
    if (
      actualSizes.some(
        (size: number, index: number) => size !== share.files[index].size,
      )
    ) {
      return NextResponse.json(
        { error: 'A file is missing or its size changed.' },
        { status: 400 },
      )
    }
    const expiresAt = new Date(Date.now() + share.durationMinutes * 60_000)
    const updated = await collection.findOneAndUpdate(
      {
        _id: share._id,
        status: 'uploading',
        uploadExpiresAt: { $gt: new Date() },
      },
      { $set: { status: 'ready', expiresAt } },
      { returnDocument: 'after' },
    )
    if (!updated)
      return NextResponse.json(
        { error: 'Upload already finalized.' },
        { status: 409 },
      )
    return NextResponse.json(
      { slug: share.slug, expiresAt },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { error: 'Could not finish upload.' },
      { status: 500 },
    )
  }
}
