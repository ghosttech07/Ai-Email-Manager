import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';
import { db, newId, logActivity } from './store.js';
import { engine, draftReply, askInbox } from './ai/index.js';
import { present, classify, loadThread, listThreads, contextFor, OWNER_LABEL } from './services/inbox.js';
import { PROVIDERS, syncAccount, deliverIncoming, recordReply } from './services/sync.js';

export const api = Router();

// Express 4 does not catch rejected promises; this forwards them to the error handler.
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const fail = (res, status, message) => res.status(status).json({ error: message });

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, clientName: u.clientName, clientToken: u.clientToken, onboarded: u.onboarded, demo: Boolean(u.demo) });
const sign = (user) => jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '7d' });
const session = (user) => ({ token: sign(user), user: publicUser(user) });

async function requireUser(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const { sub } = jwt.verify(token, config.jwtSecret);
    req.user = await db.users.get(sub);
    if (!req.user) throw new Error('unknown user');
    next();
  } catch {
    fail(res, 401, 'Your session has expired. Please log in again.');
  }
}

function newUser(fields) {
  return { id: newId(), clientToken: randomBytes(12).toString('hex'), onboarded: false, incomingCursor: 0, createdAt: new Date().toISOString(), ...fields };
}

/* ---------- auth ---------- */

api.post('/auth/register', route(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const clientName = String(req.body.clientName || '').trim();
  const password = String(req.body.password || '');
  if (!name || !clientName) return fail(res, 400, 'Enter your name and your client\'s name.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Enter a valid email address.');
  if (password.length < 8) return fail(res, 400, 'Use a password of at least 8 characters.');
  if ((await db.users.find({ email })).length) return fail(res, 409, 'An account with this email already exists. Log in instead.');
  const user = newUser({ name, email, clientName, passwordHash: await bcrypt.hash(password, 10) });
  await db.users.put(user);
  res.status(201).json(session(user));
}));

api.post('/auth/login', route(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const [user] = await db.users.find({ email });
  const ok = user?.passwordHash && (await bcrypt.compare(String(req.body.password || ''), user.passwordHash));
  if (!ok) return fail(res, 401, 'That email and password do not match.');
  res.json(session(user));
}));

// A private, pre-connected workspace per visitor, so reviewers never share state.
api.post('/auth/demo', route(async (req, res) => {
  const user = newUser({ name: 'Ananya Iyer', clientName: 'Meera Raghavan', email: `demo-${randomBytes(4).toString('hex')}@handoff.example`, demo: true, onboarded: true });
  await db.users.put(user);
  const jobs = Object.entries(PROVIDERS).map(async ([provider, p]) => {
    const account = { id: newId(), userId: user.id, provider, email: p.sample, status: 'syncing', progress: { done: 0, total: 0 }, connectedAt: new Date().toISOString() };
    await db.accounts.put(account);
    return syncAccount(account, user);
  });
  // The rules engine is instant; with Claude the sync continues in the background.
  if (engine.id === 'rules') await Promise.all(jobs);
  res.status(201).json(session(user));
}));

api.get('/me', requireUser, route(async (req, res) => res.json({ user: publicUser(req.user), engine, storage: db.mode })));

api.patch('/me', requireUser, route(async (req, res) => {
  const patch = {};
  if (typeof req.body.onboarded === 'boolean') patch.onboarded = req.body.onboarded;
  if (typeof req.body.clientName === 'string' && req.body.clientName.trim()) patch.clientName = req.body.clientName.trim();
  const user = { ...req.user, ...patch };
  await db.users.put(user);
  res.json({ user: publicUser(user) });
}));

/* ---------- connected accounts ---------- */

