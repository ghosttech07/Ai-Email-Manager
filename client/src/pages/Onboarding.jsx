import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { OWNERS, api, firstName, plural } from '../lib.js';
import { useSession, useToast } from '../state.jsx';
import { BlockError, OwnerTag } from '../components/ui.jsx';
import { ConnectDialog, PROVIDERS, ProviderLogo } from '../components/ConnectDialog.jsx';

/** Three steps: connect a mailbox, watch the AI sort it, share the client's link. */
export function Onboarding() {
  const { status, user, update } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [inbox, setInbox] = useState({ threads: [], accounts: [] });
  const [connecting, setConnecting] = useState(null);
  const [error, setError] = useState(null);
  const [finishing, setFinishing] = useState(false);

  const signedIn = status === 'ready';
  useEffect(() => {
    if (!signedIn) return undefined;
    let alive = true;
    const load = () => api('/inbox').then((d) => { if (alive) { setInbox(d); setError(null); } }).catch((e) => alive && setError(e.message));
    load();
    const timer = setInterval(load, 700);
    return () => { alive = false; clearInterval(timer); };
  }, [signedIn]);

  if (status === 'loading') return <div className="onboard"><span className="muted">Opening your workspace…</span></div>;
  if (status === 'anonymous') return <Navigate to="/" replace />;
  if (user.onboarded && !finishing) return <Navigate to="/app" replace />;

  const { accounts, threads } = inbox;
  const client = firstName(user.clientName);
  const syncing = accounts.find((a) => a.status === 'syncing');
  const failed = accounts.find((a) => a.status === 'error');
  const synced = accounts.filter((a) => a.status === 'synced');
  const step = syncing || failed ? 2 : synced.length ? 3 : 1;
  const count = (o) => threads.filter((t) => t.responsibility === o).length;
  const link = `${window.location.origin}/c/${user.clientToken}`;
  const remaining = Object.keys(PROVIDERS).filter((p) => !accounts.some((a) => a.provider === p));

  async function finish() {
    setFinishing(true);
    try {
      await update({ onboarded: true });
      navigate('/app');
    } catch (e) {
      setFinishing(false);
      toast(e.message, { tone: 'error' });
    }
  }

  return (
    <div className="onboard">
      <main className="onboard-card">
        <div className="row"><img src="/mark.svg" alt="" width="22" height="22" /><b style={{ fontSize: 16, fontWeight: 600 }}>Handoff</b><span className="spacer" /><span className="small muted">Step {step} of 3</span></div>
        <div className="steps" aria-hidden="true">{[1, 2, 3].map((n) => <i key={n} className={n <= step ? 'on' : ''} />)}</div>

        {step === 1 && (
          <>
            <div>
              <h1>Connect {client}'s mailbox</h1>
              <p className="muted" style={{ marginTop: 6 }}>Hi {firstName(user.name)}. Handoff reads the inbox once it is connected and decides, for every conversation, whether you reply, {client} replies, or nobody needs to.</p>
            </div>
            {error && <BlockError message={error} />}
            <div className="providers">
              {Object.entries(PROVIDERS).map(([id, p]) => (
                <button key={id} className="provider" onClick={() => setConnecting(id)}>
                  <ProviderLogo provider={id} />
                  <b style={{ fontWeight: 600 }}>Connect {p.name}</b>
                  <span className="small muted">{p.blurb}</span>
                </button>
              ))}
            </div>
            <p className="small muted">You can add the second mailbox later in settings. Access can be removed at any time.</p>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h1>{failed ? 'The sync stopped' : `Sorting ${client}'s inbox`}</h1>
              <p className="muted" style={{ marginTop: 6 }}>{failed ? failed.error : `Reading ${syncing.email}. Each conversation is classified as it arrives.`}</p>
            </div>
            {failed ? (
              <BlockError message="Nothing was changed in the mailbox." onRetry={() => api(`/accounts/${failed.id}/sync`, { method: 'POST' }).catch((e) => toast(e.message, { tone: 'error' }))} />
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={syncing.progress.total} aria-valuenow={syncing.progress.done}>
                  <i style={{ width: `${syncing.progress.total ? (syncing.progress.done / syncing.progress.total) * 100 : 0}%` }} />
                </div>
                <span className="small muted">{syncing.progress.done} of {syncing.progress.total || '…'} conversations</span>
              </div>
            )}
            <div className="sync-feed" aria-live="polite">
              {threads.length === 0 && <div className="line muted">Connecting…</div>}
              {[...threads].sort((a, b) => b.ai.classifiedAt.localeCompare(a.ai.classifiedAt)).map((t) => (
                <div key={t.id} className="line">
                  <span className="line-main"><b className="truncate">{t.from.name}</b><span className="truncate muted small">{t.subject}</span></span>
                  <OwnerTag owner={t.responsibility} clientName={user.clientName} long />
                </div>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h1>{plural(threads.length, 'conversation')} sorted</h1>
              <p className="muted" style={{ marginTop: 6 }}>
                {synced.map((a) => a.email).join(' and ')} {synced.length === 1 ? 'is' : 'are'} connected. Only {count('assistant') + count('review')} of {threads.length} need you, and {count('none')} need no reply at all.
              </p>
            </div>
            <div className="tally">
              {['assistant', 'client', 'review', 'none'].map((o) => (
                <div key={o} className={`o-${o}`}>
                  <span className="small row" style={{ gap: 6 }}><span className="dot" />{o === 'client' ? `${client} to reply` : OWNERS[o].label}</span>
                  <b>{count(o)}</b>
                </div>
              ))}
            </div>
            <div className="field">
              <span>{client}'s private link</span>
              <div className="joined">
                <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Client link" />
                <button className="btn" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Link copied.'))}><Copy /> Copy</button>
              </div>
              <span className="small muted" style={{ fontWeight: 400 }}>{client} opens this to see only the {plural(count('client'), 'email')} that need them. No login, no dashboard.</span>
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-lg" onClick={finish} disabled={finishing}><Check /> Open the inbox</button>
              {remaining.map((p) => <button key={p} className="btn btn-lg" onClick={() => setConnecting(p)}>Also connect {PROVIDERS[p].name}</button>)}
            </div>
          </>
        )}
      </main>
      {connecting && <ConnectDialog provider={connecting} onClose={() => setConnecting(null)} onConnected={(account) => { setConnecting(null); setInbox((d) => ({ ...d, accounts: [...d.accounts, account] })); }} />}
    </div>
  );
}
