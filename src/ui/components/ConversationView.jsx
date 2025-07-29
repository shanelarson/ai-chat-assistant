import React, { useRef, useEffect, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import 'github-markdown-css/github-markdown-light.css';
import CodeBlock, { SUPPORTED_LANGS, getLanguage } from './CodeBlock';
import ImageUploadInput from './ImageUploadInput.jsx';

/**
 * ConversationView
 * Props:
 * - conversation: { messages: [{ type: 'user'|'assistant', content, ... }], ... } (or null)
 * - loading: boolean (if loading history/messages/new response)
 * - streaming: boolean (if AI response is currently streaming in)
 * - inputValue: string (textarea text)
 * - onInputChange: function(event)
 * - onSend: function (called when send pressed) -- should prevent default/send message
 * - disabled: boolean (if input should be disabled)
 * - placeholder: string (optional)
 * - error: string/null (optional error to show)
 */
/**
 * Unified ConversationView for chat UI, with image upload.
 * IMAGE STATE is managed locally in this component (full control).
 */
// Expose the file input ref reset to parent for proper clearing after send
export default function ConversationView({
  conversation,
  loading,
  streaming,
  inputValue,
  onInputChange,
  onSend,
  disabled,
  placeholder,
  error,
  // Added for file input ref reset
  onFileInputRef
}) {
  const messagesEndRef = useRef(null);
  // --- Images state for send box ---
  const [images, setImages] = useState([]);
  const [imgError, setImgError] = useState('');
  // Ref to access the file input in ImageUploadInput for reset requests
  const imageInputRef = useRef();

  useEffect(() => {
    if (onFileInputRef) {
      // Provide to parent so it can call .current.reset() after send
      onFileInputRef(imageInputRef);
    }
  }, [onFileInputRef]);

  useEffect(() => {
    if (messagesEndRef.current) {
      // Scroll to bottom on new messages/stream
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [conversation, streaming, inputValue]);
  // Handler for image attachment change (reset imgError on change)
  function handleImageChange(newImages) {
    setImages(newImages);
    setImgError('');
  }
  // Omit separate image and text message logic: unified into one user message per send
  const hasPendingImages = Array.isArray(images) && images.some(img => (!img.dataUrl && !img.error) || img.error);
  const validImageCount = images.filter(img => img.dataUrl && !img.error).length;
  let messageInputError = error || imgError;
  let messages = conversation?.messages || [];
  function getMsgTimestamp(msg) {
    if (msg.createdAt) return new Date(msg.createdAt).getTime();
    if (msg._id && typeof msg._id === 'string' && msg._id.length === 24) {
      return parseInt(msg._id.substring(0, 8), 16) * 1000;
    }
    return Date.now();
  }
  const sortedMessages = useMemo(() => {
    if (!Array.isArray(messages) || messages.length === 0) return [];
    const arr = [...messages];
    arr.sort((a, b) => {
      const atime = getMsgTimestamp(a);
      const btime = getMsgTimestamp(b);
      if (atime !== btime) return atime - btime;
      if (a.type === 'user' && b.type === 'assistant') return -1;
      if (a.type === 'assistant' && b.type === 'user') return 1;
      return 0;
    });
    return arr;
  }, [messages && messages.length, JSON.stringify(messages)]);
  const showPendingImagePreview = (images.length > 0 && images.some(img => img.dataUrl && !img.error) && !loading && !streaming);
  return (
    <section style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      background: '#fff'
    }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.5em 1.3em 1em',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0
      }}>
        {(!conversation && (!messages || messages.length === 0)) ? (
          <div style={{
            textAlign: 'center',
            color: '#b7bfcf',
            fontSize: 22,
            fontWeight: 500,
            margin: 0,
            alignSelf: 'center'
          }}>
            Start a New Conversation
          </div>
        ) : ((messages && messages.length === 0) ? (
          <div style={{
            textAlign: 'center',
            color: '#abb4c7',
            marginTop: 48,
            fontSize: 17,
            fontWeight: 500
          }}>
            No messages in this conversation yet.
          </div>
        ) : (
          <>
            {sortedMessages.map((msg, idx) => {
              const type = msg.type || (msg.role === 'assistant' ? 'assistant' : 'user');
              const content = msg.content;
              return (
                <MessageBubble
                  key={msg.createdAt ? `${type}-${msg.createdAt}-${idx}` : idx}
                  type={type}
                  content={content}
                  index={idx}
                  label={type === 'user' ? 'User' : 'Assistant'}
                  pending={!!msg.pending}
                />
              );
            })}
          </>
        ))}
        {((conversation && streaming) || (!conversation && streaming)) && (
          <MessageBubble
            type="assistant"
            content={<span style={{ color: '#aaa' }}>Typing...</span>}
            index={messages.length}
            streaming
            label="Assistant"
          />
        )}
        <div ref={messagesEndRef} />
      </div>
      <div style={{ borderTop: '1px solid #e3e6ea', background: '#fcfcfe', padding: '1em 1.2em 1em 1.3em' }}>
        <ImageUploadInput
          images={images}
          onChange={handleImageChange}
          loading={loading || streaming || disabled}
          error={imgError}
          inputRefForward={imageInputRef}
        />
        <MessageInput
          value={inputValue}
          onChange={onInputChange}
          onSend={() => {
            if (onSend) onSend(inputValue, images.filter(img => img.dataUrl && !img.error));
          }}
          loading={loading || streaming}
          disabled={false}
          error={messageInputError}
          placeholder={placeholder}
        />
      </div>
    </section>
  );
}