api.post('/accounts', requireUser, route(async (req, res) => {
  const { provider } = req.body;
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!PROVIDERS[provider]) return fail(res, 400, 'Choose Gmail or Outlook.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Enter the email address of the mailbox to connect.');
  const existing = await db.accounts.find({ userId: req.user.id });
  if (existing.some((a) => a.provider === provider)) return fail(res, 409, `A ${PROVIDERS[provider].name} mailbox is already connected.`);
  const account = { id: newId(), userId: req.user.id, provider, email, status: 'syncing', progress: { done: 0, total: 0 }, connectedAt: new Date().toISOString() };
  await db.accounts.put(account);
  syncAccount(account, req.user, { paceMs: 260 }); // runs in the background; the UI polls progress
  res.status(201).json({ account });
}));

api.post('/accounts/:id/sync', requireUser, route(async (req, res) => {
  const account = await db.accounts.get(req.params.id);
  if (!account || account.userId !== req.user.id) return fail(res, 404, 'That mailbox is no longer connected.');
  if (account.status === 'syncing') return fail(res, 409, 'This mailbox is already syncing.');
  syncAccount(account, req.user, { paceMs: 120 });
  res.json({ ok: true });
}));

api.delete('/accounts/:id', requireUser, route(async (req, res) => {
  const account = await db.accounts.get(req.params.id);
  if (!account || account.userId !== req.user.id) return fail(res, 404, 'That mailbox is no longer connected.');
  await db.threads.remove({ accountId: account.id });
  await db.accounts.remove({ id: account.id });
  await logActivity(req.user.id, 'sync', `${PROVIDERS[account.provider].name} disconnected; its conversations were removed`);
  res.json({ ok: true });
}));

/* ---------- inbox ---------- */

api.get('/inbox', requireUser, route(async (req, res) => {
  const [threads, activity, accounts] = await Promise.all([
    listThreads(req.user.id),
    db.activity.find({ userId: req.user.id }),
    db.accounts.find({ userId: req.user.id }),
  ]);
  res.json({
    threads,
    accounts: accounts.sort((x, y) => x.connectedAt.localeCompare(y.connectedAt)),
    activity: activity.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 12),
  });
}));

api.patch('/threads/:id', requireUser, route(async (req, res) => {
  const thread = await loadThread(req.params.id, req.user.id);
  if (!thread) return fail(res, 404, 'This conversation no longer exists.');
  for (const flag of ['unread', 'archived', 'completed']) {
    if (typeof req.body[flag] === 'boolean') thread[flag] = req.body[flag];
  }
  if (typeof req.body.important === 'boolean') thread.important = req.body.important;
  if (req.body.completed === true) await logActivity(req.user.id, 'done', `You marked “${thread.subject}” as done`, thread.id);

  const owner = req.body.responsibility;
  if (owner) {
    if (!OWNER_LABEL[owner] || owner === 'review') return fail(res, 400, 'Choose assistant, client or no reply needed.');
    const before = thread.override?.responsibility ?? thread.ai.responsibility;
    thread.override = owner === thread.ai.responsibility ? null : { responsibility: owner, by: 'assistant', at: new Date().toISOString() };
    thread.clientState = null;
    if (before !== owner) await logActivity(req.user.id, 'override', `You moved “${thread.subject}” to ${OWNER_LABEL[owner]}`, thread.id);
  }
  await db.threads.put(thread);
  res.json({ thread: present(thread) });
}));

api.post('/threads/:id/reclassify', requireUser, route(async (req, res) => {
  const thread = await loadThread(req.params.id, req.user.id);
  if (!thread) return fail(res, 404, 'This conversation no longer exists.');
  await classify(thread, req.user);
  await db.threads.put(thread);
  res.json({ thread: present(thread) });
}));

api.post('/threads/:id/draft', requireUser, route(async (req, res) => {
  const thread = await loadThread(req.params.id, req.user.id);
  if (!thread) return fail(res, 404, 'This conversation no longer exists.');
  res.json(await draftReply(thread, { ...contextFor(req.user), tone: req.body.tone }));
}));

api.post('/threads/:id/reply', requireUser, route(async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) return fail(res, 400, 'Write a reply before sending.');
  const thread = await loadThread(req.params.id, req.user.id);
  if (!thread) return fail(res, 404, 'This conversation no longer exists.');
  res.json({ thread: await recordReply(thread, req.user, body) });
}));

