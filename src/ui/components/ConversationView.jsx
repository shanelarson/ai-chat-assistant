import React, { useRef, useEffect, useState } from 'react';
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
export default function ConversationView({
  conversation,
  loading,
  streaming,
  inputValue,
  onInputChange,
  onSend,
  disabled,
  placeholder,
  error
}) {
  // All hooks must be called on every render before any return.
  // For autoscroll to bottom on new message/stream
  const messagesEndRef = useRef(null);
  // --- Images state for send box ---
  const [images, setImages] = useState([]);
  const [imgError, setImgError] = useState('');
  // Synchronized: if inputValue changes after send, clear images
  useEffect(() => {
    if (!inputValue && images.length > 0) setImages([]);
    // eslint-disable-next-line
  }, [inputValue]);
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

  // Custom onSend with images
  async function handleSendWithImages() {
    // Frontend validation: all images must be valid, loaded, no error, < max
    if (loading || streaming || disabled) return;
    let firstError = null;
    if (Array.isArray(images) && images.length > 0) {
      if (images.length > 4) {
        setImgError('You can attach up to 4 images.');
        return;
      }
      for (let img of images) {
        if (img.error) {
          firstError = img.error;
          break;
        }
        if (!/^data:image\//.test(img.dataUrl || '')) {
          firstError = 'Attached file could not be read as an image.';
          break;
        }
        if (!img.file) {
          firstError = 'Unknown image error. Please remove and re-add.';
          break;
        }
      }
    }
    if (firstError) {
      setImgError(firstError);
      return;
    }
    setImgError('');
    // DEFER to onSend: pass images in custom event
    if (typeof onSend === 'function') {
      onSend(inputValue, Array.isArray(images) ? images : []);
    }
    // UI clears handled after success/error by parent
  }

  if (!conversation) {
    // Starting a new conversation
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#b7bfcf',
          fontSize: 22,
          fontWeight: 500
        }}>
          Start a New Conversation
        </div>
        <MessageInput
          value={inputValue}
          onChange={onInputChange}
          onSend={onSend}
          loading={loading || streaming}
          disabled={disabled}
          error={error}
          placeholder={placeholder}
        />
      </section>
    );
  }

  // Standard conversation view
  const messages = conversation.messages || [];

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
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: '#abb4c7',
            marginTop: 48,
            fontSize: 17,
            fontWeight: 500
          }}>
            No messages in this conversation yet.
          </div>
        )}
        {messages.map((msg, idx) => (
          <MessageBubble
            key={idx}
            type={msg.type}
            content={msg.content}
            index={idx}
            // Label messages clearly as 'User' or 'Assistant'
            label={msg.type === 'user' ? 'User' : 'Assistant'}
          />
        ))}
        {/* When AI is streaming in a reply, show feedback */}
        {streaming &&
          <MessageBubble
            type="assistant"
            content={<span style={{ color: '#aaa' }}>Typing...</span>}
            index={messages.length}
            streaming
            label="Assistant"
          />
        }
        <div ref={messagesEndRef} />
      </div>
      <div style={{ borderTop: '1px solid #e3e6ea', background: '#fcfcfe', padding: '1em 1.2em 1em 1.3em' }}>
        <ImageUploadInput
          images={images}
          onChange={handleImageChange}
          loading={loading || streaming || disabled}
          error={imgError}
        />
        <MessageInput
          value={inputValue}
          onChange={onInputChange}
          onSend={handleSendWithImages}
          loading={loading || streaming}
          disabled={disabled}
          error={error}
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
function MessageBubble({ type, content, streaming, label }) {
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
        <div style={bubbleStyle}>{content}</div>
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
  // If the content is an OpenAI multimodal array (images + text), handle!
  let multimodalImages = [];
  let multimodalText = '';
  if (Array.isArray(content)) {
    // OpenAI Vision format: array of { type: 'image_url' or 'text', ... }
    for (const part of content) {
      if (part.type === 'image_url' && part.image_url && part.image_url.url) {
        multimodalImages.push({
          url: part.image_url.url,
          detail: part.image_url.detail,
          description: (part.image_url.detail && typeof part.image_url.detail === 'string') ? part.image_url.detail : undefined,
        });
      } else if (part.type === 'text' && typeof part.text === 'string') {
        multimodalText += part.text;
      }
    }
  }

  if (multimodalImages.length > 0) {
    renderedContent = (
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {multimodalImages.map((img, idx) => (
            <div key={idx} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
              <img
                src={img.url}
                alt={img.description || `Attachment ${idx + 1}`}
                style={{
                  maxWidth: 120,
                  maxHeight: 78,
                  borderRadius: 7,
                  border: '1.4px solid #dde3f3',
                  marginBottom: 2,
                  background: '#f7f9ff',
                  objectFit: 'contain'
                }}
              />
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
    // Single string or legacy text message
    renderedContent = (
      <ChatMarkdownContent isUser={isUser} type={type} text={typeof content === 'string' ? content : String(content ?? '')} />
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
              if (!inline && isSupported) {
                const codeString = Array.isArray(children) ? children.join('') : String(children);
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
                  {children}
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
  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (typeof onSend === 'function' && !loading && value.trim()) onSend();
    }
  }
  return (
    <form
      style={{ margin: 0, padding: 0 }}
      onSubmit={e => {
        e.preventDefault();
        if (!loading && value && value.trim()) onSend();
      }}
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
          disabled={disabled || loading}
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
          {error && (
            <div style={{ color: '#e74c3c', fontSize: 14, fontWeight: 500 }}>
              {error}
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
              opacity: loading || !value.trim() ? 0.6 : 1
            }}
            disabled={loading || disabled || !value.trim()}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </form>
  );
}


