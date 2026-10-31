import { del, head, issueSignedToken, presignUrl } from '@vercel/blob'

export async function uploadUrl(
  key: string,
  contentType: string,
  size: number,
) {
  const validUntil = Date.now() + 10 * 60_000
  const token = await issueSignedToken({
    pathname: key,
    operations: ['put'],
    allowedContentTypes: [contentType],
    maximumSizeInBytes: size,
    validUntil,
  })
  const { presignedUrl } = await presignUrl(token, {
    pathname: key,
    operation: 'put',
    access: 'private',
    allowedContentTypes: [contentType],
    maximumSizeInBytes: size,
    addRandomSuffix: false,
    allowOverwrite: false,
    validUntil,
  })
  return presignedUrl
}

export async function downloadUrl(key: string, seconds: number) {
  const validUntil = Date.now() + seconds * 1000
  const token = await issueSignedToken({
    pathname: key,
    operations: ['get'],
    validUntil,
  })
  const { presignedUrl } = await presignUrl(token, {
    pathname: key,
    operation: 'get',
    access: 'private',
    validUntil,
  })
  return presignedUrl
}

export async function objectSize(key: string) {
  const blob = await head(key)
  return blob.size
}

export async function deleteObjects(keys: string[]) {
  if (keys.length) await del(keys)
}
