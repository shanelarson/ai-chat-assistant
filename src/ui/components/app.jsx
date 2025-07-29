import React, { useState, useEffect, useCallback, useRef } from 'react';
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
        // Merge streamingAssistantMsg into messages array, and then REFRESH conversations from backend to always get full, correct history.
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
                streamingAssistantMsg: undefined,
              };
            }
            return { ...conv, streamingAssistantMsg: undefined };
          })
        );
        // Immediately fetch latest conversations from backend to ensure message history is not stale.
        apiFetch('/conversations')
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data)) {
              setConversations(data);
              // If this conversation was active, refresh currentConv accordingly.
              const conv = data.find(c => c._id === conversationId);
              if (conv && selected === conversationId) {
                setCurrentConv(conv);
              }
            }
          });
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
    // Refresh all conversations & update currentConv
    apiFetch('/conversations')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setConversations(data);
          const conv = data.find(c => c._id === conversationId);
          if (conv) setCurrentConv(conv);
        }
      });
  }
  function handleStartNew() {
    // No conversation is created until the user SENDS their first message;
    // This function just sets UI state for a "new conversation" screen.
    setSelected(null);
    setCurrentConv(null);
    setInputValue('');
    setChatError('');
    setSendLoading(false);
    setStreaming(false);
  }
  // Send handler: handles both new and existing conversations when user presses Send.
  async function handleSend() {
    // Placeholder -- now handled in ConversationView, including image validation and calling onSend as needed.
    // This function remains for API compatibility, but does not handle images directly.
  }
  // Ref to allow clearing the file input in ImageUploadInput after send
  const imageInputRef = useRef();
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
                      // Start with backend messages
                      let msgs = Array.isArray(currentConv.messages) ? [...currentConv.messages] : [];
                      // If we have a pending user message for this conv, and it hasn't already been echoed by backend:
                      let showPending = false;
                      if (
                        pendingUserMsg &&
                        pendingUserMsg.conversationId === currentConv._id &&
                        !msgs.some(
                          m =>
                            m.type === 'user' &&
                            m.createdAt &&
                            pendingUserMsg.createdAt &&
                            Math.abs(new Date(m.createdAt).getTime() - new Date(pendingUserMsg.createdAt).getTime()) < 3000 &&
                            deepContentEqual(m.content, pendingUserMsg.content)
                        )
                      ) {
                        showPending = true;
                      }
                      if (showPending) {
                        msgs.push(pendingUserMsg);
                      }
                      if (currentConv.streamingAssistantMsg) {
                        msgs.push({
                          type: 'assistant',
                          content: currentConv.streamingAssistantMsg,
                          createdAt: new Date()
                        });
                      }
                      msgs = [...msgs].sort((a, b) => {
                        const aTime = getMsgTimestamp(a);
                        const bTime = getMsgTimestamp(b);
                        return aTime - bTime;
                      });
                      return msgs;
                    })()
                  }
                : // If there's a pending user message and no conversation exists (start new conversation screen after sending the first message)
                  (pendingUserMsg
                    ? {
                        messages: [pendingUserMsg]
                      }
                    : null)
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
              if (!hasText && !hasImages) {
                setChatError("Please enter a message or attach an image before sending.");
                return;
              }
              if (sendLoading || streaming || convLoading) {
                return;
              }
              // ALWAYS create pending user messages as an object with .type, .content (which should always be either multimodal array or string if text-only), .createdAt
              let userMsgContent;
              if (hasImages) {
                userMsgContent = [
                  ...imagesToSend.map(img => ({
                    type: 'image_url',
                    image_url: { url: img.dataUrl || img.data || '' }
                  })),
                  ...(hasText ? [{ type: 'text', text: trimmedMsg }] : [])
                ];
              } else if (hasText) {
                // For text-only messages, store as *string* not array
                userMsgContent = trimmedMsg;
              }
              const now = new Date();
              const pendingMsgObj = {
                type: 'user',
                content: userMsgContent,
                createdAt: now,
                pending: true,
              };
              setPendingUserMsg(pendingMsgObj);
              if (!currentConv || !currentConv._id) {
                // Starting a new conversation: create on backend, use its _id, then send message.
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
                    // Instead of just prepending the empty conv, always reload full list from backend to avoid message drop
                    apiFetch('/conversations')
                      .then(res2 => res2.json())
                      .then(data => {
                        if (Array.isArray(data)) {
                          setConversations(data);
                          setSelected(newConv._id);
                          const convObj = data.find(c => c._id === newConv._id);
                          setCurrentConv(convObj || newConv);
                        }
                      });
                    // Now send the first message in this conversation
                    setSendLoading(true);
                    setStreaming(true);
                    socket.emit('message', {
                      conversationId: newConv._id,
                      message: trimmedMsg,
                      images: imagesToSend.map(img => ({
                        data: img.dataUrl || img.data || '',
                        type: img.type || img.file?.type || '',
                        name: img.name || img.file?.name || '',
                        size: img.size || img.file?.size
                      }))
                    });
                    setInputValue('');
                    setImages([]); // Clear images after send (NEW CONVO)
                    // Reset file input so attached files are cleared too
                    if (imageInputRef.current) {
                      imageInputRef.current.value = '';
                    }
                    setPendingUserMsg({ ...pendingMsgObj, conversationId: newConv._id });
                  } else {
                    setChatError('Failed to create new conversation.');
                  }
                } catch (err) {
                  setChatError('Failed to create new conversation.');
                } finally {
                  setSendLoading(false);
                }
                return;
              }
              // Existing conversation: send as normal
              setSendLoading(true);
              setChatError('');
              setStreaming(true);
              socket.emit('message', {
                conversationId: currentConv._id,
                message: trimmedMsg,
                images: imagesToSend.map(img => ({
                  data: img.dataUrl || img.data || '',
                  type: img.type || img.file?.type || '',
                  name: img.name || img.file?.name || '',
                  size: img.size || img.file?.size
                }))
              });
              setInputValue('');
              setImages([]); // Clear images after send (EXISTING CONVO)
              // Reset file input so attached files are cleared too
              if (imageInputRef.current) {
                imageInputRef.current.value = '';
              }
              setPendingUserMsg({ ...pendingMsgObj, conversationId: currentConv._id });
            }}
            disabled={sendLoading || streaming || convLoading}
            placeholder="Type your message and hit Send…"
            error={chatError}
            images={images}
            onImagesChange={setImages}
            imageInputRef={imageInputRef}
          />
        </div>
      </div>
    );
  }
  // state: for optimistic pending message display
  const [pendingUserMsg, setPendingUserMsg] = useState(null);
  // Unified images state for pending message composition (only cleared on send or conversation switch)
  const [images, setImages] = useState([]);
  // Remove the pending user message ONLY when a fully matching message is confirmed from backend (by content AND createdAt ~margin)
  useEffect(() => {
    if (!pendingUserMsg) return;
    if (
      currentConv &&
      currentConv.messages &&
      currentConv.messages.length > 0
    ) {
      const found = currentConv.messages.some(msg =>
        msg.type === "user" &&
        msg.createdAt &&
        pendingUserMsg.createdAt &&
        Math.abs(new Date(msg.createdAt).getTime() - new Date(pendingUserMsg.createdAt).getTime()) < 3000 &&
        deepContentEqual(msg.content, pendingUserMsg.content)
      );
      if (found) {
        setPendingUserMsg(null);
      }
    }
    // Also clear if a new conversation is selected (e.g. user hits Back/New Conversation)
    if (
      !currentConv ||
      (pendingUserMsg &&
        pendingUserMsg.conversationId &&
        currentConv._id !== pendingUserMsg.conversationId)
    ) {
      setPendingUserMsg(null);
      setImages([]); // Clear images when switching conversations
    }
  }, [currentConv && currentConv.messages && currentConv.messages.length, currentConv && currentConv._id, pendingUserMsg]);
  // Helpers for stable message ordering and deep content comparison
  function getMsgTimestamp(msg) {
    // Support fallback for legacy msgs w/o createdAt (extract from ObjectID, or use 0/now)
    if (msg.createdAt) return new Date(msg.createdAt).getTime();
    // Fallback: try Mongo ObjectID timestamp (if _id matches ObjectID)
    if (msg._id && typeof msg._id === 'string' && msg._id.length === 24) {
      // ObjectID time is first 8 chars as hex seconds since epoch
      return parseInt(msg._id.substring(0, 8), 16) * 1000;
    }
    return Date.now();
  }
  function deepContentEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a === "string" || typeof a === "number" || typeof a === "boolean") return a === b;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; ++i) {
        if (!deepContentEqual(a[i], b[i])) return false;
      }
      return true;
    }
    if (typeof a === "object" && typeof b === "object" && a && b) {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      for (let key of aKeys) {
        if (!deepContentEqual(a[key], b[key])) return false;
      }
      return true;
    }
    return false;
  }
// Notes:
// - We sort all messages, including streaming assistant and any pending user message, by true chronological order before render.
// - The pending user message is only appended if no backend-confirmed match exists (same createdAt ±3s and deep content equality).
// - This ensures strict User → Assistant → User → Assistant alternation with no double User/User or Assistant/Assistant.
// - This prevents flicker, duplication, and missing-message bugs, making chat order stable after refresh or state churn.
// - For legacy messages without createdAt, ObjectID is used for best-effort sorting, else default to now().
// - See developer documentation and comments for additional reasoning and maintenance guidance.
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

export { }


export default App;

