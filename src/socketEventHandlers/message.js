import { connectToMongo } from '../functions/mongo.js';
import OpenAI from 'openai';

// Helper to get OpenAI config
function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1';
  return new OpenAI({ apiKey, baseURL });
}
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

// Message event handler for socket.io
// Expects: { conversationId, message }
// Emits: 'messageStreamChunk' { conversationId, chunk } as chunks stream in, and 'messageStreamEnd'
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

    // Find conversation and ensure it belongs to user
    const conversation = await conversationsCol.findOne({
      _id: typeof conversationId === 'string'
        ? conversationId.length === 24
          ? new db.bson.ObjectId(conversationId)
          : conversationId
        : conversationId,
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
        error: 'Please wait for the assistant to respond before sending another message.',
        rejectedMessage: message,
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

    // OpenAI streaming using response.data as a readable stream
    const response = await openai.createChatCompletion(completionOpts, { responseType: 'stream' });
    let assistantMsg = '';
    let messageId = null;

    response.data.on('data', async chunk => {
      // Accumulate the result; parse lines
      const lines = chunk
        .toString('utf8')
        .split('\n')
        .filter(Boolean);

      for (const line of lines) {
        if (line.trim().startsWith('data:')) {
          const data = line.replace(/^data:\s*/, '');
          if (data === '[DONE]') {
            // Store assistant message
            if (assistantMsg) {
              const assistantEntry = {
                type: 'assistant',
                content: assistantMsg,
                createdAt: new Date()
              };
              // Update conversation with assistant message
              await conversationsCol.updateOne(
                { _id: conversation._id },
                { $push: { messages: assistantEntry }, $set: { updatedAt: new Date() } }
              );
            }
            socket.emit('messageStreamEnd', { conversationId });
            return;
          }
          try {
            const delta = JSON.parse(data);
            const deltaContent =
              delta.choices?.[0]?.delta?.content ?? '';
            if (deltaContent) {
              assistantMsg += deltaContent;
              socket.emit('messageStreamChunk', {
                conversationId,
                chunk: deltaContent
              });
            }
          } catch (e) {
            // Invalid JSON (ignore)
          }
        }
      }
    });
    response.data.on('end', () => {
      socket.emit('messageStreamEnd', { conversationId });
    });
    response.data.on('error', err => {
      socket.emit('errorMessage', { error: 'Error streaming assistant response.' });
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Socket message handler error:', err);
    socket.emit('errorMessage', { error: 'Internal server error.' });
  }
}

