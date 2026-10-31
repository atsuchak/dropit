import type { ObjectId } from 'mongodb'
import { getDatabase } from '@/lib/server/mongodb'

export type StoredFile = {
  key: string
  name: string
  size: number
  type: string
}

export type Share = {
  _id?: ObjectId
  uploadId: string
  slug: string
  status: 'uploading' | 'ready' | 'deleting'
  files: StoredFile[]
  pendingFiles?: StoredFile[]
  retiredKeys?: string[]
  durationMinutes: number
  accessLimit: number
  accessCount: number
  accessSessions: string[]
  pinHash?: string
  uploadTokenHash: string
  createdAt: Date
  uploadExpiresAt: Date
  expiresAt?: Date
}

export async function shares() {
  const database = await getDatabase()
  return database.collection<Share>('shares')
}

let indexes: Promise<void> | undefined

export async function ensureShareIndexes() {
  indexes ??= (async () => {
    const collection = await shares()
    await collection.createIndexes([
      { key: { slug: 1 }, unique: true },
      { key: { status: 1, expiresAt: 1 } },
      { key: { status: 1, uploadExpiresAt: 1 } },
      { key: { uploadExpiresAt: 1 }, expireAfterSeconds: 172800 },
    ])
  })().catch((error) => {
    indexes = undefined
    throw error
  })
  return indexes
}
