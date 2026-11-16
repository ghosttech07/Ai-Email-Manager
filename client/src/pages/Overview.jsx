import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { OWNERS, eventWhen, firstName, plural, since, waited } from '../lib.js';
import { useInbox, useSession } from '../state.jsx';
import { Avatar, BlockError, OwnerTag, SkeletonRows } from '../components/ui.jsx';

const ORDER = ['assistant', 'client', 'review', 'none'];
const WEEK = 7 * 864e5;

/** Screen question: who owes a reply right now? */
export function Overview() {
  const { user } = useSession();
  const { threads, activity, counts, status, error, refresh } = useInbox();
  const client = firstName(user.clientName);
  const loading = status === 'loading';
  const now = new Date();

  const open = threads.filter((t) => t.segments.includes('inbox'));
  const by = (owner) => open.filter((t) => t.responsibility === owner);
  const oldestFirst = (list) => [...list].sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt));
  const mine = oldestFirst(by('assistant'));
  const deadlineOf = (t) => t.ai.events.find((e) => e.kind === 'deadline')?.at ?? '9999';
  const theirs = oldestFirst(by('client')).sort((a, b) => deadlineOf(a).localeCompare(deadlineOf(b)));
  // What to do next. A manual handover outranks the AI's original suggestion.
  const nextStep = (t) =>
    t.override?.by === 'client' ? `${client} handed this over${t.override.note ? `: “${t.override.note}”` : ''}`
      : t.override ? 'You took this on' : t.ai.action ?? 'Reply';
  const unsure = oldestFirst(by('review'));
  const dueSoon = (t) => t.ai.events.some((e) => e.kind === 'deadline' && new Date(e.at) - now < WEEK);

  const upcoming = open
    .flatMap((t) => t.ai.events.filter((e) => e.kind !== 'date' && (e.kind === 'meeting' || t.responsibility !== 'none')).map((e) => ({ ...e, thread: t })))
    .filter((e) => new Date(e.at) > now)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 6);

  const sublines = {
    assistant: mine.length ? `Oldest has waited ${waited(mine[0].lastMessageAt)}` : 'Nothing waiting on you',
    client: theirs.length ? `${theirs.filter(dueSoon).length} with a deadline this week` : 'Nothing needs them',
    review: unsure.length ? 'The AI was not sure who replies' : 'The AI was sure about all of it',
    none: 'Updates, receipts and resolved threads',
  };

  const finding = loading
    ? 'Reading the inbox…'
    : mine.length
      ? `${plural(mine.length, 'conversation is', 'conversations are')} waiting on you. The oldest, from ${mine[0].from.name}, has waited ${waited(mine[0].lastMessageAt)}.${unsure.length ? ` ${plural(unsure.length, 'more needs', 'more need')} you to decide who replies.` : ''}`
      : unsure.length
        ? `Nothing is waiting on your reply. ${plural(unsure.length, 'conversation needs', 'conversations need')} you to decide who replies.`
        : open.length
          ? `You are caught up. ${theirs.length ? `${plural(theirs.length, 'conversation is', 'conversations are')} with ${client}.` : 'Nothing is waiting on anyone.'}`
          : 'No mailbox is connected yet, so there is nothing to sort.';

  if (status === 'error') {
    return <div className="page"><div className="page-inner"><h1>Overview</h1><BlockError message={`Couldn't load the inbox. ${error}`} onRetry={refresh} /></div></div>;
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="title-row">
          <div>
            <h1>Overview</h1>
            <p>{finding}</p>
          </div>
          <div className="actions">
            {mine.length > 0 && <Link className="btn btn-primary" to={`/app/inbox/assistant/${mine[0].id}`}>Start replying <ArrowRight /></Link>}
            {!loading && open.length === 0 && <Link className="btn btn-primary" to="/app/settings">Connect a mailbox</Link>}
          </div>
        </div>

        <section className="card" aria-label="Who owns the reply">
          <div className="handoff">
            <div className="row">
              <h2>Who owns the reply</h2>
              <span className="spacer" />
              <span className="small muted desktop-only">{loading ? '' : `${counts.none || 0} of ${open.length} need no reply from anyone`}</span>
            </div>
            <div className="handoff-bar" role="img" aria-label={ORDER.map((o) => `${OWNERS[o].label}: ${counts[o] || 0}`).join(', ')}>
              {ORDER.filter((o) => counts[o]).map((o) => <i key={o} className={`o-${o}`} style={{ flexGrow: counts[o] }} />)}
            </div>
            <div className="handoff-cells">
              {ORDER.map((o) => (
                <Link key={o} to={`/app/inbox/${o}`} className={`handoff-cell o-${o}`}>
                  <span className="handoff-label"><span className="dot" />{o === 'client' ? `${client} to reply` : OWNERS[o].label}</span>
                  <span className="handoff-value">{loading ? <span className="skeleton" style={{ width: 28, height: 28, margin: '4px 0' }} /> : counts[o] || 0}</span>
                  <span className="small muted">{loading ? ' ' : sublines[o]}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="card strip" aria-label="Inbox at a glance">
          {[
            ['inbox', 'Open conversations', open.length],
            ['inbox', 'Unread', counts.unread],
            ['important', 'Important', counts.important],
            ['action', 'Action required', counts.action],
            ['waiting', 'Waiting for response', counts.waiting],
          ].map(([seg, label, value]) => (
            <Link key={label} to={`/app/inbox/${seg}`}>
              <span>{label}</span>
              <b>{loading ? '–' : value || 0}</b>
            </Link>
          ))}
        </section>

        <div className="grid-main">
          <div className="stack">
            <section className="card">
              <div className="card-head"><h2>Your replies</h2><Link to="/app/inbox/assistant">View all {mine.length || ''}</Link></div>
              {loading && <SkeletonRows count={4} />}
              {!loading && mine.length === 0 && <div className="empty">You're caught up. New email the AI assigns to you appears here.</div>}
              {mine.slice(0, 5).map((t) => (
                <Link key={t.id} className="line" to={`/app/inbox/assistant/${t.id}`}>
                  <Avatar name={t.from.name} />
                  <span className="line-main">
                    <b className="truncate">{t.from.name}</b>
                    <span className="truncate muted">{nextStep(t)} · {t.subject}</span>
                  </span>
                  <span className="when">{t.override?.by === 'client' ? `From ${client}` : `Waiting ${waited(t.lastMessageAt)}`}</span>
                </Link>
              ))}
            </section>

            {(loading || unsure.length > 0) && (
              <section className="card">
                <div className="card-head"><h2>Needs your review</h2><Link to="/app/inbox/review">View all {unsure.length || ''}</Link></div>
                {loading && <SkeletonRows count={2} />}
                {unsure.slice(0, 3).map((t) => (
                  <Link key={t.id} className="line" to={`/app/inbox/review/${t.id}`}>
                    <Avatar name={t.from.name} />
                    <span className="line-main">
                      <b className="truncate">{t.from.name} <span className="muted" style={{ fontWeight: 400 }}>· {t.subject}</span></b>
                      <span className="truncate muted">{t.ai.reason}</span>
                    </span>
                    <span className="when">{Math.round(t.ai.confidence * 100)}% sure</span>
                  </Link>
                ))}
              </section>
            )}

            <section className="card">
              <div className="card-head"><h2>With {client}</h2><Link to="/app/inbox/client">View all {theirs.length || ''}</Link></div>
              {loading && <SkeletonRows count={3} />}
              {!loading && theirs.length === 0 && <div className="empty">Nothing needs {client} personally right now.</div>}
              {theirs.slice(0, 4).map((t) => {
                const deadline = t.ai.events.find((e) => e.kind === 'deadline');
                return (
                  <Link key={t.id} className="line" to={`/app/inbox/client/${t.id}`}>
                    <Avatar name={t.from.name} />
                    <span className="line-main">
                      <b className="truncate">{t.from.name}</b>
                      <span className="truncate muted">{t.subject}</span>
                    </span>
                    <span className="when" style={deadline ? { color: '#9c1c21' } : undefined}>{deadline ? `Due ${eventWhen(deadline).replace(/^T/, 't')}` : `Sent ${since(t.lastMessageAt).toLowerCase()}`}</span>
                  </Link>
                );
              })}
            </section>
          </div>

          <div className="stack">
            <section className="card">
              <div className="card-head"><h2>Coming up</h2><Link to="/app/inbox/meetings">Meetings</Link></div>
              {loading && <SkeletonRows count={4} height={48} />}
              {!loading && upcoming.length === 0 && <div className="empty">No meetings or deadlines found in email.</div>}
              {upcoming.map((e) => (
                <Link key={`${e.thread.id}${e.at}${e.kind}`} className="line" to={`/app/inbox/inbox/${e.thread.id}`}>
                  <span className="line-main">
                    <b className="truncate">{e.title}</b>
                    <span className="truncate muted">{e.kind === 'deadline' ? 'Deadline' : 'Meeting'} · {eventWhen(e)}</span>
                  </span>
                  <OwnerTag owner={e.thread.responsibility} clientName={user.clientName} />
                </Link>
              ))}
            </section>

            <section className="card">
              <div className="card-head"><h2>Recent conversations</h2><Link to="/app/inbox/inbox">View all {open.length || ''}</Link></div>
              {loading && <SkeletonRows count={4} height={48} />}
              {!loading && open.length === 0 && <div className="empty">New email appears here as it arrives.</div>}
              {open.slice(0, 5).map((t) => (
                <Link key={t.id} className="line" to={`/app/inbox/inbox/${t.id}`}>
                  <span className="line-main">
                    <b className="truncate" style={t.unread ? { fontWeight: 600 } : undefined}>{t.from.name}</b>
                    <span className="truncate muted">{t.subject} · {since(t.lastMessageAt).toLowerCase()}</span>
                  </span>
                  <OwnerTag owner={t.responsibility} clientName={user.clientName} />
                </Link>
              ))}
            </section>

            <section className="card">
              <div className="card-head"><h2>Activity</h2></div>
              {loading && <SkeletonRows count={3} height={44} />}
              {!loading && activity.length === 0 && <div className="empty">Changes by the AI and by {client} are listed here.</div>}
              {activity.slice(0, 6).map((a) => (
                <div key={a.id} className="feed">
                  <span>{a.text}</span>
                  <span className="small muted">{since(a.at)}</span>
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
