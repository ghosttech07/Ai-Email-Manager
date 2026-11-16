import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, ArrowUp } from 'lucide-react';
import { api, firstName } from '../lib.js';
import { useInbox, useSession } from '../state.jsx';
import { OwnerTag } from './ui.jsx';

/** Ask questions about the inbox in plain language. Answers link back to the conversations. */
export function AskPanel({ threadId, onClose }) {
  const { user, engine } = useSession();
  const { threads } = useInbox();
  const navigate = useNavigate();
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const current = threads.find((t) => t.id === threadId);

  const suggestions = [
    'Show me emails that need my attention',
    'What am I waiting for a response on?',
    `Which emails need ${firstName(user.clientName)}'s attention?`,
    ...(current ? ['Why was this email assigned this way?', 'Summarize this conversation'] : ['What is due this week?']),
  ];

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns, busy]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  async function ask(question) {
    if (!question.trim() || busy) return;
    setText('');
    setBusy(true);
    setTurns((t) => [...t, { q: question }]);
    try {
      const res = await api('/ai/ask', { method: 'POST', body: { question, threadId } });
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, ...res } : turn)));
      if (res.draft && current) navigate(`/app/inbox/inbox/${current.id}?draft=1`);
    } catch (e) {
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, error: e.message } : turn)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="ask" aria-label="Ask about the inbox">
      <div className="ask-head">
        <Sparkles size={16} />
        <h2 style={{ fontSize: 14 }}>Ask about this inbox</h2>
        <span className="spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
      </div>
      <div className="ask-body">
        {turns.length === 0 && (
          <>
            <p className="muted">Answers come from the connected mailboxes{current ? ' and the conversation you have open' : ''}.</p>
            <div className="suggest">
              {suggestions.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}
            </div>
          </>
        )}
        {turns.map((turn, i) => (
          <div key={i} style={{ display: 'grid', gap: 8 }}>
            <div className="bubble q">{turn.q}</div>
            {turn.error && <div className="bubble a" role="alert">{turn.error} <button className="link" onClick={() => ask(turn.q)}>Retry</button></div>}
            {turn.answer && (
              <div className="bubble a">
                {turn.answer.split('\n').filter((l) => !l.startsWith('•')).join('\n')}
                {turn.threadIds?.length > 0 && (
                  <div className="ask-links">
                    {turn.threadIds.map((id) => threads.find((t) => t.id === id)).filter(Boolean).map((t) => (
                      <button key={t.id} onClick={() => { navigate(`/app/inbox/inbox/${t.id}`); if (window.innerWidth < 860) onClose(); }}>
                        <span className="truncate" style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{t.from.name}</b> <span className="muted">{t.subject}</span></span>
                        <OwnerTag owner={t.responsibility} clientName={user.clientName} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble a muted">Reading the inbox…</div>}
        <div ref={end} />
      </div>
      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question" aria-label="Your question" autoFocus />
        <button className="btn btn-primary" disabled={busy || !text.trim()} aria-label="Ask"><ArrowUp /></button>
      </form>
      {engine?.simulated && <p className="small muted" style={{ padding: '0 12px 10px' }}>Answered by the built-in rules engine. Add a Gemini or Anthropic API key for free-form questions.</p>}
    </aside>
  );
}
