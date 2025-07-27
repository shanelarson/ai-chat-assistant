import React from 'react';

export default function Navbar({ onLogin, onSignup, isLoggedIn, onLogout }) {
  return (
    <nav
      style={{
        background: '#102539',
        color: '#fff',
        padding: '0.5rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '56px',
        borderBottom: '1px solid #18324c'
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '1.2rem', letterSpacing: '1.5px', display: 'flex', alignItems: 'center' }}>
        {/* Reserved for Logo placement */}
        <span style={{ marginRight: '0.65em' }}>🤖</span>
        AI Chat Assistant
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {!isLoggedIn ? (
          <>
            <button
              onClick={onLogin}
              style={{
                background: '#3265dd',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '0.4em 1em',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Login
            </button>
            <button
              onClick={onSignup}
              style={{
                background: 'transparent',
                color: '#3265dd',
                border: '1px solid #3265dd',
                borderRadius: '4px',
                padding: '0.4em 1em',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Signup
            </button>
          </>
        ) : (
          <button
            onClick={onLogout}
            style={{
              background: '#e74c3c',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '0.4em 1em',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        )}
      </div>
    </nav>
  );
}