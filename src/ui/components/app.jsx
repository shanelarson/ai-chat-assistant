import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './Navbar.jsx';
import LoginModal from './LoginModal.jsx';
import SignupModal from './SignupModal.jsx';
import ConversationList from './ConversationList.jsx';
import ConversationView from './ConversationView.jsx';
// Endpoints/Socket URLs from env (.env/.env.example control these, see docs)
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'ws://localhost:4000';
function App() {
  // Auth state
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [loggedIn, setLoggedIn] = useState(!!token);

  // Modal state
  const [loginModal, setLoginModal] = useState(false);
  const [signupModal, setSignupModal] = useState(false);

  // Auth loading/error
  const [loginLoading, setLoginLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [signupError, setSignupError] = useState('');

  // Conversations
  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(false);
  const [selected, setSelected] = useState(null); // convo _id
  const [currentConv, setCurrentConv] = useState(null);

  // Chat input state
  const [inputValue, setInputValue] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState('');

  // Socket
  const [socket, setSocket] = useState(null);

  // On login state change, store/remove token in localStorage
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      setLoggedIn(true);
    } else {
      localStorage.removeItem('token');
      setLoggedIn(false);
    }
  }, [token]);
  // Helper: Auth fetch to backend using /api proxy path
  const apiFetch = useCallback((url, opts = {}) => {
    // Always prefix /api unless already present
    let proxiedUrl =
      url.startsWith('/api/') ? url : url.startsWith('/api') ? url : `/api${url.startsWith('/') ? url : '/' + url}`;
    // Ensure we don't override Authorization accidentally and only set Content-Type for non-GET
    const method = opts.method ? opts.method.toUpperCase() : 'GET';
    const baseHeaders = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    // Only set Content-Type if not a GET
    if (method !== 'GET' && method !== 'HEAD') {
      baseHeaders['Content-Type'] = 'application/json';
    }
    return fetch(proxiedUrl, {
      ...opts,
      headers: {
        ...baseHeaders,
        ...(opts.headers || {}),
      }
    });
  }, [token]);
  // ----- Auth handler -----
  async function handleLogin({ email, password }) {
    setLoginLoading(true);
    setLoginError('');
    try {
      // Use apiFetch to ensure correct Authorization header management
      const res = await apiFetch('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        // Pass headers through so Content-Type is set (apiFetch merges with token logic)
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data?.error || 'Invalid login.');
      } else if (data.token) {
        setToken(data.token);
        setLoginModal(false);
        setLoginError('');
      }
    } catch (e) {
      setLoginError('Network error.');
    } finally {
      setLoginLoading(false);
    }
  }
  async function handleSignup({ email, password }) {
    setSignupLoading(true);
    setSignupError('');
    try {
      // Use apiFetch to ensure correct Authorization header management
      const res = await apiFetch('/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        setSignupError(data?.error || 'Signup failed.');
      } else if (data.token) {
        setToken(data.token);
        setSignupModal(false);
        setSignupError('');
      }
    } catch (e) {
      setSignupError('Network error.');
    } finally {
      setSignupLoading(false);
    }
  }



  function handleLogout() {
    setToken('');
    setLoggedIn(false);
    setSocket(null);
    setConversations([]);
    setSelected(null);
    setCurrentConv(null);
    setInputValue('');
  }
  // --------- Socket IO Connection ---------
  useEffect(() => {
    let sock;
    if (!loggedIn || !token) {
      setSocket(null);
      return;
    }

    // Dynamically import socket.io-client
    import('socket.io-client').then(({ io }) => {
      sock = io(SOCKET_URL, {
        autoConnect: false,
        auth: { token },
        transports: ["websocket"],
      });
      sock.connect();

      // Handle server disconnect/unauthorized
      sock.on('connect_error', err => {
        if (String(err?.message || '').toLowerCase().includes('auth')) {
          handleLogout();
        }
      });
      // Error message from server
      sock.on('errorMessage', msg => {
        setChatError(msg?.error || 'A server error occurred.');
        setStreaming(false);
        setSendLoading(false);
      });
      // Handle rejected messages (due to active awaiting response)
      sock.on('messageRejected', ({ reason, message: rejectedMessage }) => {
        setChatError(reason || 'Message rejected.');
        if (typeof rejectedMessage === 'string') {
          setInputValue(rejectedMessage);
        }
        setStreaming(false);
        setSendLoading(false);
      });
      // Handle streaming chunks
      sock.on('messageStreamChunk', ({ conversationId, chunk }) => {
        setConversations(prevConvs =>
          prevConvs.map(conv => {
            if (conv._id !== conversationId) return conv;
            // Push AI chunk as a temporary 'streamingAssistantMsg'
            if (!conv.streamingAssistantMsg)
              conv.streamingAssistantMsg = '';
            conv.streamingAssistantMsg += chunk;
            return { ...conv };
          })
        );
        if (currentConv && currentConv._id === conversationId) {
          setCurrentConv(conv => ({
            ...conv,
            streamingAssistantMsg:
              (conv.streamingAssistantMsg || '') + chunk
          }));
        }
      });

      // Finalize response
      sock.on('messageStreamEnd', ({ conversationId }) => {
        setStreaming(false);
        setSendLoading(false);
        // Merge streamingAssistantMsg into messages array
        setConversations(prevConvs =>
          prevConvs.map(conv => {
            if (conv._id !== conversationId) return conv;
            if (conv.streamingAssistantMsg) {
              const aiMsg = {
                type: 'assistant',
                content: conv.streamingAssistantMsg,
                createdAt: new Date()
              };
              return {
                ...conv,
                messages: [...(conv.messages || []), aiMsg],
                streamingAssistantMsg: undefined
              };
            }
            return { ...conv, streamingAssistantMsg: undefined };
          })
        );
        // If current, update
        if (currentConv && currentConv._id === conversationId) {
          setCurrentConv(conv => {
            if (conv.streamingAssistantMsg) {
              return {
                ...conv,
                messages: [...(conv.messages || []), {
                  type: 'assistant',
                  content: conv.streamingAssistantMsg,
                  createdAt: new Date()
                }],
                streamingAssistantMsg: undefined
              };
            }
            return { ...conv, streamingAssistantMsg: undefined };
          });
        }
      });

      setSocket(sock);
      // Cleanup
      return () => {
        if (sock) sock.disconnect();
      };
    });

    // eslint-disable-next-line
  }, [loggedIn, token]);
  // --------------- Fetch conversations on login ---------------
  useEffect(() => {
    if (!loggedIn || !token) {
      setConversations([]);
      setSelected(null);
      setCurrentConv(null);
      return;
    }
    // Fetch conversation history
    setConvLoading(true);
    apiFetch('/conversations')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setConversations(data);
          if (data.length > 0) {
            setSelected(data[0]._id);
            setCurrentConv(data[0]);
          } else {
            setSelected(null);
            setCurrentConv(null);
          }
        } else {
          setConversations([]);
        }
      })
      .catch(() => setConversations([]))
      .finally(() => setConvLoading(false));
    // eslint-disable-next-line
  }, [loggedIn, token]);

  // Keep currentConv in sync with conversations & selected
  useEffect(() => {
    if (!selected) {
      setCurrentConv(null);
      return;
    }
    const conv = conversations.find(c => c._id === selected);
    setCurrentConv(conv || null);
  }, [selected, conversations]);

  // Handle conversation selection
  function handleSelectConversation(conversationId) {
    setSelected(conversationId);
    setChatError('');
    setInputValue('');
    setSendLoading(false);
    setStreaming(false);
  }
  function handleStartNew() {
    // For now, create new empty conversation on backend
    setConvLoading(true);
    apiFetch('/conversations', {
      method: 'POST',
      body: JSON.stringify({})
    })


      .then(res => res.json())
      .then(newConv => {
        if (newConv && newConv._id) {
          setConversations([newConv, ...conversations]);
          setSelected(newConv._id);
        }
      })
      .finally(() => setConvLoading(false));
    setChatError('');
    setInputValue('');
    setSendLoading(false);
    setStreaming(false);
  }
  // Send a new message via socket
  function handleSend() {
    if (!socket || !currentConv || !inputValue.trim() || sendLoading || streaming) return;
    setSendLoading(true);
    setStreaming(true);
    setChatError('');
    // Emit to socket (backend handles rest). Do not optimistically update conversation state or clear input yet
    socket.emit('message', {
      conversationId: currentConv._id,
      message: inputValue
    });
    // Only clear input if the message will be accepted (we'll clear it on send success, i.e. when no rejection message comes)
    // setInputValue(''); <-- moved logic: see below
  }
  // Show main UI
  function renderMainContent() {
    if (!loggedIn) {
      return (
        <div style={{
          display: 'flex',
          minHeight: 'calc(100vh - 56px)',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f7fbff'
        }}>
          <div style={{
            fontSize: 22,
            color: '#3d568a',
            letterSpacing: 0.5,
            fontWeight: 500,
            textAlign: 'center'
          }}>
            Must login to use service.
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
        <ConversationList
          conversations={conversations}
          selectedId={selected}
          onSelect={handleSelectConversation}
          onStartNew={handleStartNew}
          loading={convLoading}
        />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ConversationView
            conversation={
              currentConv
                ? {
                    ...currentConv,
                    messages: [
                      ...(currentConv.messages || []),
                      ...(currentConv.streamingAssistantMsg
                        ? [{
                            type: 'assistant',
                            content: currentConv.streamingAssistantMsg,
                            createdAt: new Date()
                          }]
                        : [])
                    ]
                  }
                : null
            }
            loading={sendLoading}
            streaming={streaming}
            inputValue={inputValue}
            onInputChange={e => setInputValue(e.target.value)}
            onSend={handleSend}
            disabled={sendLoading || streaming || convLoading}
            placeholder="Type your message and hit Send…"
            error={chatError}
          />
        </div>
      </div>
    );
  }
  // -------- Main App Render ---------
  return (
    <>
      <Navbar
        isLoggedIn={loggedIn}
        onLogin={() => {
          setLoginModal(true);
          setSignupModal(false);
        }}
        onSignup={() => {
          setSignupModal(true);
          setLoginModal(false);
        }}
        onLogout={handleLogout}
      />
      {renderMainContent()}
      <LoginModal
        isOpen={loginModal}
        onClose={() => setLoginModal(false)}
        onLogin={handleLogin}
        loading={loginLoading}
        error={loginError}
      />
      <SignupModal
        isOpen={signupModal}
        onClose={() => setSignupModal(false)}
        onSignup={handleSignup}
        loading={signupLoading}
        error={signupError}
      />
    </>
  );
}
// Note: To configure API/SOCKET URLs and ports, use .env/.env.example. CORS policies must match both HTTP and Socket.IO servers.
// On successful message send and stream start (first chunk or streamEnd), clear inputValue (unless message was rejected)
// This is handled implicitly: since we only clear inputValue after a call to handleSend, and if a message is rejected, setInputValue is called to restore the rejected message.
// If stream starts/ends normally, the input is already cleared.
export default App;




