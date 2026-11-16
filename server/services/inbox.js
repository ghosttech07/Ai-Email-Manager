// Turns a stored thread into what the UI needs: the effective owner (AI decision or a manual
// override), the waiting state and segment membership. Kept in one place so the assistant
// dashboard, the client view and the AI Q&A can never disagree about a thread.
import { db, logActivity } from '../store.js';
import { analyzeThread } from '../ai/index.js';

export const OWNER_LABEL = { assistant: 'Assistant to reply', client: 'Client to reply', none: 'No reply needed', review: 'Needs review' };

export function present(thread) {
  const responsibility = thread.override?.responsibility ?? thread.ai.responsibility;
  const last = thread.messages.at(-1);
  const lastIn = thread.messages.filter((m) => m.direction === 'in').at(-1) ?? last;
  const waiting = last.direction === 'out' && Boolean(thread.ai.expectsReply);
  const important = thread.important ?? thread.ai.important;
  const open = !thread.archived && !thread.completed;
  const meeting = thread.ai.category === 'scheduling' || thread.ai.events.some((e) => e.kind === 'meeting');

  const segments = [];
  if (open) {
    segments.push('inbox', responsibility);
    if (thread.ai.actionRequired && responsibility !== 'none') segments.push('action');
    if (waiting) segments.push('waiting');
    if (meeting) segments.push('meetings');
    if (important) segments.push('important');
    if (segments.length === 2 && responsibility === 'none') segments.push('general');
  } else {
    segments.push(thread.completed ? 'done' : 'archived');
  }

  return { ...thread, responsibility, waiting, important, segments, from: lastIn.from };
}

export const contextFor = (user) => ({ clientName: user.clientName, assistantName: user.name, now: new Date() });

/** (Re)run the AI on a thread. Any manual override is dropped: new information, fresh decision. */
export async function classify(thread, user, { announce = false } = {}) {
  const before = thread.ai ? (thread.override?.responsibility ?? thread.ai.responsibility) : null;
  thread.ai = await analyzeThread(thread, contextFor(user));
  thread.override = null;
  thread.clientState = null;
  const after = thread.ai.responsibility;
  if (announce && before && before !== after) {
    thread.reclassified = { from: before, to: after, at: new Date().toISOString() };
    await logActivity(user.id, 'reclassified', `AI moved “${thread.subject}” from ${OWNER_LABEL[before]} to ${OWNER_LABEL[after]} after a new message`, thread.id);
  }
  return thread;
}

export async function loadThread(id, userId) {
  const thread = await db.threads.get(id);
  return thread && thread.userId === userId ? thread : null;
}

export async function listThreads(userId) {
  const threads = await db.threads.find({ userId });
  return threads.map(present).sort((x, y) => y.lastMessageAt.localeCompare(x.lastMessageAt));
}
