import jwt from 'jsonwebtoken';
import { connectToMongo } from '../functions/mongo.js';

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

    // Look up user in DB and confirm token exists
    const db = await connectToMongo();
    const usersCol = db.collection('users');
    // Defensive logging for debugging
    let user;
    try {
      user = await usersCol.findOne({
        _id: db.bson ? new db.bson.ObjectId(decoded.userId) : decoded.userId,
        email: decoded.email,
        tokens: { $elemMatch: { $eq: token } }
      });
      if (!user) {
        // Try again without email field in query; maybe email was changed
        user = await usersCol.findOne({
          _id: db.bson ? new db.bson.ObjectId(decoded.userId) : decoded.userId,
          tokens: { $elemMatch: { $eq: token } }
        });
        if (user && user.email !== decoded.email) {
          // UserId and token matched but email in DB does not match token
          // (possibly a sign of user email change after issuance)
          // Remove this token from the user, force re-login.
          await usersCol.updateOne(
            { _id: user._id },
            { $pull: { tokens: token } }
          );
          return res.status(401).json({ error: 'Email changed. Please log in again.' });
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Auth middleware DB lookup error:', e);
      return res.status(500).json({ error: 'Database error during authentication.' });
    }
    if (!user) {
      // Optionally: Clean up the stale token in all users (shouldn't occur in normal use)
      // (Optional, can comment out if undesirable)
      await usersCol.updateMany(
        { tokens: { $elemMatch: { $eq: token } } },
        { $pull: { tokens: token } }
      );
      // eslint-disable-next-line no-console
      console.error('[AUTH] Token in request did not match any valid user session:', {
        userId: decoded.userId,
        email: decoded.email
      });
      return res.status(401).json({ error: 'User not found or token revoked.' });
    }

    // Attach user and token to request
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Internal server error (auth).' });
  }
}