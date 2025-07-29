// src/functions/logDbEnv.js

import { connectToMongo } from './mongo.js';

// Utility to log environment/db diagnostic information at server startup or upon demand
export async function logDbEnvContext(contextLabel = 'DB/Environment Context') {
  try {
    const db = await connectToMongo();
    const dbInfo = {
      NODE_ENV: process.env.NODE_ENV,
      DB_URI:
        process.env.NODE_ENV === 'production'
          ? process.env.MONGODB_URI_PROD
          : process.env.NODE_ENV === 'test'
          ? process.env.MONGODB_URI_TEST
          : process.env.MONGODB_URI_DEV,
      DB_DATABASE: db.databaseName,
      JWT_SECRET_SET: Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET !== 'dev_secret_key'),
      JWT_SECRET_SAMPLE: process.env.JWT_SECRET
        ? process.env.JWT_SECRET.length > 4
          ? process.env.JWT_SECRET.slice(0, 4) + '***'
          : '***'
        : '[not set]',
      CWD: process.cwd(),
      PID: process.pid,
      TIMESTAMP: new Date().toISOString(),
      PLATFORM: process.platform,
    };
    // eslint-disable-next-line no-console
    console.info(`[${contextLabel}]`, dbInfo);
    return dbInfo;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB ENV DIAG] Unable to fetch DB context:', err);
    return null;
  }
}