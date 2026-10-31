import { del, head, issueSignedToken, presignUrl } from '@vercel/blob'

export async function uploadUrls(
  files: { key: string; type: string; size: number }[],
) {
  const validUntil = Date.now() + 10 * 60_000
  const token = await issueSignedToken({
    pathname: '*',
    operations: ['put'],
    allowedContentTypes: [...new Set(files.map((file) => file.type))],
    maximumSizeInBytes: Math.max(...files.map((file) => file.size), 0),
    validUntil,
  })
  return Promise.all(
    files.map(async ({ key, type, size }) => {
      const { presignedUrl } = await presignUrl(token, {
        pathname: key,
        operation: 'put',
        access: 'private',
        allowedContentTypes: [type],
        maximumSizeInBytes: size,
        addRandomSuffix: false,
        allowOverwrite: false,
        validUntil,
      })
      return { key, url: presignedUrl, type }
    }),
  )
}

export async function downloadUrls(keys: string[], seconds: number) {
  const validUntil = Date.now() + seconds * 1000
  const token = await issueSignedToken({
    pathname: '*',
    operations: ['get'],
    validUntil,
  })
  return Promise.all(
    keys.map(async (key) => {
      const { presignedUrl } = await presignUrl(token, {
        pathname: key,
        operation: 'get',
        access: 'private',
        validUntil,
      })
      return presignedUrl
    }),
  )
}

export async function objectSize(key: string) {
  const blob = await head(key)
  return blob.size
}

export async function deleteObjects(keys: string[]) {
  if (keys.length) await del(keys)
}
