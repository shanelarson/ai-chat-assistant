import { connectToMongo } from '../functions/mongo.js';
import { ObjectId } from 'mongodb';
import OpenAI from 'openai';

// Helper to get OpenAI config
function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1';
  return new OpenAI({ apiKey, baseURL });
}
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
// Message event handler for Socket.IO server
// Expects: { conversationId, message }
// Emits: 
//   - 'messageStreamChunk' { conversationId, chunk } as message streams in
//   - 'messageStreamEnd' { conversationId } when done
//   - 'errorMessage' { error } on error
//   - 'messageRejected' { error, rejectedMessage, conversationId } if user sends another message before assistant reply

export default async function handleMessage(socket, payload) {
  try {
    const { conversationId, message } = payload || {};
    // Require user from socket data (populated during auth)
    const user = socket.data.user;
    if (!user || !user._id) {
      socket.emit('errorMessage', { error: 'Not authorized.' });
      return;
    }
    if (!conversationId || typeof message !== 'string' || !message.trim()) {
      socket.emit('errorMessage', { error: 'Missing conversationId or message.' });
      return;
    }
    const db = await connectToMongo();
    const conversationsCol = db.collection('conversations');

    // Validate conversationId is a valid ObjectId string
    let conversationObjId;
    if (typeof conversationId === 'string' && conversationId.length === 24) {
      try {
        conversationObjId = new ObjectId(conversationId);
      } catch (e) {
        socket.emit('errorMessage', { error: 'Invalid conversation ID.' });
        return;
      }
    } else {
      socket.emit('errorMessage', { error: 'Invalid conversation ID.' });
      return;
    }

    // Find conversation and ensure it belongs to user
    const conversation = await conversationsCol.findOne({
      _id: conversationObjId,
      userId: user._id
    });
    if (!conversation) {
      socket.emit('errorMessage', { error: 'Conversation not found.' });
      return;
    }

    // Active "awaiting AI response" block: check if last message is user with no assistant reply
    // (if last message is user, do not accept new user message)
    const messagesArr = Array.isArray(conversation.messages) ? conversation.messages : [];
    if (
      messagesArr.length > 0 &&
      messagesArr[messagesArr.length - 1].type === 'user'
    ) {
      socket.emit('messageRejected', {
        reason: 'Please wait for the assistant to respond before sending another message.',
        message: message,
        conversationId
      });
      return;
    }

    // Prepare previous messages
    const prevMessages = Array.isArray(conversation.messages)
      ? conversation.messages
      : [];
    const userMessage = {
      type: 'user',
      content: message,
      createdAt: new Date()
    };
    const newMessages = [...prevMessages, userMessage];

    // Update the conversation immediately with user message
    await conversationsCol.updateOne(
      { _id: conversation._id },
      { $push: { messages: userMessage }, $set: { updatedAt: new Date() } }
    );

    // Set up request to OpenAI API (stream enabled)
    const openai = getOpenAIClient();

    // Create OpenAI compatible message array
    const openAIMessages = newMessages.map(msg => ({
      role: msg.type === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));
    // Stream assistant response
    const completionOpts = {
      model: OPENAI_MODEL,
      messages: openAIMessages,
      stream: true
    };
    // OpenAI 4.x streaming: async iterator over result chunks!
    let assistantMsg = '';
    try {
      const stream = await openai.chat.completions.create(
        { ...completionOpts, stream: true }
      );
      // For OpenAI SDK 4.x, `stream` is an async iterable, not an HTTP stream.
      for await (const delta of stream) {
        // OpenAI result delta is an object with .choices[].delta.content
        const deltaContent = delta.choices?.[0]?.delta?.content ?? '';
        if (deltaContent) {
          assistantMsg += deltaContent;
          socket.emit('messageStreamChunk', {
            conversationId,
            chunk: deltaContent
          });
        }
      }
      // After stream done, push assistant message to DB if any content
      if (assistantMsg) {
        const assistantEntry = {
          type: 'assistant',
          content: assistantMsg,
          createdAt: new Date()
        };
        await conversationsCol.updateOne(
          { _id: conversation._id },
          { $push: { messages: assistantEntry }, $set: { updatedAt: new Date() } }
        );
      }
      socket.emit('messageStreamEnd', { conversationId });
    } catch (streamErr) {
      // eslint-disable-next-line no-console
      console.error('Error during streaming OpenAI completion:', streamErr);
      socket.emit('errorMessage', {
        error: 'Could not connect to OpenAI or stream response. Please try again. ' +
          (streamErr?.message ? `Upstream error: ${streamErr.message}` : '')
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Socket message handler error:', err);
    socket.emit('errorMessage', { error: 'Internal server error.' });
  }
}
// Note: Socket.IO server is configured to use the correct port and CORS (see src/index.js)
// Event names must match between frontend and backend (see app.jsx and here).
// See documentation for configuration of environment variables for CORS and ports.



