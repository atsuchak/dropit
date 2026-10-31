import { MongoClient } from 'mongodb'

let clientPromise: Promise<MongoClient> | undefined

export function getMongoClient() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not configured')

  clientPromise ??= new MongoClient(uri).connect().catch((error) => {
    clientPromise = undefined
    throw error
  })
  return clientPromise
}

export async function getDatabase() {
  const client = await getMongoClient()
  return client.db('dropit')
}
