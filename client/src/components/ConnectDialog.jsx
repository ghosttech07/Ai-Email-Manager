import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../lib.js';
import { Dialog } from './ui.jsx';

export const PROVIDERS = {
  gmail: { name: 'Gmail', company: 'Google', sample: 'meera@kilnandco.example', blurb: 'Google Workspace and personal Gmail' },
  outlook: { name: 'Outlook', company: 'Microsoft', sample: 'meera.raghavan@outlook.example', blurb: 'Microsoft 365 and Outlook.com' },
};

export function ProviderLogo({ provider }) {
  return provider === 'gmail' ? (
    <svg className="provider-logo" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2.5" fill="none" stroke="#131416" strokeWidth="1.5" />
      <path d="M3 7l9 7 9-7" fill="none" stroke="#c4242a" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg className="provider-logo" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="5" width="13" height="14" rx="2" fill="none" stroke="#131416" strokeWidth="1.5" />
      <rect x="2" y="7" width="11" height="10" rx="2" fill="#2f70bb" />
      <ellipse cx="7.5" cy="12" rx="2.3" ry="2.8" fill="none" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Stands in for the provider's OAuth consent screen. It shows the permissions a real
 * connection would request and says plainly that this prototype uses a sample mailbox.
 */
export function ConnectDialog({ provider, onClose, onConnected }) {
  const p = PROVIDERS[provider];
  const [email, setEmail] = useState(p.sample);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function allow(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { account } = await api('/accounts', { method: 'POST', body: { provider, email } });
      onConnected(account);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Connect ${p.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="connect-form" className="btn btn-primary" disabled={busy}>{busy ? 'Connecting…' : 'Allow access'}</button>
        </>
      }
    >
      <div className="row"><ProviderLogo provider={provider} /><h2>Handoff wants access to {p.name}</h2></div>
      <form id="connect-form" onSubmit={allow} className="field">
        <span>Mailbox to connect</span>
        <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </form>
      <div>
        <p className="muted small" style={{ marginBottom: 6 }}>This lets Handoff:</p>
        {['Read email and conversation history', 'Send replies you have reviewed and approved', 'See calendar invitations found in email'].map((line) => (
          <div key={line} className="row" style={{ padding: '3px 0' }}><ShieldCheck size={16} color="#1e7b4f" /> {line}</div>
        ))}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="notice">
        Prototype: this stands in for {p.company}'s sign-in screen. No {p.company} account is contacted; a realistic sample mailbox is synced and every email in it is classified by the AI exactly as live mail would be.
      </p>
    </Dialog>
  );
}