api.post('/ai/ask', requireUser, route(async (req, res) => {
  const question = String(req.body.question || '').trim();
  if (!question) return fail(res, 400, 'Ask a question about the inbox.');
  const threads = await listThreads(req.user.id);
  const current = threads.find((t) => t.id === req.body.threadId) ?? null;
  res.json(await askInbox(question, threads, current, contextFor(req.user)));
}));

api.post('/simulate/incoming', requireUser, route(async (req, res) => {
  const thread = await deliverIncoming(req.user);
  if (!thread) return fail(res, 409, 'Connect a mailbox first, then new email can arrive.');
  res.json({ thread });
}));

/* ---------- client view (magic link, no login) ---------- */

async function clientScope(req, res) {
  const [user] = await db.users.find({ clientToken: req.params.token });
  if (!user) fail(res, 404, 'This link is not valid any more. Ask your assistant for a new one.');
  return user;
}

// The rules engine writes about the client in the third person; their own view speaks to them.
const toYou = (t, text) => {
  if (t.ai.engine !== 'rules') return text;
  const name = t.clientFirstName;
  return text.replaceAll(`${name}'s`, 'your').replaceAll(name, 'you');
};
const deadlineOf = (t) => t.ai.events.find((e) => e.kind === 'deadline')?.at ?? '9999';

const forClient = (t) => ({
  id: t.id, subject: t.subject, from: t.from, receivedAt: t.lastMessageAt, summary: toYou(t, t.ai.summary),
  reason: toYou(t, t.ai.reason), keyFacts: t.ai.keyFacts, messages: t.messages, state: t.clientState,
});

api.get('/client/:token', route(async (req, res) => {
  const user = await clientScope(req, res);
  if (!user) return;
  const threads = await listThreads(user.id);
  res.json({
    clientName: user.clientName,
    assistantName: user.name,
    // What still needs the client, plus what they just dealt with (so it can be undone).
    // Soonest deadline first, then whatever has waited longest.
    threads: threads
      .filter((t) => !t.archived && !t.completed && (t.responsibility === 'client' || t.clientState))
      .sort((x, y) => deadlineOf(x).localeCompare(deadlineOf(y)) || x.lastMessageAt.localeCompare(y.lastMessageAt))
      .map((t) => forClient({ ...t, clientFirstName: user.clientName.split(' ')[0] })),
  });
}));

api.post('/client/:token/threads/:id', route(async (req, res) => {
  const user = await clientScope(req, res);
  if (!user) return;
  const thread = await loadThread(req.params.id, user.id);
  if (!thread) return fail(res, 404, 'This conversation is no longer in your list.');
  const at = new Date().toISOString();
  const note = String(req.body.note || '').trim().slice(0, 500);
  const who = user.clientName.split(' ')[0];

  if (req.body.action === 'handled') {
    thread.clientState = { action: 'handled', at };
    thread.override = { responsibility: 'none', by: 'client', at };
    await logActivity(user.id, 'client', `${who} handled “${thread.subject}” personally`, thread.id);
  } else if (req.body.action === 'handover') {
    thread.clientState = { action: 'handover', note, at };
    thread.override = { responsibility: 'assistant', by: 'client', at, note };
    thread.unread = true;
    await logActivity(user.id, 'client', `${who} asked you to take over “${thread.subject}”${note ? `: “${note}”` : ''}`, thread.id);
  } else if (req.body.action === 'undo') {
    thread.clientState = null;
    thread.override = null;
    await logActivity(user.id, 'client', `${who} took “${thread.subject}” back`, thread.id);
  } else {
    return fail(res, 400, 'Unknown action.');
  }
  await db.threads.put(thread);
  res.json({ thread: forClient({ ...present(thread), clientFirstName: who }) });
}));

api.get('/health', (req, res) => res.json({ ok: true, storage: db.mode, engine: engine.id }));
