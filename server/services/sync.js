// Simulated mail providers. A real build would exchange an OAuth code for tokens and pull
// messages from the Gmail / Microsoft Graph APIs here; the rest of the app would not change.
// What is real: every message passes through the same classification pipeline.
import { db, newId, logActivity } from '../store.js';
import { buildMailbox } from '../data/mailbox.js';
import { classify, present, contextFor } from './inbox.js';
import { analyzeThreads, BATCH_SIZE } from '../ai/index.js';

export const PROVIDERS = {
  gmail: { name: 'Gmail', company: 'Google', sample: 'meera@kilnandco.example' },
  outlook: { name: 'Outlook', company: 'Microsoft', sample: 'meera.raghavan@outlook.example' },
};

const OUR_ADDRESS = 'office@kilnandco.example';

function toThread(seed, account, user, now) {
  const messages = seed.messages.map((m) => ({
    id: newId(),
    from: { name: m.from[0], email: m.from[1] },
    at: new Date(now - m.h * 36e5).toISOString(),
    body: m.body,
    direction: m.out ? 'out' : 'in',
  }));
  return {
    id: newId(), userId: user.id, accountId: account.id, key: seed.key, provider: account.provider,
    subject: seed.subject, messages, lastMessageAt: messages.at(-1).at,
    unread: !seed.read, important: null, archived: false, completed: false,
    override: null, clientState: null, reclassified: null, ai: null,
  };
}

/**
 * Pull the mailbox for one account and classify each conversation as it lands.
 * `paceMs` spaces the work out so the UI can show real progress during onboarding.
 */
export async function syncAccount(account, user, { paceMs = 0 } = {}) {
  const now = Date.now();
  const seeds = buildMailbox({ now: new Date(now), clientName: user.clientName, assistantName: user.name })[account.provider];
  try {
    await db.threads.remove({ accountId: account.id });
    await db.accounts.put({ ...account, status: 'syncing', progress: { done: 0, total: seeds.length }, error: null });
    // With a model engine, conversations are classified a few per request to respect rate limits.
    for (let start = 0; start < seeds.length; start += BATCH_SIZE) {
      const threads = seeds.slice(start, start + BATCH_SIZE).map((seed) => toThread(seed, account, user, now));
      // A short budget: if the model is busy the rules engine answers now and the backfill upgrades it later.
      const analyses = await analyzeThreads(threads, contextFor(user), { budgetMs: 20_000 });
      for (const [i, thread] of threads.entries()) {
        await db.threads.put({ ...thread, ai: analyses[i] });
        await db.accounts.put({ ...account, status: 'syncing', progress: { done: start + i + 1, total: seeds.length }, error: null });
        if (paceMs) await new Promise((r) => setTimeout(r, paceMs));
      }
    }
    await db.accounts.put({ ...account, status: 'synced', progress: { done: seeds.length, total: seeds.length }, lastSyncedAt: new Date().toISOString(), error: null });
    await logActivity(user.id, 'sync', `${PROVIDERS[account.provider].name} synced: ${seeds.length} conversations classified`);
  } catch (error) {
    console.error('[sync]', error);
    await db.accounts.put({ ...account, status: 'error', error: 'Sync stopped before it finished. Your existing email is untouched.' });
  }
}

/**
 * Self-healing: when the model was busy, conversations were classified by the rules engine so
 * nothing stalled. This revisits them in the background until the model has seen every one.
 */
export function startBackfill() {
  if (BATCH_SIZE === 1) return; // no model engine configured
  const FIRST = 30_000;
  const LONGEST = 10 * 60_000;
  let delay = FIRST;

  async function round() {
    let upgraded = 0;
    try {
      const stale = (await db.threads.find({})).filter((t) => t.ai?.engine === 'rules');
      // The most recently synced workspace first: that is the one somebody is looking at.
      stale.sort((x, y) => y.ai.classifiedAt.localeCompare(x.ai.classifiedAt));
      const userId = stale[0]?.userId;
      const mine = stale.filter((t) => t.userId === userId);
      const user = userId && (await db.users.get(userId));
      // Keep going while the model answers; stop at the first batch it cannot take.
      for (let start = 0; user && start < mine.length && start < 30; start += BATCH_SIZE) {
        const batch = mine.slice(start, start + BATCH_SIZE);
        const before = upgraded;
        const analyses = await analyzeThreads(batch, contextFor(user));
        for (const [i, seen] of batch.entries()) {
          if (analyses[i].engine === 'rules') continue; // still unavailable
          const fresh = await db.threads.get(seen.id);
          // Skip anything that changed meanwhile: a new message has already triggered a fresh decision.
          if (!fresh || fresh.lastMessageAt !== seen.lastMessageAt || fresh.ai.engine !== 'rules') continue;
          await db.threads.put({ ...fresh, ai: analyses[i] });
          upgraded += 1;
        }
        if (upgraded === before) break;
      }
    } catch (error) {
      console.warn('[backfill]', error.message);
    }
    // Back off while the model is unavailable so retries never eat the API quota.
    delay = upgraded ? FIRST : Math.min(delay * 2, LONGEST);
    setTimeout(round, delay).unref();
  }
  setTimeout(round, delay).unref();
}

/** Deliver the next scripted "incoming" email: a reply in an existing thread or a new one. */
export async function deliverIncoming(user) {
  const accounts = (await db.accounts.find({ userId: user.id })).filter((a) => a.status === 'synced');
  if (!accounts.length) return null;
  const threads = await db.threads.find({ userId: user.id });
  const { incoming } = buildMailbox({ clientName: user.clientName, assistantName: user.name });
  const cursor = user.incomingCursor ?? 0;

  // Skip scripted items that cannot land (their thread or mailbox is not connected).
  for (let step = 0; step < incoming.length; step += 1) {
    const item = incoming[(cursor + step) % incoming.length];
    const existing = threads.find((t) => t.key === (item.replyTo ?? item.key));
    const account = item.replyTo ? null : accounts.find((a) => a.provider === item.account) ?? accounts[0];
    if (item.replyTo ? !existing : existing) continue;

    const message = {
      id: newId(), from: { name: item.message.from[0], email: item.message.from[1] },
      at: new Date().toISOString(), body: item.message.body, direction: 'in',
    };
    const thread = existing ?? {
      id: newId(), userId: user.id, accountId: account.id, key: item.key, provider: account.provider,
      subject: item.subject, messages: [], important: null, override: null, clientState: null, reclassified: null, ai: null,
    };
    thread.messages.push(message);
    Object.assign(thread, { lastMessageAt: message.at, unread: true, archived: false, completed: false });
    await classify(thread, user, { announce: true });
    await db.threads.put(thread);
    await db.users.put({ ...user, incomingCursor: cursor + step + 1 });
    return present(thread);
  }
  return null;
}

/** Record a reply the assistant approved. Sending is simulated: nothing leaves the prototype. */
export async function recordReply(thread, user, body) {
  thread.messages.push({
    id: newId(), from: { name: user.name, email: OUR_ADDRESS },
    at: new Date().toISOString(), body, direction: 'out',
  });
  thread.lastMessageAt = thread.messages.at(-1).at;
  thread.unread = false;
  await classify(thread, user);
  await db.threads.put(thread);
  await logActivity(user.id, 'sent', `You replied to ${thread.messages.filter((m) => m.direction === 'in').at(-1)?.from.name ?? 'the sender'} on “${thread.subject}”`, thread.id);
  return present(thread);
}
