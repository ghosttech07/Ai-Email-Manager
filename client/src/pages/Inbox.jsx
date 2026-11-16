import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ArrowLeft, ArrowRight, Check, Mail, MailOpen, MousePointerClick, RotateCcw, Send, Sparkles, Star, Undo2 } from 'lucide-react';
import { OWNERS, SEGMENTS, ago, api, firstName, fullDate, matchesQuery, plural, since } from '../lib.js';
import { useInbox, useSession, useToast } from '../state.jsx';
import { Avatar, BlockError, OwnerMenu, OwnerTag, SkeletonRows, ThreadFlags } from '../components/ui.jsx';

export function InboxPage() {
  const { segment = 'inbox', threadId } = useParams();
  const { user } = useSession();
  const { threads, accounts, status, error, refresh, query, setQuery, patchThread } = useInbox();
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const seg = SEGMENTS[segment] ? segment : 'inbox';
  const label = seg === 'client' ? `${firstName(user.clientName)} to reply` : SEGMENTS[seg].label;

  const inSegment = useMemo(() => threads.filter((t) => t.segments.includes(seg)), [threads, seg]);
  const visible = inSegment.filter(
    (t) => matchesQuery(t, query) && (filter === 'all' || (filter === 'unread' ? t.unread : t.provider === filter)),
  );
  const selected = threads.find((t) => t.id === threadId);
  // Keyboard triage: arrows or J/K move through the list, E marks done, Escape closes.
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest?.('input, textarea, select, [contenteditable], [role="dialog"], .menu, .ask')) return;
      const index = visible.findIndex((t) => t.id === threadId);
      const key = e.key.toLowerCase();
      if (key === 'arrowdown' || key === 'j' || key === 'arrowup' || key === 'k') {
        const step = key === 'arrowdown' || key === 'j' ? 1 : -1;
        const next = visible[index === -1 ? 0 : Math.min(visible.length - 1, Math.max(0, index + step))];
        if (next) { e.preventDefault(); navigate(`/app/inbox/${seg}/${next.id}`); }
      } else if (key === 'e' && selected && !selected.completed) {
        const after = visible[index + 1] ?? visible[index - 1];
        patchThread(selected.id, { completed: true })
          .then(() => toast('Marked as done.', { action: { label: 'Undo', run: () => patchThread(selected.id, { completed: false }).catch(() => {}) } }))
          .catch((err) => toast(err.message, { tone: 'error' }));
        navigate(`/app/inbox/${seg}${after ? `/${after.id}` : ''}`);
      } else if (key === 'escape' && threadId) {
        navigate(`/app/inbox/${seg}`);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  useEffect(() => { document.querySelector('.thread-row.selected')?.scrollIntoView({ block: 'nearest' }); }, [threadId]);

  // "No reply needed" is safe to clear in one go; everything can be restored.
  async function archiveAll() {
    const ids = inSegment.map((t) => t.id);
    try {
      await Promise.all(ids.map((id) => patchThread(id, { archived: true })));
      toast(`Archived ${plural(ids.length, 'conversation')}.`, { action: { label: 'Undo', run: () => ids.forEach((id) => patchThread(id, { archived: false }).catch(() => {})) } });
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  }

  const ListTitle = threadId ? 'h2' : 'h1'; // one h1 per screen: the open conversation's subject wins
  const filters = [['all', 'All'], ['unread', 'Unread'], ...(accounts.length > 1 ? accounts.map((a) => [a.provider, a.provider === 'gmail' ? 'Gmail' : 'Outlook']) : [])];

  return (
    <div className={`inbox ${threadId ? 'has-thread' : ''}`}>
      <section className="list-col" aria-label={label}>
        <div className="list-head">
          <div className="row">
            <ListTitle className="truncate">{label}</ListTitle>
            <span className="small muted" style={{ flex: 'none' }}>{status === 'ready' ? (query ? `${visible.length} of ${inSegment.length}` : inSegment.length) : ''}</span>
            <span className="spacer" />
            {seg === 'none' && inSegment.length > 0 && <button className="btn btn-sm" onClick={archiveAll}><Archive /> Archive all</button>}
          </div>
          <div className="chips" role="group" aria-label="Filter">
            {filters.map(([id, text]) => (
              <button key={id} className={`chip ${filter === id ? 'on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{text}</button>
            ))}
          </div>
        </div>
        <div className="list" aria-busy={status === 'loading'}>
          {status === 'loading' && <SkeletonRows count={7} height={86} />}
          {status === 'error' && <BlockError message={`Couldn't load conversations. ${error}`} onRetry={refresh} />}
          {status === 'ready' && visible.length === 0 && (
            <div className="empty">
              {query
                ? <>No conversation in “{label}” matches “{query}”. <button className="link" style={{ marginLeft: 4 }} onClick={() => setQuery('')}>Clear search</button></>
                : filter !== 'all' ? 'Nothing matches this filter.' : SEGMENTS[seg].empty}
            </div>
          )}
          {visible.map((t) => (
            <Link key={t.id} to={`/app/inbox/${seg}/${t.id}`} className={`thread-row o-${t.responsibility} ${t.unread ? 'unread' : ''} ${t.id === threadId ? 'selected' : ''}`}>
              <Avatar name={t.from.name} />
              <span className="row-main">
              <span className="row">
                {t.unread && <span className="unread-dot" aria-label="Unread" />}
                <span className="who truncate">{t.from.name}</span>
                {t.messages.length > 1 && <span className="small muted">{t.messages.length}</span>}
                <span className="when">{ago(t.lastMessageAt)}</span>
              </span>
              <span className="subject truncate">{t.subject}</span>
              <span className="truncate muted summary">{t.ai.summary}</span>
              <span className="row meta">
                <OwnerTag owner={t.responsibility} clientName={user.clientName} long />
                <ThreadFlags thread={t} />
              </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="reading" aria-label="Conversation">
        {selected ? (
          <ThreadView key={selected.id} thread={selected} segment={seg} />
        ) : (
          <div className="reading-empty">
            <MousePointerClick />
            <b style={{ color: 'var(--text)', fontWeight: 600, fontSize: 16 }}>
              {threadId && status === 'ready' ? 'This conversation is no longer available' : visible.length ? `${plural(visible.length, 'conversation')} in ${label}` : 'Nothing here right now'}
            </b>
            <span>{visible.length ? 'Open one to see the AI summary, its reasoning and a reply draft.' : SEGMENTS[seg].empty}</span>
            {visible.length > 0 && <Link className="btn btn-primary" style={{ marginTop: 8 }} to={`/app/inbox/${seg}/${visible.at(-1).id}`}>Start with the oldest <ArrowRight /></Link>}
            <span className="keys desktop-only"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>E</kbd> done <kbd>Esc</kbd> close <kbd>Ctrl</kbd><kbd>K</kbd> search <kbd>Ctrl</kbd><kbd>J</kbd> ask</span>
          </div>
        )}
      </section>
    </div>
  );
}

function ThreadView({ thread, segment }) {
  const { user, engine } = useSession();
  const { patchThread, put } = useInbox();
  const toast = useToast();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(() => new Set([thread.messages.at(-1).id]));
  const client = firstName(user.clientName);
  const closed = thread.archived || thread.completed;

  // Opening a conversation reads it.
  useEffect(() => {
    if (thread.unread) patchThread(thread.id, { unread: false }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);
  useEffect(() => setExpanded((s) => new Set([...s, thread.messages.at(-1).id])), [thread.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (patch, message, undo) => async () => {
    try {
      await patchThread(thread.id, patch);
      if (message) toast(message, undo ? { action: { label: 'Undo', run: () => patchThread(thread.id, undo).catch(() => {}) } } : undefined);
      if (patch.archived || patch.completed) navigate(`/app/inbox/${segment}`);
    } catch (e) {
      toast(e.message, { tone: 'error' });
    }
  };

  async function setOwner(owner) {
    if (owner === thread.responsibility) return;
    try {
      await patchThread(thread.id, { responsibility: owner });
      toast(`Moved to ${owner === 'client' ? `${client} to reply` : OWNERS[owner].label}.`);
    } catch (e) {
      toast(e.message, { tone: 'error' });
    }
  }

  async function reclassify() {
    try {
      const { thread: next } = await api(`/threads/${thread.id}/reclassify`, { method: 'POST' });
      put(next);
      toast(`The AI looked again: ${OWNERS[next.responsibility].label}.`);
    } catch (e) {
      toast(e.message, { tone: 'error' });
    }
  }

  const toggle = (id) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const confidence = Math.round(thread.ai.confidence * 100);

  return (
    <>
      <header className="thread-head">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Link to={`/app/inbox/${segment}`} className="icon-btn mobile-only" aria-label="Back to list"><ArrowLeft /></Link>
          <h1 style={{ flex: 1, minWidth: 0 }}>{thread.subject}</h1>
        </div>
        <div className="thread-tools">
          <OwnerMenu thread={thread} clientName={user.clientName} onPick={setOwner} onReclassify={reclassify} />
          <span className="spacer" />
          {closed ? (
            <button className="btn" onClick={run({ archived: false, completed: false }, 'Moved back to the inbox.')}><Undo2 /> Reopen</button>
          ) : (
            <>
              <button className="btn" onClick={run({ completed: true }, 'Marked as done.', { completed: false })}><Check /> <span className="desktop-only">Mark done</span></button>
              <button className="icon-btn" onClick={run({ archived: true }, 'Archived.', { archived: false })} aria-label="Archive" title="Archive"><Archive /></button>
            </>
          )}
          <button className="icon-btn" onClick={run({ unread: !thread.unread })} aria-label={thread.unread ? 'Mark as read' : 'Mark as unread'} title={thread.unread ? 'Mark as read' : 'Mark as unread'}>
            {thread.unread ? <MailOpen /> : <Mail />}
          </button>
          <button className={`icon-btn ${thread.important ? 'on' : ''}`} onClick={run({ important: !thread.important })} aria-pressed={thread.important} aria-label="Important" title="Important">
            <Star fill={thread.important ? 'currentColor' : 'none'} />
          </button>
        </div>
      </header>

      <div className="thread-scroll">
        <section className={`brief o-${thread.responsibility}`} aria-label="AI brief">
          <div className="brief-top">
            <Sparkles /> AI brief
            <span style={{ fontWeight: 400 }}>· {thread.ai.engine === 'rules' ? (engine?.simulated ? 'rules engine' : 'rules engine for now, the model was busy') : engine?.label ?? thread.ai.engine}</span>
            <span className="spacer" />
            <span title="How sure the AI is about who should reply" className="row" style={{ gap: 6, fontWeight: 500 }}>
              <span className="meter"><i style={{ width: `${confidence}%` }} /></span>{confidence}% sure
            </span>
          </div>
          <p>{thread.ai.summary}</p>
          <p className="brief-why"><b style={{ fontWeight: 600 }}>Why {thread.ai.responsibility === 'none' ? 'no reply' : thread.ai.responsibility === 'review' ? 'review' : thread.ai.responsibility === 'client' ? client : 'you'}:</b> {thread.ai.reason}</p>
          {thread.ai.keyFacts.length > 0 && (
            <div className="facts">{thread.ai.keyFacts.map((f) => <span key={f.label}><b>{f.label}</b> {f.value}</span>)}</div>
          )}
        </section>

        {thread.override && (
          <p className="note">
            {thread.override.by === 'client'
              ? thread.clientState?.action === 'handover'
                ? <><b>{client} asked you to take this over.</b>{thread.override.note ? ` “${thread.override.note}”` : ''}</>
                : <><b>{client} handled this personally.</b> Nothing more to do unless they say otherwise.</>
              : <><b>You set this manually.</b> The AI's pick was {OWNERS[thread.ai.responsibility].label.toLowerCase()}. It will look again when a new message arrives.</>}
          </p>
        )}
        {!thread.override && thread.reclassified && (
          <p className="note"><RotateCcw size={12} style={{ verticalAlign: -1 }} /> <b>Reclassified {since(thread.reclassified.at).toLowerCase()}</b> after a new message: {OWNERS[thread.reclassified.from].label} → {OWNERS[thread.reclassified.to].label}.</p>
        )}

        {thread.messages.map((m) => {
          const isOpen = expanded.has(m.id);
          return (
            <article key={m.id} className={`msg ${m.direction === 'out' ? 'out' : ''} ${isOpen ? '' : 'msg-collapsed'}`}>
              <button className="msg-head" onClick={() => toggle(m.id)} aria-expanded={isOpen}>
                <Avatar name={m.from.name} />
                <span className="line-main">
                  <b className="truncate" style={{ fontWeight: 600 }}>{m.from.name}{m.direction === 'out' && <span className="muted" style={{ fontWeight: 400 }}> · sent from this office</span>}</b>
                  <span className="truncate muted small">{isOpen ? m.from.email : m.body.replace(/\s+/g, ' ').slice(0, 120)}</span>
                </span>
                <span className="small muted" style={{ flex: 'none' }}>{fullDate(m.at)}</span>
              </button>
              <div className="msg-body">{m.body}</div>
            </article>
          );
        })}
      </div>

      {!closed && <Composer thread={thread} simulated={engine?.simulated} />}
      {closed && (
        <div className="composer"><span className="muted row"><ArchiveRestore size={16} /> This conversation is {thread.completed ? 'done' : 'archived'}. Reopen it to reply.</span></div>
      )}
    </>
  );
}

const TONES = [['shorter', 'Shorter'], ['warmer', 'Warmer'], ['formal', 'More formal']];

/** Reply drafting. The AI writes, the assistant edits, and nothing is sent without approval. */
function Composer({ thread, simulated }) {
  const { user } = useSession();
  const { put } = useInbox();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(null); // null = closed
  const [busy, setBusy] = useState(null); // 'draft' | 'send'
  const [aiWritten, setAiWritten] = useState(false);
  const [error, setError] = useState(null);
  const to = firstName(thread.from.name);
  const holding = thread.responsibility === 'client';

  async function draft(tone) {
    setBusy('draft');
    setError(null);
    try {
      const res = await api(`/threads/${thread.id}/draft`, { method: 'POST', body: { tone } });
      setText(res.draft);
      setAiWritten(true);
    } catch (e) {
      setError(`Couldn't write a draft. ${e.message}`);
      setText((t) => t ?? '');
    } finally {
      setBusy(null);
    }
  }

  // "Draft a reply" asked from the Ask panel lands here.
  useEffect(() => {
    if (params.get('draft')) { draft(); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function send() {
    setBusy('send');
    setError(null);
    try {
      const { thread: next } = await api(`/threads/${thread.id}/reply`, { method: 'POST', body: { body: text } });
      put(next);
      setText(null);
      toast(`Reply to ${to} sent${next.waiting ? '; now waiting for their response' : ''}. Simulated: no real email leaves this prototype.`);
    } catch (e) {
      setError(`Not sent. ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  if (text === null) {
    return (
      <div className="composer">
        <div className="composer-bar">
          <button className="btn btn-primary" onClick={() => draft()} disabled={busy === 'draft'}>
            <Sparkles /> {busy === 'draft' ? 'Writing…' : holding ? 'Draft a holding reply' : 'Draft reply with AI'}
          </button>
          <button className="btn" onClick={() => { setText(''); setAiWritten(false); }}>Write it myself</button>
          <span className="small muted">
            {holding ? `${firstName(user.clientName)} should answer this one. You can still send a holding note.` : thread.responsibility === 'none' ? 'The AI thinks no reply is needed.' : ''}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="composer">
      <div className="composer-bar">
        <b style={{ fontWeight: 600 }}>Reply to {thread.from.name}</b>
        <span className="small muted">{aiWritten ? `AI draft${simulated ? ' (rules engine)' : ''}. Review and edit before sending.` : 'Your reply'}</span>
      </div>
      <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} aria-label="Reply" placeholder={`Write to ${to}…`} disabled={busy === 'draft'} autoFocus />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="composer-bar">
        <button className="btn btn-primary" onClick={send} disabled={!text.trim() || busy !== null}><Send /> {busy === 'send' ? 'Sending…' : 'Approve and send'}</button>
        <button className="btn btn-text" onClick={() => setText(null)} disabled={busy !== null}>Discard</button>
        <span className="spacer" />
        {TONES.map(([id, label]) => (
          <button key={id} className="btn" onClick={() => draft(id)} disabled={busy !== null}>{label}</button>
        ))}
        <button className="icon-btn" onClick={() => draft()} disabled={busy !== null} aria-label="Write a new draft" title="Write a new draft"><RotateCcw className={busy === 'draft' ? 'spin' : ''} /></button>
      </div>
      <span className="sr-only">{plural(text.length, 'character')}</span>
    </div>
  );
}
