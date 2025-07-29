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
  error
}) {
  const fileInputResetRef = useRef(0);
  const internalInputRef = useRef();
  const [localResetKey, setLocalResetKey] = useState(0);

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (typeof onSend === 'function' && !loading && !disabled && value.trim()) {
        onSend();
        // After a successful send, reset the file input (see below)
        setLocalResetKey(k => k + 1);
      }
    }
  }

  // Floating "Send" function
  function handleSendWrapper(e) {
    e.preventDefault();
    if (!loading && !disabled && value && value.trim()) {
      if (typeof onSend === 'function') {
        onSend();
        setLocalResetKey(k => k + 1);
      }
    }
  }

  // Reset file input in ImageUploadInput when localResetKey changes
  function handleFileInputRef(fileInput) {
    // No-op for compability, but you could expose ref here
    internalInputRef.current = fileInput;
    if (fileInput && fileInput.value) {
      fileInput.value = '';
    }
  }

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
        resetKey={localResetKey}
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