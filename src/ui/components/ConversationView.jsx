import React, { useRef, useEffect } from 'react';

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
  // For autoscroll to bottom on new message/stream
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      // Scroll to bottom on new messages/stream
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [conversation, streaming, inputValue]);

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
// Render a message bubble in chat UI: `type` is 'user' or 'assistant'
function MessageBubble({ type, content, streaming, label }) {
  const isUser = type === 'user';
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
      <div
        style={{
          maxWidth: '85%',
          padding: '0.7em 1.1em',
          borderRadius: 14,
          background: isUser ? '#e4eaff' : '#f3f6fa',
          color: '#202d42',
          fontSize: 16,
          boxShadow: streaming ? '0 1px 8px rgba(88,125,239,0.13)' : undefined,
          fontStyle: typeof content === 'string' && content.match(/^typing/i) ? 'italic' : undefined,
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          borderTopRightRadius: isUser ? 5 : 14,
          borderTopLeftRadius: isUser ? 14 : 5,
        }}
      >
        {isUser ? (
          <span style={{ color: '#1d41a7', fontWeight: 500 }}>{content}</span>
        ) : (
          <span style={{ color: streaming ? '#8ca0ce' : '#234' }}>{content}</span>
        )}
      </div>
    </div>
  );
}

// Renders text input (fixed bottom) for new message
function MessageInput({
  value,
  onChange,
  onSend,
  loading,
  disabled,
  error,
  placeholder
}) {
  // Allow send on Ctrl+Enter or Cmd+Enter, or button click
  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (typeof onSend === 'function' && !loading && value.trim()) onSend();
    }
  }
  return (
    <form
      style={{
        borderTop: '1px solid #e3e6ea',
        padding: '1em 1.2em 1em 1.3em',
        background: '#fcfcfe'
      }}
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
