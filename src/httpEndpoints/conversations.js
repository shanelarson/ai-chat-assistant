import { connectToMongo } from '../functions/mongo.js';
import authMiddleware from './authMiddleware.js';
import express from 'express';

const router = express.Router();

// GET /api/conversations - Get all conversations for the authenticated user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = await connectToMongo();
    const conversationsCol = db.collection('conversations');

    // Find conversations for this user, newest first
    const conversations = await conversationsCol
      .find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .toArray();

    // Map or filter output if you want to hide internal fields
    res.json(
      conversations.map(conv => ({
        _id: conv._id,
        userId: conv.userId,
        messages: conv.messages || [],
        updatedAt: conv.updatedAt
      }))
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('GET /api/conversations error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/conversations - Start a new conversation for user (empty)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const db = await connectToMongo();
    const conversationsCol = db.collection('conversations');
    // Optionally, accept "messages" and/or name/title etc from req.body
    const convo = {
      userId: req.user._id,
      messages: [],
      updatedAt: new Date()
    };
    const { insertedId } = await conversationsCol.insertOne(convo);

    // Fetch conversation back to get _id
    const newConv = await conversationsCol.findOne({ _id: insertedId });

    res.status(201).json({
      _id: newConv._id,
      userId: newConv.userId,
      messages: newConv.messages,
      updatedAt: newConv.updatedAt
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('POST /api/conversations error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;