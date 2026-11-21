import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

if (!uri) {
  throw new Error('Missing MONGODB_URI environment variable');
}

const globalForMongo = globalThis as unknown as {
  mongoClient?: MongoClient;
};

// Reuse the client in development to avoid connection spikes on hot-reload
export const mongoClient =
  globalForMongo.mongoClient ?? new MongoClient(uri);

if (process.env.NODE_ENV !== 'production') {
  globalForMongo.mongoClient = mongoClient;
}

export async function getMongoDb(): Promise<Db> {
  // .connect() is idempotent in modern driver versions—safe to call if already connected
  await mongoClient.connect();
  return mongoClient.db(dbName);
}