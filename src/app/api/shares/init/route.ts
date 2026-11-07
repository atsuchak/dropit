import { NextRequest, NextResponse } from 'next/server'
import {
  ensureShareIndexes,
  shares,
  type StoredFile,
} from '@/features/shares/server/model'
import {
  hashPin,
  randomId,
  randomSlug,
  tokenHash,
  verifyTurnstile,
} from '@/features/shares/server/security'
import { uploadUrls } from '@/lib/server/storage'
import { isValidCustomSlug } from '@/features/shares/slug'

export const runtime = 'nodejs'

type InputFile = { name?: unknown; size?: unknown; type?: unknown }

export async function POST(request: NextRequest) {
  let step = 'request'
  let customSlugRequested = false
  const started = performance.now()
  try {
    const body = await request.json()
    const input = body.files as InputFile[]
    const durationMinutes = Number(body.durationMinutes ?? 5)
    const accessLimit = Number(body.accessLimit ?? 1)
    const pin = body.pin
    const customSlug =
      typeof body.customSlug === 'string'
        ? body.customSlug.trim().toLowerCase()
        : body.customSlug

    if (
      !Array.isArray(input) ||
      input.length < 1 ||
      input.length > 20 ||
      !Number.isFinite(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 720 ||
      !Number.isInteger(accessLimit) ||
      accessLimit < 1 ||
      accessLimit > 100 ||
      (customSlug !== undefined &&
        (typeof customSlug !== 'string' ||
          (customSlug !== '' && !isValidCustomSlug(customSlug)))) ||
      (pin !== undefined &&
        (typeof pin !== 'string' || !/^\d{4,12}$/.test(pin)))
    ) {
      return NextResponse.json(
        { error: 'Invalid share settings.' },
        { status: 400 },
      )
    }
    customSlugRequested = Boolean(customSlug)

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
    const verified = performance.now()

    step = 'database or file storage'
    const uploadToken = randomId(24)
    const slug = customSlug || randomSlug()
    const now = new Date()
    const record = {
      uploadId,
      slug,
      status: 'uploading' as const,
      files,
      pendingFiles: [],
      retiredKeys: [],
      durationMinutes,
      accessLimit,
      accessCount: 0,
      accessSessions: [],
      ...(pin ? { pinHash: hashPin(pin) } : {}),
      uploadTokenHash: tokenHash(uploadToken),
      createdAt: now,
      uploadExpiresAt: new Date(now.getTime() + 12 * 60_000),
    }

    let databaseTime = 0
    let signingTime = 0
    const [, uploads] = await Promise.all([
      (async () => {
        const startedDatabase = performance.now()
        await ensureShareIndexes()
        const collection = await shares()
        await collection.insertOne(record)
        databaseTime = performance.now() - startedDatabase
      })(),
      uploadUrls(files).then((result) => {
        signingTime = performance.now() - verified
        return result
      }),
    ])
    return NextResponse.json(
      { uploadId, uploadToken, slug, uploads },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Server-Timing': `security;dur=${(verified - started).toFixed(1)}, database;dur=${databaseTime.toFixed(1)}, signing;dur=${signingTime.toFixed(1)}`,
        },
      },
    )
  } catch (error) {
    const failure = error as {
      name?: string
      code?: string | number
      cause?: { code?: string | number }
    }
    if (failure?.code === 11000)
      return NextResponse.json(
        {
          error: customSlugRequested
            ? 'This custom URL is already taken. Choose another one.'
            : 'Could not create a unique URL. Try again.',
        },
        { status: 409 },
      )
    if (process.env.NODE_ENV !== 'production')
      console.error(`Share preparation failed during ${step}:`, error)
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
