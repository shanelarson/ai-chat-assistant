import React, { useRef } from 'react';

// Optionally import PropTypes if you want runtime validation
// import PropTypes from 'prop-types';

/**
 * ImageUploadInput
 * 
 * Props:
 * - images: Array<{ file: File, dataUrl: string, error?: string }>
 * - onChange: function(newImagesArray)
 * - loading: boolean
 * - maxImages: number (default: 4)
 * 
 * Shows Upload button and drag-n-drop, previews, remove option, and validates images.
 */
export default function ImageUploadInput({
  images,
  onChange = () => {},
  loading,
  maxImages = 4,
  style = {},
  error = '',
  inputResetSignal = 0,
  resetKey // when changed, clear internal images state & file input
}) {
  const inputRef = useRef();

  // Allowed MIME types
  const ACCEPTED_TYPES = [
    'image/png',
    'image/jpeg',
    'image/jpg', // just in case
    'image/gif',
    'image/webp' // allow if OpenAI supports it
  ];
  const MAX_SIZE_MB = 20;
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

  // Handle file selection from input/button
  function handleFiles(files) {
    if (!files) return;
    let filesArr = Array.from(files);
    const errors = [];
    let currentImages = Array.isArray(images) ? images.slice() : [];

    if (currentImages.length + filesArr.length > maxImages) {
      errors.push(`You can attach up to ${maxImages} images per message.`);
      filesArr = filesArr.slice(0, maxImages - currentImages.length);
    }
    const newImages = [];
    filesArr.forEach(file => {
      // Validate type and size here, but async for base64 encoding below
      if (!ACCEPTED_TYPES.includes(file.type)) {
        newImages.push({
          file,
          dataUrl: '',
          error: 'Unsupported file type. Only PNG, JPEG, GIF, and WebP allowed.'
        });
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        newImages.push({
          file,
          dataUrl: '',
          error: `Image too large (max ${MAX_SIZE_MB}MB per image).`
        });
        return;
      }
      // Mark as pending (will fill dataUrl async)
      newImages.push({ file, dataUrl: '', error: null });
    });

    // Read files as DataURL (base64)
    newImages.forEach((img, idx) => {
      const { file, error } = img;
      if (error) return; // already errored, don't read
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        // Ensure the DataURL includes the full data:image/xxx;base64, prefix
        if (
          typeof dataUrl === "string" &&
          /^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(dataUrl)
        ) {
          img.dataUrl = dataUrl;
        } else {
          img.dataUrl = '';
          img.error = 'Could not convert image to valid PNG, JPEG, GIF, or WebP base64 format.';
        }
        safePropagateChange();
      };
      reader.onerror = () => {
        img.error = 'Could not read file.';
        img.dataUrl = '';
        safePropagateChange();
      };
      reader.readAsDataURL(file);
    });

    // Propagate images state up when fully loaded
    let lastVer = 0;
    function safePropagateChange() {
      // After last file finish (or error), update
      lastVer++;
      // Defer to ensure file readers have patched
      setTimeout(() => {
        // Only propagate when all read states are done
        if (
          newImages.filter(i => !i.dataUrl && !i.error).length === 0
        ) {
          onChange(
            (currentImages || []).concat(
              newImages.map(img => ({
                file: img.file,
                dataUrl: img.dataUrl || '',
                name: img.file.name,
                type: img.file.type,
                size: img.file.size,
                error: img.error
              }))
            )
          );
        }
      }, 70);
    }
    // For only error-case (no reads)
    if (newImages.filter(i => !i.dataUrl && !i.error).length === 0) {
      onChange(
        (currentImages || []).concat(
          newImages.map(img => ({
            file: img.file,
            dataUrl: img.dataUrl || '',
            name: img.file.name,
            type: img.file.type,
            size: img.file.size,
            error: img.error
          }))
        )
      );
    }
  }

  // Drag-and-drop logic
  function handleDrop(e) {
    e.preventDefault();
    if (loading) return;
    const dt = e.dataTransfer;
    if (dt && dt.files) {
      handleFiles(dt.files);
    }
  }

  function handleRemove(idx) {
    if (loading) return;
    if (!Array.isArray(images)) return;
    const newArr = images.slice();
    newArr.splice(idx, 1);
    onChange(newArr);
  }

  function openFilePicker() {
    if (loading) return;
    if (inputRef.current) inputRef.current.value = ''; // Reset to allow re-selecting same files
    inputRef.current && inputRef.current.click();
  }
  // Effect to reset input file element when parent requests (inputResetSignal or resetKey changes)
  React.useEffect(() => {
    if (inputRef.current) inputRef.current.value = '';
  }, [inputResetSignal, resetKey]);
  // UI
  return (
    <div style={{ ...style, marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          paddingBottom: 4,
          minHeight: 34,
          userSelect: 'none',
          pointerEvents: loading ? 'none' : undefined,
        }}
        onDragOver={e => {
          if (loading) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={handleDrop}
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={openFilePicker}
          disabled={loading}
          aria-label="Attach image"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: loading ? '#ddd' : '#f3f6fa',
            border: '1px dashed #b7c7e7',
            borderRadius: 5,
            color: '#245bb6',
            fontWeight: 500,
            fontSize: 15,
            padding: '5px 13px',
            cursor: loading ? 'not-allowed' : 'pointer',
            gap: 5,
            transition: '.15s border-color'
          }}
        >
          <span
            style={{ fontSize: 19, display: 'flex', alignItems: 'center' }}
            role="img"
            aria-hidden="true"
          >📷</span>
          Upload Image
        </button>
        <input
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          style={{ display: 'none' }}
          disabled={loading}
          ref={inputRef}
          onChange={e => {
            if (loading) return;
            handleFiles(e.target.files);
          }}
        />
        <span style={{
          color: '#7b859c', fontSize: 13
        }}>
          (Drag & drop or select up to {maxImages} image{maxImages > 1 ? 's' : ''})
        </span>
      </div>
      {Array.isArray(images) && images.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 4,
          marginBottom: 3,
          alignItems: 'flex-end'
        }}>
          {images.map((img, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
                width: 68,
                minHeight: 78
              }}
            >
              <div style={{
                border: '1.5px solid #d2d5e7',
                borderRadius: 7,
                padding: 3,
                width: 60,
                height: 60,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: img.error ? '#fff6e7' : '#fafbfe',
                marginBottom: 2,
                position: 'relative'
              }}>
                {/* Only display if base64 DataURL, otherwise show error icon */}
                {
                  img.dataUrl && !img.error && img.dataUrl.startsWith('data:image/')
                  ? (
                    <img
                      src={img.dataUrl}
                      alt={img.file?.name || 'Attachment'}
                      style={{
                        maxWidth: '100%',
                        maxHeight: 53,
                        objectFit: 'contain',
                        background: '#f9fbff',
                        borderRadius: 5
                      }}
                    />
                  )
                  : (
                    <span style={{ color: '#c95f24', fontSize: 21 }}>!</span>
                  )
                }
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Remove image"
                  onClick={() => handleRemove(idx)}
                  style={{
                    position: 'absolute',
                    top: -7.5,
                    right: -7.5,
                    background: '#f4312c',
                    color: '#fff',
                    borderRadius: '50%',
                    fontWeight: 600,
                    border: 'none',
                    fontSize: 13,
                    width: 19,
                    height: 19,
                    cursor: loading ? 'default' : 'pointer',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.10)',
                    lineHeight: 1
                  }}
                  disabled={loading}
                >×</button>
              </div>
              <div style={{
                maxWidth: 56,
                wordBreak: 'break-word',
                fontSize: 11,
                color: img.error ? '#c95f24' : '#767c8e',
                textAlign: 'center',
                minHeight: 13
              }}>
                {img.error ? img.error : img.file?.name}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div style={{ color: '#e74c3c', fontSize: 14, fontWeight: 500, marginTop: 2, marginBottom: 2 }}>
          {error}
        </div>
      )}
    </div>
  );
}
// Optional: PropTypes validation to help catch development misuse
/*
import PropTypes from 'prop-types';
ImageUploadInput.propTypes = {
  images: PropTypes.array,
  onChange: PropTypes.func,
  loading: PropTypes.bool,
  maxImages: PropTypes.number,
  style: PropTypes.object,
  error: PropTypes.string,
  inputResetSignal: PropTypes.number,
  resetKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
*/
