import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import signupHandler from './httpEndpoints/signup.js';
import loginHandler from './httpEndpoints/login.js';

// ---- Load environment ----
dotenv.config();

// ---- Validate environment variables ----
import { validateRequiredEnvVars } from './functions/validateEnvVars.js';
validateRequiredEnvVars();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Globals ----
const NODE_ENV = process.env.NODE_ENV || 'development';
const SERVER_PORT = process.env.SERVER_PORT || 3000;
const SOCKET_IO_PORT = process.env.SOCKET_IO_PORT || 4000;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:1234').split(',').map(x => x.trim());

// ---- Create Express App ----
const app = express();
app.use(express.json());

// ---- CORS ----
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true
}));
// ---- Attach static UI (production only) ----
if (NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
  // React Single Page App fallback
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/login') || req.path.startsWith('/signup')) {
      return next();
    }
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}
// ---- HTTP Endpoints ----
app.post('/api/signup', signupHandler);
app.post('/api/login', loginHandler);

// --- Conversations API Endpoints ---
import conversationsRouter from './httpEndpoints/conversations.js';
app.use('/api/conversations', conversationsRouter);







// ---- Example: Auth middleware for future endpoints ----
/*
// import authMiddleware from './httpEndpoints/auth.js';
// app.use(authMiddleware);
// app.get('/secure-data', (req, res) => { ... })
*/

// ---- HTTP Listen ----
const server = http.createServer(app);

// ---- Setup Socket.io server ----
const io = new SocketIOServer(server, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization", "Content-Type"],
  },
  transports: ["websocket"]
});

// ---- Socket.io Auth + Events ----

// Auth middleware for socket.io connections
import { connectToMongo } from './functions/mongo.js';
import jwt from 'jsonwebtoken';
// Attach user object to socket after verifying JWT token
io.use(async (socket, next) => {
  try {
    const { token } = socket.handshake.auth || {};
    if (!token) {
      return next(new Error('Authentication required'));
    }
    // Enforce strong JWT secret handling for sockets too
    const jwtSecret = (() => {
      const secret = process.env.JWT_SECRET;
      if (process.env.NODE_ENV === 'production' && (!secret || secret === 'dev_secret_key')) {
        throw new Error('JWT_SECRET must be set to a strong value in production.');
      }
      return secret || 'dev_secret_key';
    })();
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (e) {
      // Log for debug purposes
      // eslint-disable-next-line no-console
      console.error('[SOCKET AUTH] JWT verify failed:', e, 'token:', token);
      return next(new Error('Invalid or expired token'));
    }
    // Check user exists and token is in user.tokens
    const db = await connectToMongo();
    const usersCol = db.collection('users');
    let _id;
    try {
      // Always use ObjectId for Mongo user lookups
      if (db.bson && decoded.userId && typeof decoded.userId === 'string' && decoded.userId.length === 24) {
        _id = new db.bson.ObjectId(decoded.userId);
      } else {
        _id = decoded.userId;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[SOCKET AUTH] Cannot parse userId:', decoded.userId, e);
      return next(new Error('Malformed user id in token'));
    }

    let userDoc;
    try {
      userDoc = await usersCol.findOne({
        _id,
        email: decoded.email,
        tokens: { $elemMatch: { $eq: token } }
      });
      if (!userDoc) {
        // Retry without email match in case user changed email after token issued
        userDoc = await usersCol.findOne({
          _id,
          tokens: { $elemMatch: { $eq: token } }
        });
        if (userDoc && userDoc.email !== decoded.email) {
          // Invalidate this token for this user (user changed email)
          await usersCol.updateOne(
            { _id },
            { $pull: { tokens: token } }
          );
          // eslint-disable-next-line no-console
          console.error('[SOCKET AUTH] Email in token does not match email in DB; token removed.', {
            userId: decoded.userId, email: decoded.email, dbEmail: userDoc.email, token
          });
          return next(new Error('Email changed. Please log in again.'));
        }
      }
    } catch (dbErr) {
      // eslint-disable-next-line no-console
      console.error('[SOCKET AUTH] DB lookup error:', dbErr);
      return next(new Error('Database error during authentication.'));
    }
    if (!userDoc) {
      // Removed: do NOT indiscriminately prune tokens from all users!
      // Only log for debug
      // eslint-disable-next-line no-console
      console.error('[SOCKET AUTH] Token did not match any user session:', {
        userId: decoded.userId,
        email: decoded.email,
        token
      });
      return next(new Error('User not found or token revoked.'));
    }
    socket.data.user = userDoc;
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[SOCKET AUTH] Unhandled error:', err);
    return next(new Error('Authentication failed'));
  }
});









// Register socket.io events






import handleMessage from './socketEventHandlers/message.js';

io.on('connection', (socket) => {
  // Chat message event
  socket.on('message', (payload) => handleMessage(socket, payload));

  // -- More event handlers can be added here --
});

// ---- Start Servers ----

// Listen HTTP API server
server.listen(SERVER_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Express] API + Static server listening on port ${SERVER_PORT}`);
  console.log(`[CORS] Allowed origins: ${CORS_ORIGIN.join(', ')}`);
});

// Start Socket.IO server on separate port if required
if (SOCKET_IO_PORT !== SERVER_PORT) {
  io.listen(SOCKET_IO_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[Socket.io] Real-time server listening on port ${SOCKET_IO_PORT}`);
    console.log(`[Socket.io CORS] Allowed origins: ${CORS_ORIGIN.join(', ')}`);
  });
}










