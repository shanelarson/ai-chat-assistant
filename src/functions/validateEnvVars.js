// src/functions/validateEnvVars.js
// Call validateRequiredEnvVars() at top-level startup to enforce env presence for secrets/critical values.

const REQUIRED_ENV_VARS = [
  // Database URIs
  'MONGODB_URI_DEV',
  'MONGODB_URI_PROD',
  'MONGODB_URI_TEST',
  // Auth
  'JWT_SECRET',
  'JWT_EXPIRY',
  'BCRYPT_SALT_ROUNDS',
  // OpenAI
  'OPENAI_API_KEY',
  'OPENAI_API_BASE_URL',
  'OPENAI_MODEL',
  // Server
  'SERVER_PORT',
  'SOCKET_IO_PORT',
  // CORS and frontend
  'CORS_ORIGIN',
  'PUBLIC_URL',
  'REACT_APP_API_URL',
  'REACT_APP_SOCKET_URL',
  // Rate limiting (optional but best to warn)
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX',
];

/**
 * Validates that all required env vars are present. Throws (and halts) in production on missing.
 * In non-production, logs warnings only and continues for easier dev.
 */
export function validateRequiredEnvVars() {
  const env = process.env.NODE_ENV;
  const missing = REQUIRED_ENV_VARS.filter(
    key =>
      process.env[key] === undefined ||
      process.env[key] === '' ||
      // For DB URIs, allow DB name placehoders in dev but not prod
      (key.startsWith('MONGODB_URI_') &&
        env === 'production' &&
        (process.env[key].includes('<user>') || process.env[key].includes('<password>') || process.env[key].includes('<host>') || process.env[key].includes('<dev_db>') || process.env[key].includes('<prod_db>') || process.env[key].includes('<test_db>')))
  );
  if (missing.length > 0) {
    const msg = `\n[ENV VALIDATION] Missing or invalid required environment variables:\n  ${missing.join(', ')}\n`;
    if (env === 'production') {
      // eslint-disable-next-line no-console
      console.error(msg);
      // Exit to avoid insecure or malfunctioning production
      process.exit(1);
    } else {
      // eslint-disable-next-line no-console
      console.warn('[ENV VALIDATION] (dev/test) -- WARNING:', msg);
    }
  }
}
