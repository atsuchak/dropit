import { NextRequest, NextResponse } from 'next/server'
import {
  ensureShareIndexes,
  shares,
  type StoredFile,
} from '@/features/shares/server/model'
import {
  hashPin,
  randomId,
  tokenHash,
  verifyTurnstile,
} from '@/features/shares/server/security'
import { uploadUrl } from '@/lib/server/storage'

export const runtime = 'nodejs'

type InputFile = { name?: unknown; size?: unknown; type?: unknown }

export async function POST(request: NextRequest) {
  let step = 'request'
  try {
    const body = await request.json()
    const input = body.files as InputFile[]
    const durationMinutes = Number(body.durationMinutes ?? 5)
    const accessLimit = Number(body.accessLimit ?? 1)
    const pin = body.pin

    if (
      !Array.isArray(input) ||
      input.length < 1 ||
      input.length > 20 ||
      !Number.isFinite(durationMinutes) ||
      durationMinutes < 0.5 ||
      durationMinutes > 1440 ||
      !Number.isInteger(accessLimit) ||
      accessLimit < 1 ||
      accessLimit > 100 ||
      (pin !== undefined &&
        (typeof pin !== 'string' || !/^\d{4,12}$/.test(pin)))
    ) {
      return NextResponse.json(
        { error: 'Invalid share settings.' },
        { status: 400 },
      )
    }

    let total = 0
    const uploadId = randomId(18)
    const files: StoredFile[] = []
    for (const file of input) {
      if (
        typeof file.name !== 'string' ||
        !file.name.trim() ||
        file.name.length > 255 ||
        typeof file.size !== 'number' ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        typeof file.type !== 'string' ||
        file.type.length > 200
      ) {
        return NextResponse.json({ error: 'Invalid file.' }, { status: 400 })
      }
      total += file.size
      if (total > 100 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'A share can contain up to 100 MB.' },
          { status: 400 },
        )
      }
      files.push({
        key: `uploads/${uploadId}/${randomId(12)}`,
        name: file.name.replace(/[\\/]/g, '_'),
        size: file.size,
        type: file.type || 'application/octet-stream',
      })
    }

    step = 'security check'
    if (!(await verifyTurnstile(body.turnstileToken))) {
      return NextResponse.json(
        { error: 'Security check failed.' },
        { status: 403 },
      )
    }

    step = 'database'
    await ensureShareIndexes()
    const uploadToken = randomId(24)
    const slug = randomId()
    const now = new Date()
    const collection = await shares()
    await collection.insertOne({
      uploadId,
      slug,
      status: 'uploading',
      files,
      durationMinutes,
      accessLimit,
      accessCount: 0,
      accessSessions: [],
      ...(pin ? { pinHash: hashPin(pin) } : {}),
      uploadTokenHash: tokenHash(uploadToken),
      createdAt: now,
      uploadExpiresAt: new Date(now.getTime() + 12 * 60_000),
    })

    step = 'file storage'
    const uploads = await Promise.all(
      files.map(async (file) => ({
        key: file.key,
        url: await uploadUrl(file.key, file.type, file.size),
        type: file.type,
      })),
    )
    return NextResponse.json(
      { uploadId, uploadToken, uploads },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (process.env.NODE_ENV !== 'production')
      console.error(`Share preparation failed during ${step}:`, error)
    const failure = error as {
      name?: string
      code?: string | number
      cause?: { code?: string | number }
    }
    return NextResponse.json(
      {
        error: `Could not prepare upload: ${step} failed.`,
        ...(process.env.NODE_ENV !== 'production'
          ? {
              diagnostic: {
                name: failure?.name,
                code: failure?.code,
                causeCode: failure?.cause?.code,
              },
            }
          : {}),
      },
      { status: 500 },
    )
  }
}
