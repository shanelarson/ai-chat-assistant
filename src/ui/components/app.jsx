import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './Navbar.jsx';
import LoginModal from './LoginModal.jsx';
import SignupModal from './SignupModal.jsx';
import ConversationList from './ConversationList.jsx';
import ConversationView from './ConversationView.jsx';
import ImageUploadInput from './ImageUploadInput.jsx';
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
  // Send handler: handles both new and existing conversations when user presses Send.
  async function handleSend() {
    // Placeholder -- now handled in ConversationView, including image validation and calling onSend as needed.
    // This function remains for API compatibility, but does not handle images directly.
  }
  // Show main UI
  function renderMainContent() {
    if (!loggedIn) {
      return (
        <div style={{
          display: 'flex',
          height: 'calc(100vh - 73px)',
          width: '100vw',
          maxWidth: '100vw',
          overflow: 'hidden',
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
      <div
        style={{
          display: 'flex',
          height: 'calc(100vh - 73px)',
          width: '100vw',
          maxWidth: '100vw',
          overflow: 'hidden',
        }}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selected}
          onSelect={handleSelectConversation}
          onStartNew={handleStartNew}
          loading={convLoading}
        />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            paddingRight: 20,
          }}
        >
          {/* Compose new-UI chat input as stack: image upload, then text+send */}
          <ConversationView
            conversation={
              currentConv
                ? {
                    ...currentConv,
                    messages: (() => {
                      // Compose the local user message to show "optimistically" in the UI immediately when Send is pressed.
                      // We need to build the pending user message and add it only until we get a new message from the backend.
                      // We'll store the pending message in a ref (state) here so it can be rendered until replaced by backend data.
                      // This will be managed below via state: pendingUserMsg
                      return [
                        ...(currentConv.messages || []),
                        ...(pendingUserMsg &&
                            pendingUserMsg.conversationId === currentConv._id &&
                            !(
                              currentConv.messages &&
                              currentConv.messages.length > 0 &&
                              currentConv.messages[currentConv.messages.length - 1].createdAt ===
                                pendingUserMsg.createdAt
                            )
                          ? [pendingUserMsg]
                          : []
                        ),
                        ...(currentConv.streamingAssistantMsg
                          ? [{
                              type: 'assistant',
                              content: currentConv.streamingAssistantMsg,
                              createdAt: new Date()
                            }]
                          : []),
                      ];
                    })(),
                  }
                : null
            }
            loading={sendLoading}
            streaming={streaming}
            inputValue={inputValue}
            onInputChange={e => setInputValue(e.target.value)}
            onSend={async (messageToSend, imagesToSend = []) => {
              if (!socket) return;
              const trimmedMsg = typeof messageToSend === "string" ? messageToSend.trim() : "";
              const hasText = trimmedMsg.length > 0;
              const hasImages = Array.isArray(imagesToSend) && imagesToSend.length > 0;
              // Prevent sending if both are missing, show error inline
              if (!hasText && !hasImages) {
                setChatError("Please enter a message or attach an image before sending.");
                return;
              }
              if (sendLoading || streaming || convLoading) {
                return;
              }
              // Compose the message in the correct structure (OpenAI multimodal format or string)
              // Always use OpenAI multimodal format: one user message with content array (images + text) or string
              let userMsgContent;
              if (hasImages) {
                // Only add text if present; for images-only, skip text entry.
                userMsgContent = [
                  ...imagesToSend.map(img => ({
                    type: 'image_url',
                    image_url: { url: img.data }
                  })),
                  ...(hasText ? [{ type: 'text', text: trimmedMsg }] : [])
                ];
              } else {
                userMsgContent = trimmedMsg;
              }
              const now = new Date();
              const pendingMsgObj = {
                type: 'user',
                content: userMsgContent,
                createdAt: now,
                pending: true,
                conversationId: currentConv && currentConv._id
              };
              setPendingUserMsg(pendingMsgObj);
              // If no conversation selected (starting new), create one and send the message
              if (!currentConv || !currentConv._id) {
                setSendLoading(true);
                setChatError('');
                setStreaming(false);
                try {
                  const res = await apiFetch('/conversations', {
                    method: 'POST',
                    body: JSON.stringify({})
                  });
                  const newConv = await res.json();
                  if (newConv && newConv._id) {
                    setConversations([newConv, ...conversations]);
                    setSelected(newConv._id);
                    setCurrentConv(newConv);
                    setSendLoading(true);
                    setStreaming(true);
                    socket.emit('message', {
                      conversationId: newConv._id,
                      message: trimmedMsg,
                      images: imagesToSend
                    });
                    setInputValue('');
                  } else {
                    setChatError('Failed to create new conversation.');
                  }
                } catch (err) {
                  setChatError('Failed to create new conversation.');
                } finally {
                  setSendLoading(false);
                }
                setPendingUserMsg(null);
                return;
              }
              // Existing conversation: send as normal
              setSendLoading(true);
              setChatError('');
              setStreaming(true); // expect stream
              socket.emit('message', {
                conversationId: currentConv._id,
                message: trimmedMsg,
                images: imagesToSend
              });
              setInputValue('');
            }}
            disabled={sendLoading || streaming || convLoading}
            placeholder="Type your message and hit Send…"
            error={chatError}
            // Pass a prop to clear the pending UI message upon backend update (see useEffect below)
          />
        </div>
      </div>
    );
  }
  // state: for optimistic pending message display
  const [pendingUserMsg, setPendingUserMsg] = useState(null);
  // Remove the pending user message when a new message comes in from backend
  useEffect(() => {
    if (!pendingUserMsg) return;
    // If latest message in currentConv matches the text/images/timestamp, clear pending
    if (
      currentConv &&
      currentConv.messages &&
      currentConv.messages.length > 0
    ) {
      const lastMsg = currentConv.messages[currentConv.messages.length - 1];
      // Compare by content and timestamp (to be conservative)
      if (
        lastMsg.type === "user" &&
        ((typeof lastMsg.content === "string" &&
          typeof pendingUserMsg.content === "string" &&
          lastMsg.content === pendingUserMsg.content) ||
         (Array.isArray(lastMsg.content) &&
          Array.isArray(pendingUserMsg.content) &&
          lastMsg.content.length === pendingUserMsg.content.length)) &&
        !pendingUserMsg.pending
      ) {
        setPendingUserMsg(null);
      }
      // Or just whenever backend message arrives, clear the pending
      if (
        lastMsg.type === "user" &&
        lastMsg.createdAt &&
        pendingUserMsg.createdAt &&
        new Date(lastMsg.createdAt).getTime() >= new Date(pendingUserMsg.createdAt).getTime()
      ) {
        setPendingUserMsg(null);
      }
    }
    // Also clear if a new conversation is selected
    // Or on successful assistant message etc
  }, [currentConv && currentConv.messages && currentConv.messages.length, currentConv && currentConv._id, pendingUserMsg]);

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









 


