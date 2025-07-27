import React, { useState } from 'react';

export default function LoginModal({ isOpen, onClose, onLogin, loading, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Reset local state if closed
  React.useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
    }
  }, [isOpen]);

  function handleInputChange(e) {
    const { name, value } = e.target;
    if (name === 'email') setEmail(value);
    else if (name === 'password') setPassword(value);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) return;
    onLogin({ email, password });
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 0, top: 0, right: 0, bottom: 0,
        zIndex: 1000,
        background: 'rgba(16,37,57,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          background: '#fff',
          minWidth: 320,
          borderRadius: 8,
          boxShadow: '0 6px 32px rgba(34,52,79,0.15)',
          padding: '2rem 1.8rem',
          position: 'relative'
        }}
        tabIndex={-1}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            right: 12, top: 10,
            background: 'none',
            border: 'none',
            fontSize: 22,
            cursor: 'pointer',
            color: '#333'
          }}
          aria-label="Close Login Modal"
        >
          ×
        </button>
        <h2 style={{
          marginTop: 0,
          marginBottom: 16,
          fontSize: '1.3rem',
          fontWeight: 600,
          color: '#102539'
        }}>Login</h2>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="login-email" style={{
              fontSize: 15,
              fontWeight: 500,
              display: 'block',
              marginBottom: 6
            }}>
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={handleInputChange}
              style={{
                width: '100%',
                padding: '0.5em',
                border: '1px solid #bbb',
                borderRadius: 4,
                fontSize: 16
              }}
              disabled={loading}
              required
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="login-password" style={{
              fontSize: 15,
              fontWeight: 500,
              display: 'block',
              marginBottom: 6
            }}>
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={handleInputChange}
              style={{
                width: '100%',
                padding: '0.5em',
                border: '1px solid #bbb',
                borderRadius: 4,
                fontSize: 16
              }}
              disabled={loading}
              required
            />
          </div>
          {error && (
            <div style={{ color: '#e74c3c', marginBottom: 11, fontSize: 15 }}>
              {typeof error === 'string' ? error : 'Login failed.'}
            </div>
          )}
          <button
            type="submit"
            style={{
              background: '#3265dd',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              width: '100%',
              fontWeight: 600,
              fontSize: 16,
              padding: '0.55em 0',
              marginTop: 6,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
            disabled={loading || !email || !password}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}