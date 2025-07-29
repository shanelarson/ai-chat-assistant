import React, { useState, useRef } from 'react';
import ImageUploadInput from './ImageUploadInput.jsx';

/**
 * ChatInput
 * Props:
 * - value: string (current textarea value)
 * - onChange: function(event)
 * - onImagesChange: function(imagesArray)
 * - onSend: function() - called when send button is pressed
 * - loading: boolean (show loading/spinner state)
 * - disabled: boolean (completely disables input)
 * - placeholder: string
 * - error: string/null (display error below input)
 */
export default function ChatInput({
  value,
  onChange,
  images,
  onImagesChange,
  loading,
  disabled,
  placeholder,
  error,
  resetKey = 0
}) {
  const internalInputRef = useRef();

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (typeof onSend === 'function' && !loading && !disabled && value.trim()) {
        onSend();
      }
    }
  }

  function handleSendWrapper(e) {
    e.preventDefault();
    if (!loading && !disabled && value && value.trim()) {
      if (typeof onSend === 'function') {
        onSend();
      }
    }
  }

  // If parent resets images/input after a successful send, use resetKey to force file input clear
  React.useEffect(() => {
    if (internalInputRef.current) {
      internalInputRef.current.value = '';
    }
  }, [resetKey]);

  return (
    <form
      style={{
        borderTop: '1px solid #e3e6ea',
        padding: '1em 1.2em 1em 1.3em',
        background: '#fcfcfe'
      }}
      onSubmit={handleSendWrapper}
      autoComplete="off"
    >
      <ImageUploadInput
        images={images}
        onChange={onImagesChange}
        loading={loading || disabled}
        error={error}
        inputRefForward={internalInputRef}
        inputResetSignal={resetKey}
      />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <textarea
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          disabled={loading || disabled}
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