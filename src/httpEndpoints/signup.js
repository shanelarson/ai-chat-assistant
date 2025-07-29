import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { connectToMongo } from '../functions/mongo.js';

// Secure JWT secret: require it in production, allow fallback only in development
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret === 'dev_secret_key')) {
    throw new Error('JWT_SECRET must be set to a strong value in production.');
  }
  return secret || 'dev_secret_key';
}

const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
const JWT_EXPIRY = process.env.JWT_EXPIRY || '1d';

// Express handler for user signup
// NOTE: Endpoint path is /signup and is not prefixed with '/api' (see src/index.js). If endpoint path changes, update accordingly.
export default async function signupHandler(req, res) {
  try {
    const { email, password } = req.body || {};

    if (
      !email ||
      typeof email !== 'string' ||
      !password ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = await connectToMongo();
    const usersCol = db.collection('users');

    // Check if user already exists
    const existing = await usersCol.findOne({ email: { $eq: email } });
    if (existing) {
      return res.status(409).json({ error: 'User already exists with this email.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Create user doc
    const userDoc = {
      email,
      password: passwordHash,
      createdAt: new Date(),
      tokens: [], // For future: support multiple concurrent tokens/devices
    };

    // Insert user
    const { insertedId } = await usersCol.insertOne(userDoc);

    // Generate JWT token
    const tokenPayload = { userId: insertedId.toString(), email };
    let jwtSecret;
    try {
      jwtSecret = getJwtSecret();
    } catch (secretErr) {
      // Fail early if JWT_SECRET is not securely set in production
      return res.status(500).json({ error: secretErr.message });
    }
    const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: JWT_EXPIRY });

    // Store token on user document (push to tokens array)
    await usersCol.updateOne(
      { _id: insertedId },
      { $push: { tokens: token } }
    );

    // Return token for client to use
    res.status(201).json({ token });

  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
}