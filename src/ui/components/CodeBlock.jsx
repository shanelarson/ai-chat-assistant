import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import js from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import ts from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import { coy as prismStyle } from 'react-syntax-highlighter/dist/esm/styles/prism';
// Register Prism languages only as needed for bundle size (do NOT use HLJS imports; Prism supports JSX/TS)
SyntaxHighlighter.registerLanguage('javascript', js);
SyntaxHighlighter.registerLanguage('js', js);
SyntaxHighlighter.registerLanguage('typescript', ts);
SyntaxHighlighter.registerLanguage('ts', ts);
SyntaxHighlighter.registerLanguage('jsx', jsx);

// Utility to clean up language string
function getLanguage(className) {
  if (!className) return '';
  const match = className.match(/language-([\w-]+)/i);
  return match ? match[1].toLowerCase() : '';
}

const SUPPORTED_LANGS = ['jsx', 'javascript', 'js', 'typescript', 'ts'];

export default function CodeBlock({ value, language: languageProp, className }) {
  const language = languageProp || getLanguage(className) || '';
  const code = typeof value === 'string' ? value : String(value ?? '');
  const isLong = code.length > 600 || code.split('\n').length > 15;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);

  // Use syntax highlighting only on supported languages
  const highlightLang = SUPPORTED_LANGS.includes(language)
    ? (language === 'js' ? 'javascript'
      : language === 'ts' ? 'typescript'
      : language)
    : '';

  const handleCopy = () => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1100);
    });
  };

  try {
    return (
      <div
        style={{
          position: 'relative',
          margin: '1em 0',
          background: '#f6f8fa',
          borderRadius: 8,
          border: '1px solid #e2e7e9',
          boxShadow: '0 2px 8px rgba(24,36,76,0.07)',
          fontSize: 14,
          overflow: 'hidden',
          transition: 'box-shadow 0.18s',
        }}
      >
        {/* Top-right controls */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 6,
            right: 8,
            zIndex: 2,
            gap: 6,
          }}
        >
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              style={{
                border: 'none',
                background: 'rgba(38,54,180,0.045)',
                color: '#335',
                borderRadius: 5,
                fontSize: 13,
                padding: '2px 0.66em',
                cursor: 'pointer',
                fontWeight: 500,
              }}
              tabIndex={0}
              aria-label={expanded ? 'Collapse code' : 'Expand code'}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            style={{
              border: 'none',
              background: copied ? '#e4f2fa' : 'rgba(62,116,210,0.06)',
              color: copied ? '#1b6bb2' : '#245faa',
              borderRadius: 5,
              fontSize: 13,
              padding: '2px 0.75em',
              cursor: 'pointer',
              fontWeight: 500,
              outline: 'none',
              position: 'relative'
            }}
            tabIndex={0}
            aria-label="Copy code to clipboard"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div
          style={{
            maxHeight: isLong && !expanded ? 240 : undefined,
            overflow: isLong && !expanded ? 'hidden auto' : 'auto',
            paddingTop: 24, // accommodate control buttons
          }}
        >
          <SyntaxHighlighter
            language={highlightLang || undefined}
            style={prismStyle}
            customStyle={{
              margin: 0,
              background: 'transparent',
              fontSize: 14,
              borderRadius: 0,
              padding: '0.6em 1em',
              fontFamily: 'Consolas, Fira Mono, monospace',
              lineHeight: 1.7,
            }}
            showLineNumbers={false}
            PreTag="div"
            ref={codeRef}
          >
            {code}
          </SyntaxHighlighter>
          {/* Gradient fade if collapsed and long */}
          {isLong && !expanded && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 44,
                background: 'linear-gradient(180deg, rgba(246,248,250,0) 10%, #f6f8fa 90%)',
                pointerEvents: 'none',
              }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    );
  } catch (e) {
    // Fallback: render plain
    return (
      <pre
        style={{
          margin: '1em 0',
          fontSize: 15,
          fontFamily: 'Consolas, Fira Mono, monospace',
          background: '#f7f8fc',
          color: '#555c93',
          padding: '1em 1em',
          borderRadius: 8,
          border: '1px solid #f2f5f9',
          maxWidth: '100%',
          overflowX: 'auto'
        }}
      >{code}</pre>
    );
  }
}
CodeBlock.propTypes = {
  value: PropTypes.string.isRequired,
  language: PropTypes.string,
  className: PropTypes.string,
};



