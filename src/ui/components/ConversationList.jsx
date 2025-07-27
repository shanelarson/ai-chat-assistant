import React from 'react';

// Show summary (first few words) of each conversation
function conversationSummary(convo) {
  if (!convo || !convo.messages || !convo.messages.length) return 'Untitled Conversation';
  const first = convo.messages[0]?.content || '';
  return first.length > 32 ? first.slice(0, 29) + '…' : first || 'Untitled Conversation';
}

/**
 * ConversationList
 * Props:
 * - conversations: Array of { _id, messages: [...] }
 * - selectedId: currently selected conversation _id
 * - onSelect: function(conversationId)
 * - onStartNew: start new conversation (no params)
 * - loading: true/false (if conversation loading)
 */
export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onStartNew,
  loading
}) {
  return (
    <aside
      style={{
        background: '#f6f8fa',
        borderRight: '1px solid #e3e6ea',
        height: '100%',
        width: 260,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 200,
        maxWidth: 330
      }}
    >
      <div style={{ padding: '1em 1.2em 0.5em', borderBottom: '1px solid #e3e6ea' }}>
        <button
          type="button"
          onClick={onStartNew}
          style={{
            background: '#3265dd',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '0.5em 1.1em',
            fontWeight: 600,
            fontSize: 15,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.55 : 1
          }}
          disabled={loading}
        >
          + New Conversation
        </button>
      </div>
      <div style={{
        flex: 1,
        overflowY: 'auto'
      }}>
        {(!conversations || conversations.length === 0) && (
          <div style={{
            color: '#8991a0',
            fontSize: 15,
            textAlign: 'center',
            marginTop: 36
          }}>
            No conversations yet.
          </div>
        )}
        <ul style={{
          listStyle: 'none',
          margin: 0,
          padding: 0
        }}>
          {conversations && conversations.map(convo => (
            <li key={convo._id}>
              <button
                type="button"
                onClick={() => !loading && onSelect && onSelect(convo._id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: selectedId === convo._id ? '#e9f0ff' : 'transparent',
                  color: selectedId === convo._id ? '#0e2a55' : '#1a252f',
                  border: 'none',
                  outline: 'none',
                  borderBottom: '1px solid #f0f1f3',
                  fontSize: 15,
                  padding: '0.9em 1.5em 0.9em 1.2em',
                  cursor: loading ? 'default' : 'pointer',
                  fontWeight: selectedId === convo._id ? 600 : 400
                }}
                disabled={loading}
                aria-current={selectedId === convo._id ? 'true' : undefined}
                tabIndex={0}
              >
                {conversationSummary(convo)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}