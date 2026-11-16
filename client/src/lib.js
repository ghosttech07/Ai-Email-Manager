// API client, formatting and the vocabulary shared by every screen.

const TOKEN_KEY = 'handoff.token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Can\'t reach the server. Check your connection and try again.'), { status: 0 });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: response.status });
  return data;
}

/** Who owns the next reply. `client` labels take the client's first name where it reads better. */
export const OWNERS = {
  assistant: { label: 'Assistant to reply', short: 'Assistant' },
  client: { label: 'Client to reply', short: 'Client' },
  review: { label: 'Needs review', short: 'Review' },
  none: { label: 'No reply needed', short: 'No reply' },
};

export const SEGMENTS = {
  inbox: { label: 'Inbox', empty: 'No open conversations. New email appears here as it arrives.' },
  assistant: { label: 'Assistant to reply', empty: 'You\'re caught up. Nothing is waiting on you.' },
  client: { label: 'Client to reply', empty: 'Nothing needs the client personally right now.' },
  review: { label: 'Needs review', empty: 'The AI was confident about everything. Nothing to review.' },
  none: { label: 'No reply needed', empty: 'No newsletters, receipts or resolved conversations here.' },
  action: { label: 'Action required', empty: 'No deadlines or overdue items.' },
  waiting: { label: 'Waiting for response', empty: 'You\'re not waiting on anyone.' },
  meetings: { label: 'Meetings and appointments', empty: 'No scheduling email in the inbox.' },
  important: { label: 'Important', empty: 'Nothing is marked important.' },
  general: { label: 'General', empty: 'No general updates.' },
  done: { label: 'Done', empty: 'Conversations you complete are kept here.' },
  archived: { label: 'Archived', empty: 'Nothing archived yet.' },
};

export const firstName = (name = '') => name.split(' ')[0];
export const initials = (name = '') => name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

/** A stable pale tint per person: identity, not data. */
export function tint(name = '') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { background: `hsl(${h} 42% 91%)`, color: `hsl(${h} 45% 24%)` };
}

const DAY = 864e5;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "9 min", "3 h", "Yesterday", "2 days", "12 Nov" */
export function ago(iso, now = new Date()) {
  const d = new Date(iso);
  const mins = Math.round((now - d) / 6e4);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min`;
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days === 0) return `${Math.round(mins / 60)} h`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "9 min ago", "3 h ago", "Yesterday", "12 Nov" */
export function since(iso, now = new Date()) {
  const a = ago(iso, now);
  return /(min|h|days)$/.test(a) ? `${a} ago` : a;
}

/** How long something has been waiting, in words: "2 days", "5 hours". */
export function waited(iso, now = new Date()) {
  const hours = Math.max(1, Math.round((now - new Date(iso)) / 36e5));
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export const fullDate = (iso) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

/** "Today", "Tomorrow", "Thu 19 Nov" plus the time when the event has one. */
export function eventWhen(event, now = new Date()) {
  const d = new Date(event.at);
  const days = Math.round((startOfDay(d) - startOfDay(now)) / DAY);
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return event.timed ? `${day}, ${d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })}` : day;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function matchesQuery(thread, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${thread.subject} ${thread.from.name} ${thread.from.email} ${thread.ai.summary} ${thread.messages.map((m) => m.body).join(' ')}`.toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}