// Render a message bubble in chat UI: `type` is 'user' or 'assistant'
/**
 * MessageBubble component: renders a chat message.
 * 
 * - For assistant messages that are still streaming (incomplete), do NOT parse markdown or highlight code.
 *   Instead, display content as preformatted plain text (preserving all language tags, code fences, etc).
 *   This ensures the code highlighter and markdown parser receive fully-formed code blocks when the message is finalized.
 * - For finalized messages (not streaming), use markdown parsing and syntax highlighting for code blocks.
 */

function MessageBubble({ type, content, streaming, label, pending }) {
  const isUser = type === 'user';
  const bubbleStyle = {
    maxWidth: '85%',
    padding: '0.7em 1.1em',
    borderRadius: 14,
    background: isUser ? '#e4eaff' : '#f3f6fa',
    color: '#202d42',
    fontSize: 16,
    boxShadow: streaming ? '0 1px 8px rgba(88,125,239,0.13)' : undefined,
    fontStyle: typeof content === 'string' && String(content).match(/^typing/i) ? 'italic' : undefined,
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    borderTopRightRadius: isUser ? 5 : 14,
    borderTopLeftRadius: isUser ? 14 : 5,
    whiteSpace: 'pre-line'
  };

  // Defensive patch: pending user messages with images (for brand new conversations) might pass a single object instead of array.
  // If content is a plain object with {type: ...}, wrap it in array.
  let normalizedContent = content;
  if (
    content &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    // Not legacy {images:..., text:...}
    !(content.images && Array.isArray(content.images)) &&
    (
      (content.type === 'image_url' && content.image_url && typeof content.image_url === 'object') ||
      (content.type === 'text' && typeof content.text === 'string')
    )
  ) {
    normalizedContent = [content];
  }
  // 1. If Typing indicator, just show as before, not markdown
  if (typeof content !== 'string' && React.isValidElement(content)) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          marginBottom: 12,
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 2,
          }}
        >
          {!isUser && (
            <span style={{
              fontSize: 12,
              color: '#d0b900',
              fontWeight: 600,
              marginRight: 8,
              background: 'rgba(220,220,255,0.17)',
              padding: '0 6px',
              borderRadius: 5,
              letterSpacing: 0.2
            }}>
              {label || 'Assistant'}
            </span>
          )}
          {isUser && (
            <span style={{
              fontSize: 12,
              color: '#176cd9',
              fontWeight: 600,
              marginLeft: 8,
              background: 'rgba(220,230,253,0.16)',
              padding: '0 6px',
              borderRadius: 5,
              letterSpacing: 0.2
            }}>
              {label || 'User'}
            </span>
          )}
        </div>
        <div style={bubbleStyle}>
          {React.isValidElement(content) ? content : null}
        </div>
      </div>
    );
  }
  // 2. If assistant message and streaming (i.e. incomplete, may contain partial markdown/code blocks),
  //    ALWAYS render as preformatted plain text, NOT markdown, to preserve unfinished code blocks/language tags etc.
  //    This avoids broken parsing, broken code fences, and allows post-stream code highlighting to work!
  if (!isUser && streaming) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          marginBottom: 12,
          flexDirection: 'column',
          alignItems: 'flex-start'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 2,
          }}
        >
          <span style={{
            fontSize: 12,
            color: '#d0b900',
            fontWeight: 600,
            marginRight: 8,
            background: 'rgba(220,220,255,0.17)',
            padding: '0 6px',
            borderRadius: 5,
            letterSpacing: 0.2
          }}>
            {label || 'Assistant'}
          </span>
        </div>
        <div style={bubbleStyle}>
          <pre
            style={{
              margin: 0,
              fontFamily: "inherit",
              fontSize: 15,
              background: 'transparent',
              border: 'none',
              color: '#555',
              whiteSpace: "pre-wrap",
              wordBreak: 'break-word',
              padding: 0
            }}
            tabIndex={0}
            aria-label="Assistant is typing"
          >
            {/* render as string, coerce null/undefined to blank */}
            {typeof content === 'string' ? content : String(content ?? '')}
          </pre>
        </div>
      </div>
    );
  }
  // 3. All other cases (finalized messages): render with markdown and code highlighting AND images if any
  let renderedContent;
  // Defensive multimodal rendering for OpenAI-style array content: [{type:..., ...}]
  if (Array.isArray(normalizedContent)) {
    // Defensive guard: never allow object as React child! Only render recognized types and warn on unknowns.
    renderedContent = (
      <div>
        {normalizedContent.map((part, idx) => {
          // --- Unified image rendering ---
          // Handles:
          // - { type: 'image_url', image_url: { url: ..., detail, ... } }
          // - { url: ..., description, ... } (legacy/alt)
          // - plain string: not supported for image here
          if (part && typeof part === 'object' && !React.isValidElement(part)) {
            // OpenAI multimodal/chat format: {type: 'image_url', image_url: { url, detail, ... } }
            if (part.type === 'image_url' && part.image_url && part.image_url.url) {
              return (
                <div key={`image-${idx}`} style={{ marginBottom: 8 }}>
                  <img
                    src={part.image_url.url}
                    alt={part.image_url.detail || part.image_url.description || `Attachment ${idx + 1}`}
                    style={{
                      maxWidth: 120,
                      maxHeight: 78,
                      borderRadius: 7,
                      border: '1.4px solid #dde3f3',
                      marginBottom: 2,
                      background: part.image_url.url.startsWith('data:image/') ? '#f7f9ff' : '#fafbfe',
                      objectFit: 'contain'
                    }}
                  />
                  {(part.image_url.detail || part.image_url.description) && (
                    <div style={{
                      maxWidth: 110,
                      color: '#818193',
                      fontSize: 10,
                      textAlign: 'center'
                    }}>{part.image_url.detail || part.image_url.description}</div>
                  )}
                </div>
              );
            }
            // Legacy/alternative: { url: ... } or { url: ..., description: ... }
            if (part.url && typeof part.url === 'string') {
              return (
                <div key={`image-legacy-${idx}`} style={{ marginBottom: 8 }}>
                  <img
                    src={part.url}
                    alt={part.description || part.detail || `Attachment ${idx + 1}`}
                    style={{
                      maxWidth: 120,
                      maxHeight: 78,
                      borderRadius: 7,
                      border: '1.4px solid #dde3f3',
                      marginBottom: 2,
                      background: part.url.startsWith('data:image/') ? '#f7f9ff' : '#fafbfe',
                      objectFit: 'contain'
                    }}
                  />
                  {(part.description || part.detail) && (
                    <div style={{
                      maxWidth: 110,
                      color: '#818193',
                      fontSize: 10,
                      textAlign: 'center'
                    }}>{part.description || part.detail}</div>
                  )}
                </div>
              );
            }
            // Text format: { type: 'text', text: ... }
            if (part.type === 'text' && typeof part.text === 'string') {
              return (
                <ChatMarkdownContent
                  key={`text-${idx}`}
                  isUser={isUser}
                  type={type}
                  text={part.text}
                />
              );
            }
            // Unknown object type: render fallback warning
            // Defensive: Explicitly render a placeholder for invalid/unknown objects
            return (
              <span key={`invalid-content-${idx}`} style={{ color: 'red', fontSize: 14, marginBottom: 8 }}>
                Invalid content
              </span>
            );
          } else if (typeof part === 'string' || typeof part === 'number') {
            // Render as string, not as object
            return <span key={`text-string-${idx}`}>{String(part)}</span>;
          } else if (React.isValidElement(part)) {
            return <React.Fragment key={`element-${idx}`}>{part}</React.Fragment>;
          } else {
            // Any other type (boolean, null, undefined) -> skip or warn
            return (
              <span key={`invalid-content-${idx}`} style={{ color: 'red', fontSize: 14, marginBottom: 8 }}>
                Invalid content
              </span>
            );
          }
        })}
      </div>
    );
  } else if (normalizedContent && typeof normalizedContent === 'object' && normalizedContent.images && Array.isArray(normalizedContent.images)) {
    const multimodalImages = normalizedContent.images.map(img => ({
      url: img.url,
      detail: img.detail,
      description: img.description,
    }));
    const multimodalText = normalizedContent.text || '';
    renderedContent = (
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {multimodalImages.map((img, idx) => (
            <div key={idx} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
              {img.url && typeof img.url === "string"
                ? (
                  <img
                    src={img.url}
                    alt={img.description || `Attachment ${idx + 1}`}
                    style={{
                      maxWidth: 120,
                      maxHeight: 78,
                      borderRadius: 7,
                      border: '1.4px solid #dde3f3',
                      marginBottom: 2,
                      background: img.url.startsWith('data:image/') ? '#f7f9ff' : '#fafbfe',
                      objectFit: 'contain'
                    }}
                  />
                )
                : (
                  <span style={{ color: '#c95f24', fontSize: 22 }}>Broken image</span>
                )
              }
              {img.description && (
                <div style={{
                  maxWidth: 110, color: '#818193', fontSize: 10, textAlign: 'center'
                }}>{img.description}</div>
              )}
            </div>
          ))}
        </div>
        <ChatMarkdownContent isUser={isUser} type={type} text={multimodalText} />
      </div>
    );
  } else {
    // Defensive: Only pass string values to markdown. If not string, force to String().
    renderedContent = (
      <ChatMarkdownContent isUser={isUser} type={type} text={typeof normalizedContent === 'string' ? normalizedContent : String(normalizedContent ?? '')} />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 2,
        }}
      >
        {!isUser && (
          <span style={{
            fontSize: 12,
            color: '#d0b900',
            fontWeight: 600,
            marginRight: 8,
            background: 'rgba(220,220,255,0.17)',
            padding: '0 6px',
            borderRadius: 5,
            letterSpacing: 0.2
          }}>
            {label || 'Assistant'}
          </span>
        )}
        {isUser && (
          <span style={{
            fontSize: 12,
            color: '#176cd9',
            fontWeight: 600,
            marginLeft: 8,
            background: 'rgba(220,230,253,0.16)',
            padding: '0 6px',
            borderRadius: 5,
            letterSpacing: 0.2
          }}>
            {label || 'User'}
            {pending && (
              <span style={{
                fontSize: 10,
                color: '#b79827',
                marginLeft: 5,
                fontStyle: 'italic',
                opacity: 0.7,
              }}>(pending...)</span>
            )}
          </span>
        )}
      </div>
      <div style={bubbleStyle}>
        {renderedContent}
      </div>
    </div>
  );
}





























