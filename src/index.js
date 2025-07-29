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
app.post('/signup', signupHandler);
app.post('/login', loginHandler);

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
    origin: CORS_ORIGIN
  }
});

// ---- Socket.io Auth + Events ----

// Auth middleware for socket.io connections
import { connectToMongo } from './functions/mongo.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

// Attach user object to socket after verifying JWT token
io.use(async (socket, next) => {
  try {
    const { token } = socket.handshake.auth || {};
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    // Check user exists and token is in user.tokens
    const db = await connectToMongo();
    const usersCol = db.collection('users');
    const userDoc = await usersCol.findOne({
      _id: db.bson
        ? new db.bson.ObjectId(decoded.userId)
        : decoded.userId,
      email: decoded.email,
      tokens: { $elemMatch: { $eq: token } }
    });
    if (!userDoc) return next(new Error('Invalid or expired token'));
    socket.data.user = userDoc;
    next();
  } catch (err) {
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
server.listen(SERVER_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Express] API + Static server listening on port ${SERVER_PORT}`);
  console.log(`[CORS] Allowed origins: ${CORS_ORIGIN.join(', ')}`);
});
io.listen(SOCKET_IO_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Socket.io] Real-time server listening on port ${SOCKET_IO_PORT}`);
});
