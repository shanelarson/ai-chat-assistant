import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { connectToMongo } from '../functions/mongo.js';

const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '1d';

// Express handler for user login
export default async function loginHandler(req, res) {
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

    // Find user by email
    const userDoc = await usersCol.findOne({ email: { $eq: email } });
    if (!userDoc || !userDoc.password) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Compare password
    const valid = await bcrypt.compare(password, userDoc.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT token
    const tokenPayload = { userId: userDoc._id.toString(), email: userDoc.email };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    // Store token on user document (push to tokens array)
    await usersCol.updateOne(
      { _id: userDoc._id },
      { $push: { tokens: token } }
    );

    // Return token for client to use
    res.status(200).json({ token });

  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
}