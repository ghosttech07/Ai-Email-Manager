import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CircleCheck } from 'lucide-react';
import { api, firstName, fullDate, plural, since } from '../lib.js';
import { BlockError } from '../components/ui.jsx';

/**
 * What the client sees: only the emails that need them, why, and two ways out.
 * No navigation, no counts, no settings. Everything else is the assistant's job.
 */
export function ClientView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => api(`/client/${token}`).then((d) => { setData(d); setError(null); }).catch((e) => setError(e)), [token]);
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 8000);
    return () => clearInterval(timer);
  }, [load]);

  const replace = (thread) => setData((d) => ({ ...d, threads: d.threads.map((t) => (t.id === thread.id ? thread : t)) }));

  if (!data) {
    return (
      <div className="client-page">
        <main className="client-main" style={{ paddingTop: 80 }}>
          {error
            ? <BlockError message={error.message} onRetry={error.status === 404 ? undefined : load} />
            : <><span className="skeleton" style={{ width: 240, height: 28 }} /><span className="skeleton" style={{ width: 320 }} /></>}
        </main>
      </div>
    );
  }

  const assistant = firstName(data.assistantName);
  const pending = data.threads.filter((t) => !t.state);
  const settled = data.threads.filter((t) => t.state);

  return (
    <div className="client-page">
      <header className="client-top"><img src="/mark.svg" alt="" /> Handoff <span className="spacer" /> For {data.clientName}</header>
      <main className="client-main">
        <h1>{pending.length ? `${plural(pending.length, 'email needs', 'emails need')} you` : 'Nothing needs you right now'}</h1>
        <p>{pending.length ? `${assistant} is handling everything else in your inbox.` : `${assistant} is handling your inbox and will send anything that needs you here.`}</p>
        {error && <BlockError message="Can't refresh right now. Showing the last update." onRetry={load} />}

        {pending.map((t) => <Card key={t.id} thread={t} token={token} assistant={assistant} onChange={replace} />)}

        {pending.length === 0 && settled.length === 0 && (
          <div className="all-clear"><CircleCheck /><b style={{ fontWeight: 600 }}>All clear</b><span className="muted">You can close this page.</span></div>
        )}

        {settled.map((t) => (
          <div key={t.id} className="ccard done">
            <div className="row">
              <CircleCheck size={16} color="#1e7b4f" style={{ flex: 'none' }} />
              <span className="truncate" style={{ flex: 1 }}>
                <b style={{ fontWeight: 500 }}>{t.subject}</b>
                <span className="muted"> · {t.state.action === 'handled' ? 'You handled this' : `${assistant} is taking over`}</span>
              </span>
              <Undo thread={t} token={token} onChange={replace} />
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}

function Undo({ thread, token, onChange }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="link" style={{ marginLeft: 0, flex: 'none' }} disabled={busy}
      onClick={async () => { setBusy(true); try { onChange((await api(`/client/${token}/threads/${thread.id}`, { method: 'POST', body: { action: 'undo' } })).thread); } finally { setBusy(false); } }}
    >Undo</button>
  );
}

function Card({ thread, token, assistant, onChange }) {
  const [open, setOpen] = useState(false);
  const [handing, setHanding] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function act(action) {
    setBusy(true);
    setError(null);
    try {
      onChange((await api(`/client/${token}/threads/${thread.id}`, { method: 'POST', body: { action, note } })).thread);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <article className="ccard">
      <div className="row muted small"><span className="truncate" style={{ flex: 1 }}>{thread.from.name} · {thread.from.email}</span><span style={{ flex: 'none' }}>{since(thread.receivedAt)}</span></div>
      <h2>{thread.subject}</h2>
      <p className="ccard-summary">{thread.summary}</p>
      <p className="why"><b>Why you:</b> {thread.reason}</p>
      {thread.keyFacts.length > 0 && <div className="facts muted">{thread.keyFacts.map((f) => <span key={f.label}><b style={{ color: 'var(--text)' }}>{f.label}</b> {f.value}</span>)}</div>}

      {open && thread.messages.map((m) => (
        <div key={m.id} className={`msg ${m.direction === 'out' ? 'out' : ''}`}>
          <div className="msg-head" style={{ cursor: 'default' }}>
            <span className="line-main"><b style={{ fontWeight: 600 }}>{m.from.name}</b><span className="small muted">{fullDate(m.at)}</span></span>
          </div>
          <div className="msg-body">{m.body}</div>
        </div>
      ))}

      {handing && (
        <label className="field">
          <span>Anything {assistant} should know? <span className="muted" style={{ fontWeight: 400 }}>Optional</span></span>
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Approve it, but ask for 30-day terms" autoFocus />
        </label>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="ccard-actions">
        {handing ? (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => act('handover')}>{busy ? 'Sending…' : `Hand over to ${assistant}`}</button>
            <button className="btn btn-text" disabled={busy} onClick={() => setHanding(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => act('handled')}>I've handled it</button>
            <button className="btn" disabled={busy} onClick={() => setHanding(true)}>{assistant}, take over</button>
            <button className="btn btn-text" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? 'Hide conversation' : `Read conversation${thread.messages.length > 1 ? ` (${thread.messages.length})` : ''}`}</button>
          </>
        )}
      </div>
    </article>
  );
}
