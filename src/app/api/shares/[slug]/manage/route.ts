import { NextRequest, NextResponse } from 'next/server'
import { shares } from '@/features/shares/server/model'
import { hashPin, randomId, tokenHash } from '@/features/shares/server/security'
import {
  deleteObjects,
  downloadUrls,
  objectSize,
  uploadUrls,
} from '@/lib/server/storage'

export const runtime = 'nodejs'

function ownerToken(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  return token && /^[A-Za-z0-9_-]{32}$/.test(token) ? token : null
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params
    const token = ownerToken(request)
    if (!/^(?:[a-z]{11}|[A-Za-z0-9_-]{12})$/.test(slug) || !token)
      return NextResponse.json({ error: 'Share unavailable.' }, { status: 404 })
    const collection = await shares()
    const share = await collection.findOne({
      slug,
      uploadTokenHash: tokenHash(token),
      status: 'ready',
      expiresAt: { $gt: new Date() },
    })
    if (!share)
      return NextResponse.json({ error: 'Share unavailable.' }, { status: 410 })
    const imageFiles = share.files.filter((file) =>
      file.type.startsWith('image/'),
    )
    const previewUrls = imageFiles.length
      ? await downloadUrls(
          imageFiles.map((file) => file.key),
          300,
        )
      : []
    const previews = new Map(
      imageFiles.map((file, index) => [file.key, previewUrls[index]]),
    )
    const files = share.files.map(({ key, name, size, type }) => ({
      key,
      name,
      size,
      type,
      ...(previews.has(key) ? { previewUrl: previews.get(key) } : {}),
    }))
    return NextResponse.json(
      { files, expiresAt: share.expiresAt, accessLimit: share.accessLimit },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { error: 'Could not load share.' },
      { status: 500 },
    )
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params
    const token = ownerToken(request)
    if (!/^(?:[a-z]{11}|[A-Za-z0-9_-]{12})$/.test(slug) || !token)
      return NextResponse.json({ error: 'Share unavailable.' }, { status: 404 })

    const body = await request.json()
    const keepKeys = body.keepKeys
    const input = body.files
    if (
      !Array.isArray(keepKeys) ||
      !keepKeys.every((key) => typeof key === 'string') ||
      new Set(keepKeys).size !== keepKeys.length ||
      !Array.isArray(input) ||
      input.length < 1 ||
      input.length > 20
    )
      return NextResponse.json({ error: 'Invalid files.' }, { status: 400 })

    const collection = await shares()
    const share = await collection.findOne({
      slug,
      uploadTokenHash: tokenHash(token),
      status: 'ready',
      expiresAt: { $gt: new Date() },
    })
    if (!share)
      return NextResponse.json({ error: 'Share unavailable.' }, { status: 404 })
    const kept = share.files.filter((file) => keepKeys.includes(file.key))
    if (kept.length !== keepKeys.length)
      return NextResponse.json({ error: 'Invalid files.' }, { status: 400 })

    let total = kept.reduce((sum, file) => sum + file.size, 0)
    if (kept.length + input.length > 20)
      return NextResponse.json(
        { error: 'Choose up to 20 files.' },
        { status: 400 },
      )

    const pending = []
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
      )
        return NextResponse.json({ error: 'Invalid file.' }, { status: 400 })
      total += file.size
      if (total > 100 * 1024 * 1024)
        return NextResponse.json(
          { error: 'A share can contain up to 100 MB.' },
          { status: 400 },
        )
      pending.push({
        key: `uploads/${share.uploadId}/${randomId(12)}`,
        name: file.name.replace(/[\\/]/g, '_'),
        size: file.size,
        type: file.type || 'application/octet-stream',
      })
    }

    const updated = await collection.findOneAndUpdate(
      {
        _id: share._id,
        status: 'ready',
        expiresAt: { $gt: new Date() },
        ...(share.pendingFiles
          ? { pendingFiles: share.pendingFiles }
          : { pendingFiles: { $exists: false } }),
      },
      {
        $set: { pendingFiles: pending },
        ...(share.pendingFiles?.length
          ? {
              $addToSet: {
                retiredKeys: {
                  $each: share.pendingFiles.map((file) => file.key),
                },
              },
            }
          : {}),
        $max: { uploadExpiresAt: new Date(Date.now() + 12 * 60_000) },
      },
      { returnDocument: 'after' },
    )
    if (!updated)
      return NextResponse.json({ error: 'Share unavailable.' }, { status: 404 })

    if (share.pendingFiles?.length) {
      try {
        await deleteObjects(share.pendingFiles.map((file) => file.key))
      } catch {
        // Retired keys remain scheduled for cleanup.
      }
    }

    const uploads = await uploadUrls(pending)
    return NextResponse.json(
      { uploads },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { error: 'Could not prepare files.' },
      { status: 500 },
    )
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params
    const token = ownerToken(request)
    if (!/^(?:[a-z]{11}|[A-Za-z0-9_-]{12})$/.test(slug) || !token)
      return NextResponse.json({ error: 'Share unavailable.' }, { status: 404 })

    const body = await request.json()
    const durationMinutes = Number(body.durationMinutes)
    const accessLimit = Number(body.accessLimit)
    const pin = body.pin
    const keepKeys = body.keepKeys
    const newKeys = body.newKeys
    if (
      !Number.isFinite(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 720 ||
      !Number.isInteger(accessLimit) ||
      accessLimit < 1 ||
      accessLimit > 100 ||
      typeof pin !== 'string' ||
      (pin !== '' && !/^\d{4,12}$/.test(pin)) ||
      !Array.isArray(keepKeys) ||
      !keepKeys.every((key) => typeof key === 'string') ||
      new Set(keepKeys).size !== keepKeys.length ||
      !Array.isArray(newKeys) ||
      !newKeys.every((key) => typeof key === 'string') ||
      new Set(newKeys).size !== newKeys.length
    )
      return NextResponse.json(
        { error: 'Invalid share settings.' },
        { status: 400 },
      )

    const collection = await shares()
    const owner = {
      slug,
      uploadTokenHash: tokenHash(token),
      status: 'ready' as const,
    }
    const share = await collection.findOne({
      ...owner,
      expiresAt: { $gt: new Date() },
    })
    if (!share)
      return NextResponse.json({ error: 'Share unavailable.' }, { status: 404 })

    const kept = share.files.filter((file) => keepKeys.includes(file.key))
    const added = (share.pendingFiles ?? []).filter((file) =>
      newKeys.includes(file.key),
    )
    if (
      kept.length !== keepKeys.length ||
      added.length !== newKeys.length ||
      kept.length + added.length < 1 ||
      kept.length + added.length > 20 ||
      [...kept, ...added].reduce((sum, file) => sum + file.size, 0) >
        100 * 1024 * 1024
    )
      return NextResponse.json({ error: 'Invalid files.' }, { status: 400 })
    try {
      const sizes = await Promise.all(added.map((file) => objectSize(file.key)))
      if (sizes.some((size, index) => size !== added[index].size))
        return NextResponse.json(
          { error: 'A file is missing or changed.' },
          { status: 400 },
        )
    } catch {
      return NextResponse.json({ error: 'A file is missing.' }, { status: 400 })
    }

    const removedKeys = share.files
      .filter((file) => !keepKeys.includes(file.key))
      .map((file) => file.key)

    const expiresAt = new Date(
      Math.min(
        Date.now() + durationMinutes * 60_000,
        share.createdAt.getTime() + 720 * 60_000,
      ),
    )
    if (expiresAt.getTime() <= Date.now())
      return NextResponse.json({ error: 'Share has expired.' }, { status: 410 })

    const updated = await collection.findOneAndUpdate(
      { ...owner, expiresAt: { $gt: new Date() }, files: share.files },
      {
        $set: {
          files: [...kept, ...added],
          durationMinutes,
          accessLimit,
          expiresAt,
          ...(pin ? { pinHash: hashPin(pin) } : {}),
        },
        ...(newKeys.length
          ? { $pull: { pendingFiles: { key: { $in: newKeys } } } }
          : {}),
        ...(removedKeys.length
          ? { $addToSet: { retiredKeys: { $each: removedKeys } } }
          : {}),
        ...(pin ? {} : { $unset: { pinHash: '' } }),
      },
      { returnDocument: 'after' },
    )
    if (!updated)
      return NextResponse.json({ error: 'Share unavailable.' }, { status: 404 })

    let pendingCleanup = false
    if (removedKeys.length) {
      try {
        await deleteObjects(removedKeys)
      } catch {
        pendingCleanup = true
      }
    }
    return NextResponse.json(
      {
        expiresAt: updated.expiresAt,
        accessLimit: updated.accessLimit,
        pendingCleanup,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { error: 'Could not update share.' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params
    const token = ownerToken(request)
    if (!/^(?:[a-z]{11}|[A-Za-z0-9_-]{12})$/.test(slug) || !token)
      return NextResponse.json({ error: 'Share unavailable.' }, { status: 404 })

    const collection = await shares()
    const share = await collection.findOneAndUpdate(
      { slug, uploadTokenHash: tokenHash(token), status: 'ready' },
      { $set: { status: 'deleting', expiresAt: new Date() } },
      { returnDocument: 'after' },
    )
    if (!share)
      return NextResponse.json({ error: 'Share unavailable.' }, { status: 404 })

    let pendingCleanup = false
    try {
      await deleteObjects([
        ...share.files.map((file) => file.key),
        ...(share.pendingFiles ?? []).map((file) => file.key),
        ...(share.retiredKeys ?? []),
      ])
    } catch {
      pendingCleanup = true
    }
    return NextResponse.json(
      { deleted: true, pendingCleanup },
      {
        status: pendingCleanup ? 202 : 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  } catch {
    return NextResponse.json(
      { error: 'Could not delete share.' },
      { status: 500 },
    )
  }
}