// Markdown+code highlighting for chat message bodies: extracted for use in multimodal
function ChatMarkdownContent({ isUser, type, text }) {
  let renderedContent;
  try {
    const markdownClasses = [
      "markdown-body",
      isUser
        ? "userBackgroundColor"
        : type === "assistant"
          ? "assistantBackgroundColor"
          : ""
    ].filter(Boolean).join(" ");
    renderedContent = (
      <div
        className={markdownClasses}
        style={{
          userSelect: "text",
          margin: 0,
          wordBreak: "break-word"
        }}
        tabIndex={0}
      >
        <ReactMarkdown
          // Defensive: Always coerce text to string
          children={typeof text === 'string' ? text : String(text ?? '')}
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          linkTarget="_blank"
          components={{
            a: ({ node, ...props }) => (
              <a {...props} target="_blank" rel="noopener noreferrer">{props.children}</a>
            ),
            code({ node, inline, className, children, ...props }) {
              let lang = getLanguage(className);
              if (!inline && (!lang || lang.trim() === "")) {
                lang = "javascript";
              }
              const isSupported = SUPPORTED_LANGS.includes(lang);
              // Defensive: codeString must be a string, and children must NOT be object
              let codeString;
              if (Array.isArray(children)) {
                // Remove all non-string-like entries in children defensively
                codeString = children.map(c => (typeof c === "string" || typeof c === "number") ? String(c) : '').join('');
              } else {
                codeString = typeof children === "string" || typeof children === "number" ? String(children) : '';
              }
              if (!inline && isSupported) {
                return <CodeBlock value={codeString} language={lang} className={className} />;
              }
              return (
                <code className={className} style={{
                  background: "#f6f8fa",
                  borderRadius: 4,
                  padding: inline ? "2px 4px" : "0.6em 1em",
                  fontSize: 14,
                  fontFamily: "Consolas, Fira Mono, monospace",
                  display: inline ? "inline" : "block",
                  wordBreak: "break-word",
                  overflowX: "auto"
                }} {...props}>
                  {codeString}
                </code>
              );
            }
          }}
        />
      </div>
    );
  } catch (err) {
    renderedContent = (
      <pre style={{
        margin: 0,
        fontSize: 15,
        fontFamily: "inherit",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color: "#b80024"
      }}>
        {typeof text === 'string' ? text : String(text ?? '')}
      </pre>
    );
  }
  return renderedContent;
}

