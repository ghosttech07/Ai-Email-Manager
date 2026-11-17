import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useSession } from '../state.jsx';

const SAMPLE = [
  { who: 'Rohan Mehta', subject: 'Reschedule: winter collection shoot', owner: 'assistant', tag: 'Assistant to reply', when: '2 days' },
  { who: 'Priya Nair', subject: 'Q3 GST filing: sign-off needed', owner: 'client', tag: 'Client to reply', when: '20 h' },
  { who: 'Zoho Books', subject: 'Invoice INV-2291 paid', owner: 'none', tag: 'No reply needed', when: '9 h' },
];

export function Welcome() {
  const { signIn } = useSession();
  const [mode, setMode] = useState('register');
  const [form, setForm] = useState({ name: '', email: '', password: '', clientName: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(path, body, tag) {
    setBusy(tag);
    setError(null);
    try {
      await signIn(path, body);
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  }

  return (
    <div className="welcome">
      <section className="welcome-pitch">
        <div className="brand" style={{ padding: 0 }}><img src="/mark.svg" alt="" />Handoff</div>
        <h1>Know who owes the reply.</h1>
        <p>
          Handoff reads your client's inbox and sorts every conversation three ways: yours to answer, theirs to answer, or nobody's.
          Your client sees only the few emails that need them.
        </p>
        <div className="preview" aria-hidden="true">
          {SAMPLE.map((s) => (
            <div key={s.who} className="thread-row">
              <span className="row"><span className="who truncate" style={{ fontWeight: 600 }}>{s.who}</span><span className="when">{s.when}</span></span>
              <span className="truncate">{s.subject}</span>
              <span className="row meta"><span className={`owner o-${s.owner}`}>{s.tag}</span></span>
            </div>
          ))}
        </div>
      </section>

      <section className="welcome-form">
        <div>
          <div className="auth">
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={mode === 'register'} className={`tab ${mode === 'register' ? 'on' : ''}`} onClick={() => { setMode('register'); setError(null); }}>Create account</button>
              <button role="tab" aria-selected={mode === 'login'} className={`tab ${mode === 'login' ? 'on' : ''}`} onClick={() => { setMode('login'); setError(null); }}>Log in</button>
            </div>
            <form
              style={{ display: 'grid', gap: 16 }}
              onSubmit={(e) => { e.preventDefault(); submit(mode === 'register' ? '/auth/register' : '/auth/login', form, 'form'); }}
            >
              {mode === 'register' && (
                <label className="field"><span>Your name</span><input className="input" required autoComplete="name" value={form.name} onChange={set('name')} /></label>
              )}
              <label className="field"><span>Work email</span><input className="input" type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></label>
              <label className="field">
                <span>Password</span>
                <span className="pw-wrap">
                  <input className="input" type={showPassword ? 'text' : 'password'} required minLength={mode === 'register' ? 8 : undefined} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} aria-describedby={mode === 'register' ? 'pw-hint' : undefined} />
                  <button type="button" className="icon-btn pw-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} title={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </span>
                {mode === 'register' && <span id="pw-hint" className="small muted" style={{ fontWeight: 400 }}>At least 8 characters.</span>}
              </label>
              {mode === 'register' && (
                <label className="field"><span>Who do you assist?</span><input className="input" required placeholder="Your client's full name" value={form.clientName} onChange={set('clientName')} /></label>
              )}
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="btn btn-primary btn-lg" disabled={busy !== null}>{busy === 'form' ? 'One moment…' : mode === 'register' ? 'Create account' : 'Log in'}</button>
            </form>
            <div className="divider">or</div>
            <button className="btn btn-lg" disabled={busy !== null} onClick={() => submit('/auth/demo', {}, 'demo')}>
              {busy === 'demo' ? 'Preparing a sample inbox…' : 'Explore the demo workspace'}
            </button>
            <p className="small muted" style={{ textAlign: 'center' }}>No sign-up. A private sample inbox with two mailboxes, already sorted.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
