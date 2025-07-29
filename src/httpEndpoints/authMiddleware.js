import jwt from 'jsonwebtoken';
import { connectToMongo } from '../functions/mongo.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

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
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    // Look up user in DB and confirm token exists
    const db = await connectToMongo();
    const usersCol = db.collection('users');
    const user = await usersCol.findOne({
      _id: db.bson
        ? new db.bson.ObjectId(decoded.userId)
        : decoded.userId,
      email: decoded.email,
      tokens: { $elemMatch: { $eq: token } }
    });
    if (!user) {
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