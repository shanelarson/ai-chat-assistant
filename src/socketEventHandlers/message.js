import { connectToMongo } from '../functions/mongo.js';
import { ObjectId } from 'mongodb';
import OpenAI from 'openai';

// Helper to get OpenAI config
function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1';
  return new OpenAI({ apiKey, baseURL });
}
// Default to gpt-4.1, which supports vision (images)
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';

// Supported image types for validation
const SUPPORTED_IMAGE_TYPES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'
];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB per image
const MAX_IMAGES = 4;

export default async function handleMessage(socket, payload) {
  try {
    const { conversationId, message, images } = payload || {};
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
    // Validate images input if present
    let validatedImages = [];
    // List of supported OpenAI multimodal models (update as new versions become available!)
    const MULTIMODAL_MODELS = [
      'gpt-4-vision-preview',  // included for strict completeness, but deprecated and should discourage
      'gpt-4.1',               // main production model for images as of June 2024
    ];
    // If a model is set that does NOT support images, and images are attached, error out
    const modelSupportsImages =
      MULTIMODAL_MODELS.includes(String(OPENAI_MODEL)) ||
      (String(OPENAI_MODEL).startsWith('gpt-4-vision') || String(OPENAI_MODEL).startsWith('gpt-4.1'));

    if (Array.isArray(images) && images.length > 0) {
      if (!modelSupportsImages) {
        socket.emit('errorMessage', {
          error:
            `Image attachment is not supported with the selected OpenAI model (${OPENAI_MODEL}). ` +
            `Set OPENAI_MODEL to "gpt-4.1" or another image-capable model.`
        });
        // eslint-disable-next-line no-console
        console.log(`[IMG VALIDATION] User ${user._id}: tried to send images but model ${OPENAI_MODEL} does not support vision.`);
        return;
      }
      if (images.length > MAX_IMAGES) {
        socket.emit('errorMessage', {
          error: `You can attach up to ${MAX_IMAGES} images per message.`
        });
        // Log this error for security/troubleshooting
        // eslint-disable-next-line no-console
        console.log(`[IMG VALIDATION] User ${user._id}: exceeded max image count: ${images.length}`);
        return;
      }
      // Validate each image object
      for (let i = 0; i < images.length; ++i) {
        const img = images[i];
        // Expected shape: { data: base64 string (with or without data:xxx prefix), type, name, size (optional) }
        if (
          !img ||
          typeof img.data !== 'string' ||
          !img.type ||
          !SUPPORTED_IMAGE_TYPES.includes(img.type) ||
          !/^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(img.data)
        ) {
          socket.emit('errorMessage', {
            error: `Image #${i + 1} is not a valid supported image type (PNG, JPEG, GIF, WebP).`
          });
          // eslint-disable-next-line no-console
          console.log(`[IMG VALIDATION] User ${user._id}: rejected image type/format for image #${i + 1}`);
          return;
        }
        // Estimate true size in bytes: base64 uses ~4/3 overhead (ignore headers)
        let base64Str = img.data;
        const prefixLen = base64Str.indexOf('base64,');
        if (prefixLen !== -1) base64Str = base64Str.slice(prefixLen + 'base64,'.length);
        // Roughly: (len * 3/4) bytes
        const approxSize = Math.floor(base64Str.length * 3 / 4);
        if (approxSize > MAX_IMAGE_BYTES) {
          socket.emit('errorMessage', {
            error: `Image #${i + 1} is too large (max 20MB per image).`
          });
          // eslint-disable-next-line no-console
          console.log(`[IMG VALIDATION] User ${user._id}: image too large for image #${i + 1}`);
          return;
        }
        validatedImages.push({
          url: img.data, // should be full data URL (already data:image/xxx;base64,...)
          type: img.type,
          name: img.name || `image${i + 1}`,
        });
      }
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

    // Prepare previous messages (all but new user message)
    const prevMessages = Array.isArray(conversation.messages)
      ? conversation.messages
      : [];
    // Build the user message: Always an object. 
    let userMsgForDb;
    let openAIMsgContent;
    if (validatedImages.length > 0) {
      // OpenAI expects an array of content blocks for multimodal
      openAIMsgContent = [
        ...validatedImages.map(img => ({
          type: 'image_url',
          image_url: { url: img.url }
        })),
        { type: 'text', text: message }
      ];
      userMsgForDb = {
        type: 'user',
        content: [
          ...validatedImages.map(img => ({
            type: 'image_url',
            image_url: { url: img.url }
          })),
          { type: 'text', text: message }
        ],
        createdAt: new Date()
      };
    } else {
      openAIMsgContent = message;
      // Always store user messages as objects, even text-only!
      userMsgForDb = {
        type: 'user',
        content: message,
        createdAt: new Date()
      };
    }
    // Always store user message as an object record in the DB
    await conversationsCol.updateOne(
      { _id: conversation._id },
      {
        $push: {
          messages: userMsgForDb
        },
        $set: { updatedAt: new Date() }
      }
    );
    // Set up request to OpenAI API (stream enabled)
    const openai = getOpenAIClient();
    // Assemble OpenAI messages history, but convert only the *latest* user message into multimodal syntax
    // All previous messages are plain text or array as received.
    const openAIMessages =
      prevMessages.map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))
      .concat([{
        role: 'user',
        content: openAIMsgContent
      }]);
    const completionOpts = {
      model: OPENAI_MODEL,
      messages: openAIMessages,
      stream: true
    };
    let assistantMsg = '';
    try {
      const stream = await openai.chat.completions.create(
        { ...completionOpts, stream: true }
      );
      for await (const delta of stream) {
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
        // Always store assistant messages as objects (never as raw string)
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
      // Detect and handle model deprecation/vision error more user-friendly
      let upstreamMsg =
        streamErr && typeof streamErr.message === 'string'
          ? streamErr.message
          : '';
      if (
        /gpt-4-vision-preview(.+)deprecated/i.test(upstreamMsg) ||
        /model .* deprecated/i.test(upstreamMsg)
      ) {
        socket.emit('errorMessage', {
          error: 'Image support is temporarily unavailable due to a provider update (vision model deprecated). ' +
            'Please switch to "gpt-4.1" or another supported model in your settings. ' +
            (upstreamMsg ? `Error: ${upstreamMsg}` : '')
        });
      } else if (/This model .* does not support image|Operation is not supported/i.test(upstreamMsg)) {
        socket.emit('errorMessage', {
          error: 'The currently selected OpenAI model does not support image input. ' +
            'Please use "gpt-4.1" or another supported multimodal model.'
        });
      } else {
        socket.emit('errorMessage', {
          error: 'Could not connect to OpenAI or stream response. Please try again. ' +
            (streamErr?.message ? `Upstream error: ${streamErr.message}` : '')
        });
      }
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