// NOTE: This component and all content rendering must defensively guard against object-as-child.
// All mapping over normalizedContent (and markdown code blocks) must never create object children.
// Only recognized strings, numbers, or elements are rendered; all others trigger a placeholder warning.
// Renders text input ONLY (for composition area, used below images)
function MessageInput({
  value,
  onChange,
  onSend,
  loading,
  disabled,
  error,
  placeholder
}) {
  const [localError, setLocalError] = useState('');

  // Combine error from parent (inline, img, etc) and local empty error
  const shownError = error || localError;

  // Keep error feedback in sync
  useEffect(() => {
    if (error) setLocalError('');
  }, [error]);

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (typeof onSend === 'function' && !loading) {
        if (!value || value.trim().length === 0) {
          setLocalError('Please enter a message or attach an image before sending.');
        } else {
          setLocalError('');
          onSend();
        }
      }
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!loading) {
      if (!value || value.trim().length === 0) {
        setLocalError('Please enter a message or attach an image before sending.');
      } else {
        setLocalError('');
        if (typeof onSend === 'function') onSend();
      }

    }
  }

  return (
    <form
      style={{ margin: 0, padding: 0 }}
      onSubmit={handleSubmit}
      autoComplete="off"
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column'
      }}>
        <textarea
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          // Only disable if explicitly disabled or loading, NOT if missing images
          disabled={!!loading || !!disabled}
          placeholder={placeholder || 'Type your message...'}
          rows={2}
          style={{
            resize: 'none',
            width: '100%',
            border: '1.2px solid #c7d1ea',
            borderRadius: 6,
            fontSize: 16,
            padding: '0.75em 0.8em',
            marginBottom: 8,
            background: '#f8fbff',
            color: '#18324c',
            outlineColor: '#436add',
            minHeight: 45
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {shownError && (
            <div style={{ color: '#e74c3c', fontSize: 14, fontWeight: 500 }}>
              {shownError}
            </div>
          )}
          <button
            type="submit"
            style={{
              background: '#3265dd',
              border: 'none',
              color: '#fff',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 16,
              padding: '0.48em 1.35em',
              marginLeft: 'auto',
              cursor: loading || disabled ? 'default' : 'pointer',
              opacity: loading || disabled ? 0.6 : 1
            }}
            disabled={!!loading || !!disabled}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </form>
  );
}



























