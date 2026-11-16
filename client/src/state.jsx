// Session, inbox data and toasts. The inbox is loaded once and polled, and every screen derives
// its counts from the same thread list, so a number shown in two places is one variable.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken } from './lib.js';

/* ---------- toasts ---------- */

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, { tone = 'ok', action } = {}) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t.slice(-2), { id, message, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span>{t.message}</span>
            {t.action && (
              <button className="toast-action" onClick={() => { t.action.run(); setToasts((all) => all.filter((x) => x.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- session ---------- */

const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

export function SessionProvider({ children }) {
  const [state, setState] = useState({ status: getToken() ? 'loading' : 'anonymous', user: null, engine: null, storage: null });

  const load = useCallback(async () => {
    try {
      const me = await api('/me');
      setState({ status: 'ready', ...me });
    } catch {
      setToken(null);
      setState({ status: 'anonymous', user: null, engine: null, storage: null });
    }
  }, []);

  useEffect(() => { if (getToken()) load(); }, [load]);

  const value = useMemo(() => ({
    ...state,
    async signIn(path, body) {
      const { token } = await api(path, { method: 'POST', body });
      setToken(token);
      await load();
    },
    async update(patch) {
      const { user } = await api('/me', { method: 'PATCH', body: patch });
      setState((s) => ({ ...s, user }));
    },
    signOut() {
      setToken(null);
      setState({ status: 'anonymous', user: null, engine: null, storage: null });
    },
  }), [state, load]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/* ---------- inbox ---------- */

const InboxContext = createContext(null);
export const useInbox = () => useContext(InboxContext);

const POLL_MS = 5000;

export function InboxProvider({ children }) {
  const [data, setData] = useState({ threads: [], accounts: [], activity: [] });
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setData(await api('/inbox'));
      loaded.current = true;
      setStatus('ready');
      setError(null);
    } catch (e) {
      setError(e.message);
      // Keep showing the last good data; only a first load turns into an error screen.
      if (!loaded.current) setStatus('error');
    }
  }, []);

  useEffect(() => {
    refresh();
    const tick = () => { if (!document.hidden) refresh(); };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);

  /** Put one updated thread into the list without waiting for the next poll. */
  const put = useCallback((thread) => {
    setData((d) => {
      const exists = d.threads.some((t) => t.id === thread.id);
      const threads = exists ? d.threads.map((t) => (t.id === thread.id ? thread : t)) : [thread, ...d.threads];
      return { ...d, threads: threads.sort((x, y) => y.lastMessageAt.localeCompare(x.lastMessageAt)) };
    });
  }, []);

  const patchThread = useCallback(async (id, patch) => {
    const { thread } = await api(`/threads/${id}`, { method: 'PATCH', body: patch });
    put(thread);
    return thread;
  }, [put]);

  const counts = useMemo(() => {
    const c = {};
    for (const t of data.threads) for (const s of t.segments) c[s] = (c[s] || 0) + 1;
    c.unread = data.threads.filter((t) => t.unread && t.segments.includes('inbox')).length;
    return c;
  }, [data.threads]);

  const value = useMemo(
    () => ({ ...data, status, error, counts, query, setQuery, refresh, put, patchThread }),
    [data, status, error, counts, query, refresh, put, patchThread],
  );
  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}
