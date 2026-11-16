import { useState } from 'react';
import { Copy, ExternalLink, RefreshCw, Unplug } from 'lucide-react';
import { api, firstName, plural, since } from '../lib.js';
import { useInbox, useSession, useToast } from '../state.jsx';
import { BlockError, Dialog } from '../components/ui.jsx';
import { ConnectDialog, PROVIDERS, ProviderLogo } from '../components/ConnectDialog.jsx';

export function SettingsPage() {
  const { user, engine, storage, signOut } = useSession();
  const { accounts, threads, refresh, status, error } = useInbox();
  const toast = useToast();
  const [connecting, setConnecting] = useState(null);
  const [removing, setRemoving] = useState(null);
  const client = firstName(user.clientName);
  const link = `${window.location.origin}/c/${user.clientToken}`;
  const remaining = Object.keys(PROVIDERS).filter((p) => !accounts.some((a) => a.provider === p));
  const forClient = threads.filter((t) => t.segments.includes('client')).length;

  const act = async (fn, done) => {
    try { await fn(); await refresh(); if (done) toast(done); } catch (e) { toast(e.message, { tone: 'error' }); }
  };

  return (
    <div className="page">
      <div className="settings">
        <h1>Mailboxes and settings</h1>

        <section className="set-row">
          <div>
            <h2>Connected mailboxes</h2>
            <p>Handoff reads these inboxes and sends only the replies you approve.</p>
          </div>
          <div className="panel">
            {status === 'error' && <BlockError message={`Couldn't load mailboxes. ${error}`} onRetry={refresh} />}
            {status === 'ready' && accounts.length === 0 && <div className="empty">No mailbox connected. Connect one to start sorting email.</div>}
            {accounts.map((a) => (
              <div key={a.id} style={{ display: 'grid', gap: 8 }}>
                <div className="panel-row">
                  <ProviderLogo provider={a.provider} />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <b className="truncate" style={{ display: 'block', fontWeight: 600 }}>{a.email}</b>
                    <span className="small muted row" style={{ gap: 6 }}>
                      <span className={`status-dot ${a.status === 'synced' ? '' : a.status}`} />
                      {a.status === 'syncing' && `Syncing ${a.progress.done} of ${a.progress.total || '…'}`}
                      {a.status === 'synced' && `Synced ${since(a.lastSyncedAt).toLowerCase()} · ${plural(threads.filter((t) => t.accountId === a.id).length, 'conversation')}`}
                      {a.status === 'error' && 'Sync failed'}
                    </span>
                  </div>
                  <button className="btn" disabled={a.status === 'syncing'} onClick={() => act(() => api(`/accounts/${a.id}/sync`, { method: 'POST' }))}>
                    <RefreshCw className={a.status === 'syncing' ? 'spin' : ''} /> {a.status === 'syncing' ? 'Syncing' : 'Sync now'}
                  </button>
                  <button className="btn btn-danger" onClick={() => setRemoving(a)}><Unplug /> Disconnect</button>
                </div>
                {a.status === 'syncing' && <div className="progress"><i style={{ width: `${a.progress.total ? (a.progress.done / a.progress.total) * 100 : 0}%` }} /></div>}
                {a.status === 'error' && <BlockError message={a.error} onRetry={() => act(() => api(`/accounts/${a.id}/sync`, { method: 'POST' }))} />}
              </div>
            ))}
            {remaining.length > 0 && (
              <div className="panel-row">
                {remaining.map((p) => <button key={p} className="btn" onClick={() => setConnecting(p)}><ProviderLogo provider={p} /> Connect {PROVIDERS[p].name}</button>)}
              </div>
            )}
          </div>
        </section>

        <section className="set-row">
          <div>
            <h2>{client}'s view</h2>
            <p>A private page that lists only what needs {client} personally. Anything they mark as handled or hand back to you shows up in your inbox within seconds.</p>
          </div>
          <div className="panel">
            <div className="joined">
              <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Client link" />
              <button className="btn" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Link copied.'))}><Copy /> Copy</button>
            </div>
            <div className="panel-row">
              <span className="muted">{forClient ? `${plural(forClient, 'email')} currently waiting for ${client}.` : `Nothing is waiting for ${client}.`}</span>
              <span className="spacer" />
              <a className="btn" href={link} target="_blank" rel="noreferrer"><ExternalLink /> Open as {client}</a>
            </div>
          </div>
        </section>

        <section className="set-row">
          <div>
            <h2>AI engine</h2>
            <p>What reads, classifies, summarises and drafts.</p>
          </div>
          <div className="panel">
            <div className="panel-row">
              <b style={{ fontWeight: 600 }}>{engine.label}</b>
              <span className="muted">{engine.model ?? 'no API key configured'}</span>
            </div>
            <p className="muted">
              Every conversation is classified when it arrives and again whenever a new message lands in it. When the AI is less than 60% sure who should reply, it does not guess: the conversation goes to Needs review. Anything you correct stays corrected until new information arrives.
            </p>
            {engine.simulated && (
              <p className="notice">
                Running on the built-in rules engine: weighted cues in the email text, each one shown as the reason. Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY on the server and the same pipeline uses a language model for classification, summaries, drafts and questions.
              </p>
            )}
          </div>
        </section>

        <section className="set-row">
          <div>
            <h2>What is simulated</h2>
            <p>This is a prototype. Here is exactly where it stops.</p>
          </div>
          <div className="panel">
            {[
              ['Mailbox connection', 'The Gmail and Outlook consent step and the sync use a sample mailbox. No provider is contacted.'],
              ['Sending', 'Approved replies are added to the conversation and reclassified, but no email leaves the app.'],
              ['Incoming email', 'The "Simulate new email" button delivers the next scripted message so reclassification can be seen live.'],
              ['Storage', storage === 'mongodb' ? 'Data is stored in MongoDB.' : 'No MONGODB_URI is set, so data is kept in memory and resets when the server restarts.'],
            ].map(([title, text]) => (
              <div key={title}><b style={{ fontWeight: 600 }}>{title}</b><div className="muted">{text}</div></div>
            ))}
          </div>
        </section>

        <section className="set-row">
          <div>
            <h2>Where this goes next</h2>
            <p>How email connects to the rest of the platform.</p>
          </div>
          <div className="panel">
            {[
              ['Tasks', 'Each "Action required" email becomes a task with its deadline already filled in.'],
              ['Calendar', 'Meetings found in email are offered as calendar holds; accepting one drafts the confirmation.'],
              ['Approvals', `A decision ${client} makes in their view (approve, decline, hand over) is recorded and can trigger the reply.`],
              ['Platform addresses', 'Optional custom addresses on the platform domain, so a client can route mail straight into Handoff.'],
            ].map(([title, text]) => (
              <div key={title}><b style={{ fontWeight: 600 }}>{title}</b><div className="muted">{text}</div></div>
            ))}
          </div>
        </section>

        <section className="set-row">
          <div>
            <h2>Account</h2>
            <p>{user.demo ? 'A private demo workspace.' : user.email}</p>
          </div>
          <div className="panel">
            <div className="panel-row"><span>Signed in as <b style={{ fontWeight: 600 }}>{user.name}</b>, assisting {user.clientName}.</span><span className="spacer" /><button className="btn" onClick={signOut}>Log out</button></div>
          </div>
        </section>
      </div>

      {connecting && <ConnectDialog provider={connecting} onClose={() => setConnecting(null)} onConnected={() => { setConnecting(null); refresh(); toast('Mailbox connected. Sorting its email now.'); }} />}
      {removing && (
        <Dialog
          title="Disconnect mailbox"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button className="btn" onClick={() => setRemoving(null)}>Keep connected</button>
              <button className="btn btn-danger" onClick={() => { const a = removing; setRemoving(null); act(() => api(`/accounts/${a.id}`, { method: 'DELETE' }), `${a.email} disconnected.`); }}>Disconnect {removing.email}</button>
            </>
          }
        >
          <h2>Disconnect {removing.email}?</h2>
          <p className="muted">Its {plural(threads.filter((t) => t.accountId === removing.id).length, 'conversation')} will be removed from Handoff, including any corrections you made. Nothing changes in the mailbox itself, and you can reconnect it later.</p>
        </Dialog>
      )}
    </div>
  );
}
