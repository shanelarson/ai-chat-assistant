import jwt from 'jsonwebtoken';
import { connectToMongo } from '../functions/mongo.js';
import { logDbEnvContext } from '../functions/logDbEnv.js';
import { ObjectId } from 'mongodb';

// Enforce strict requirement for JWT_SECRET in production
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret === 'dev_secret_key')) {
    throw new Error('JWT_SECRET must be set to a strong value in production.');
  }
  // Allow weak default only for non-prod environments for dev convenience
  return secret || 'dev_secret_key';
}

// Express middleware to authenticate user via Bearer token in Authorization header
export default async function authMiddleware(req, res, next) {
  try {
    // ADDITIONAL DIAGNOSTICS: Log db/env context on first auth call of process
    if (!process._hasLoggedDbEnvContext) {
      await logDbEnvContext('REST AuthMiddleware Startup');
      process._hasLoggedDbEnvContext = true;
    }

    const header = req.headers['authorization'];
    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return res.status(401).json({ error: 'No token provided.' });
    }

    let decoded;
    let jwtSecret;
    try {
      jwtSecret = getJwtSecret();
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    // Look up user in DB and confirm token exists (force ObjectId for _id lookup)
    const db = await connectToMongo();
    const usersCol = db.collection('users');
    let user;
    let userIdAsObjectId;
    try {
      // Validate and convert userId string to ObjectId for lookup (reject if malformed)
      if (
        typeof decoded.userId !== 'string' ||
        decoded.userId.length !== 24 ||
        !/^[a-fA-F0-9]{24}$/.test(decoded.userId)
      ) {
        // eslint-disable-next-line no-console
        console.error(
          '[AUTH] Invalid userId in JWT token (not 24-char hex string):',
          decoded.userId
        );
        return res.status(401).json({ error: 'Invalid user credentials.' });
      }
      userIdAsObjectId = new ObjectId(decoded.userId);

      // Always force ObjectId for lookup on _id fields
      user = await usersCol.findOne({
        _id: userIdAsObjectId,
        email: decoded.email,
        tokens: { $elemMatch: { $eq: token } }
      });
      if (!user) {
        // Try again without email in query; maybe email was changed
        user = await usersCol.findOne({
          _id: userIdAsObjectId,
          tokens: { $elemMatch: { $eq: token } }
        });
        if (user && user.email !== decoded.email) {
          // UserId and token matched but email in DB does not match token (e.g., after email change)
          // Remove this token from this user only (not globally)
          await usersCol.updateOne(
            { _id: user._id },
            { $pull: { tokens: token } }
          );
          // Improved logging
          // eslint-disable-next-line no-console
          console.warn('[AUTH] Token revoked due to email change:', {
            _id: user._id?.toString?.(),
            dbEmail: user.email,
            tokenEmail: decoded.email,
            tokenValue: token
          });
          return res.status(401).json({ error: 'Email changed. Please log in again.' });
        }
      }
      // Defensive: check for multiple users with the same token (should not happen)
      const count = await usersCol.countDocuments({ tokens: { $elemMatch: { $eq: token } } });
      if (count > 1) {
        // eslint-disable-next-line no-console
        console.error('[AUTH] WARNING: Multiple users share the same token!', { token, count });
      }
      // Log if user not found for extra diagnostics
      if (!user) {
        // eslint-disable-next-line no-console
        console.error('[AUTH] Token lookup failed:', {
          usingDb: db.databaseName,
          collection: usersCol.collectionName,
          token: token,
          decodedUserId: decoded?.userId,
          decodedEmail: decoded?.email,
          userIdQuery: userIdAsObjectId
        });
        await logDbEnvContext('REST AuthMiddleware Token Lookup Failure');
        return res.status(401).json({ error: 'User not found or token revoked.' });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Auth middleware DB lookup error:', e, {
        token: token,
        decoded: decoded
      });
      await logDbEnvContext('REST AuthMiddleware DB Error');
      return res.status(500).json({ error: 'Database error during authentication.' });
    }
    // Attach user and token to request
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Auth middleware error:', err);
    await logDbEnvContext('REST AuthMiddleware General Error');
    res.status(500).json({ error: 'Internal server error (auth).' });
  }
}



