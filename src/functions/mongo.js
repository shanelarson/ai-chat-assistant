import { MongoClient } from 'mongodb';

const getMongoUri = () => {
  // Try to use production URI if NODE_ENV is 'production', otherwise dev, fallback to test for 'test'
  const env = process.env.NODE_ENV;
  if (env === 'production') {
    return process.env.MONGODB_URI_PROD;
  } else if (env === 'test') {
    return process.env.MONGODB_URI_TEST;
  }
  return process.env.MONGODB_URI_DEV;
};

let client = null;
let db = null;

/**
 * Connect to MongoDB (singleton)
 * @returns {Promise<Db>} The MongoDB database instance
 */
export async function connectToMongo() {
  if (db) return db;
  const uri = getMongoUri();
  if (!uri) {
    throw new Error('MongoDB URI is not defined in environment variables.');
  }
  client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  await client.connect();
  // Use the fixed database name for the entire application
  const dbName = "ai_chat_assistant";
  db = client.db(dbName);
  return db;
}

/**
 * Get already connected MongoDB database instance, or throw if not connected
 * @returns {Db}
 */
export function getMongoDb() {
  if (!db) {
    throw new Error('MongoDB has not been connected yet! Call connectToMongo first.');
  }
  return db;
}

/**
 * Gracefully close the MongoDB connection (for shutdowns/tests)
 */
export async function closeMongoConnection() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}