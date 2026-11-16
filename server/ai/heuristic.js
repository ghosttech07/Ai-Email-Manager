// Built-in rule-based engine. It stands in for the LLM when no ANTHROPIC_API_KEY is set, and is
// the fallback when a Claude call fails. It is deliberately explainable: every decision is a
// weighted set of cues found in the conversation, and the cues become the "why" shown in the UI.

const DOW = 'Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const AUTOMATED_SENDER = /^(no-?reply|notifications?|newsletter|digest|updates|mailer|calendar-notification)@/i;
const AUTOMATED_BODY = /unsubscribe|automated (notification|message|update)|do not reply/i;
const RESOLVED = /\b(all set|no change needed|no action (is )?(needed|required)|no need to reply|never mind|for your information only)\b/i;
const URGENT = /\b(overdue|second reminder|final reminder|expires?|urgent|asap|can only hold)\b/i;

const first = (name) => name.split(' ')[0];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Cues are grouped; a group counts once (its heaviest match), so repeats don't inflate a score. */
function cueTable(c, a) {
  const C = esc(c);
  const A = esc(a);
  return [
    // --- things only the client can answer ---
    { side: 'client', group: 'ask', w: 3, cat: 'decision', re: new RegExp(`\\b(?:your|${C}'s) (sign-?off|approval|decision|vote|view|thoughts|input|answer)\\b`, 'i'), label: (m) => `asks for ${c}'s ${m[1].toLowerCase()}` },
    { side: 'client', group: 'ask', w: 1.5, cat: 'decision', re: /\bapprov(e|al)\b/i, label: () => 'needs an approval' },
    { side: 'client', group: 'direct', w: 3, cat: 'decision', re: /\b(need to hear from you|only you can|from you directly|rather not settle)\b/i, label: () => `wants to hear from ${c} directly` },
    { side: 'client', group: 'commercial', w: 2.5, cat: 'decision', re: /\b(term sheet|valuation|board seat|equity|compensation|salary|exclusivity|payment terms)\b/i, label: (m) => `raises a commercial decision (${m[1].toLowerCase()})` },
    { side: 'client', group: 'agree', w: 2, cat: 'decision', re: /\b(would you accept|are you (okay|ok|open|comfortable)|would .{0,20} be open to|shall i go ahead)\b/i, label: () => `wants ${c}'s agreement` },
    { side: 'client', group: 'private', w: 3, cat: 'personal', re: /\b(between us|confidential|personally|in confidence)\b/i, label: () => 'marks it as personal or confidential' },
    { side: 'client', group: 'family', w: 2, cat: 'personal', re: /\b(amma|birthday|family|hosting|call me)\b/i, label: () => 'writes about a family matter' },
    { side: 'client', group: 'named', w: 1.5, cat: null, re: new RegExp(`^(?:hi|dear|hello)?\\s*${C}\\b`, 'im'), label: () => `addresses ${c} by name` },
    // --- routine work the assistant can take ---
    { side: 'assistant', group: 'resched', w: 3, cat: 'scheduling', re: /\b(reschedul\w*|move it to|double-booked)\b/i, label: () => 'wants to reschedule' },
    { side: 'assistant', group: 'logistics', w: 2.5, cat: 'scheduling', re: /\b(availability|pick a slot|book a slot|a slot|calendar invite|headcount|projector|call sheet|agenda)\b/i, label: (m) => `needs scheduling details (${m[1].toLowerCase()})` },
    { side: 'assistant', group: 'confirm', w: 2.5, cat: null, re: /\bconfirm (?:the |your )?(new time|time|headcount|appointment|payment date|they arrived)\b/i, label: () => 'asks for a confirmation' },
    { side: 'assistant', group: 'billing', w: 2, cat: 'billing', re: /\b(invoice|overdue|payment date)\b/i, label: () => 'is chasing a payment' },
    { side: 'assistant', group: 'customer', w: 2.5, cat: 'customer', re: /\b(order #|replacement|refund|chipped|tracking)/i, label: () => 'reports an order problem' },
    { side: 'assistant', group: 'toAssistant', w: 2.5, cat: null, re: new RegExp(`^(?:hi|dear|hello)\\s+${A}\\b`, 'im'), label: () => 'wrote to you directly' },
    { side: 'assistant', group: 'decided', w: 2, cat: null, re: /\balready (said yes|agreed|approved)\b/i, label: () => 'says the decision is already made' },
    { side: 'assistant', group: 'routine', w: 1, cat: null, re: /\bcould you (send|share|confirm|let me know)\b/i, label: () => 'makes a routine request' },
  ];
}

function matchCues(text, table) {
  const best = new Map();
  for (const cue of table) {
    const m = cue.re.exec(text);
    if (!m) continue;
    const prev = best.get(cue.group);
    if (!prev || cue.w > prev.w) best.set(cue.group, { ...cue, text: cue.label(m) });
  }
  return [...best.values()];
}

const total = (cues, side) => cues.filter((x) => x.side === side).reduce((s, x) => s + x.w, 0);
const top = (cues, side, n = 2) => cues.filter((x) => x.side === side).sort((x, y) => y.w - x.w).slice(0, n);
const join = (cues) => cues.map((x) => x.text).join(' and ');

/** Body without the greeting and sign-off, split into sentences. */
function sentences(body) {
  const lines = body.split('\n').map((l) => l.trim());
  const end = lines.findIndex((l) => /^(thanks|regards|best|warmly|kind regards|best regards)[,.!]?$/i.test(l));
  const kept = (end > 0 ? lines.slice(0, end) : lines).filter(
    (l, i) => l && !(i === 0 && /^(hi|dear|hello)\b.*,$|^\w+,$/i.test(l)),
  );
  return kept.join(' ').split(/(?<=[.?!])\s+/).filter((s) => s.length > 3);
}

const clip = (s, n = 190) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function resolveDate(dayNum, monthName, now) {
  const month = MONTHS.findIndex((m) => m.toLowerCase() === monthName.toLowerCase());
  const d = new Date(now.getFullYear(), month, Number(dayNum));
  // An email rarely refers to a date half a year back; assume next year instead.
  if (now - d > 180 * 864e5) d.setFullYear(d.getFullYear() + 1);
  return d;
}

/** Dates, meetings and deadlines written as "Thursday 19 November at 3:00 PM". */
export function extractEvents(body, title, now) {
  const re = new RegExp(`(?:${DOW}),? (\\d{1,2}) (${MONTHS.join('|')})(?:,? at (\\d{1,2})(?::(\\d{2}))? ?(AM|PM))?`, 'gi');
  const events = [];
  for (const sentence of body.split(/(?<=[.?!])\s+|\n/)) {
    for (const m of sentence.matchAll(re)) {
      const at = resolveDate(m[1], m[2], now);
      const timed = Boolean(m[3]);
      if (timed) {
        let h = Number(m[3]) % 12;
        if (m[5].toUpperCase() === 'PM') h += 12;
        at.setHours(h, Number(m[4] || 0));
      } else {
        at.setHours(18, 0);
      }
      const kind = /\b(by|before|until|due|expires?)\b/i.test(sentence)
        ? 'deadline'
        : timed || /\b(meeting|appointment|call|shoot|interview|review)\b/i.test(`${sentence} ${title}`)
          ? 'meeting'
          : 'date';
      events.push({ title, at: at.toISOString(), kind, timed });
    }
  }
  return events;
}

function keyFacts(text, events) {
  const facts = [];
  const amount = text.match(/₹\s?[\d,.]+(?: lakh)?/);
  if (amount) facts.push({ label: 'Amount', value: amount[0] });
  const ref = text.match(/(?:order |invoice )?#[A-Z]{0,3}-?\d+|INV-\d+|reference [A-Z0-9]{5,}/i);
  if (ref) facts.push({ label: 'Reference', value: ref[0].replace(/^reference /i, '') });
  const fmt = (e) =>
    new Date(e.at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(e.timed ? { hour: 'numeric', minute: '2-digit', hour12: true } : {}) });
  const deadline = events.find((e) => e.kind === 'deadline');
  if (deadline) facts.push({ label: 'Deadline', value: fmt(deadline) });
  const meeting = events.find((e) => e.kind !== 'deadline');
  if (meeting) facts.push({ label: 'When', value: fmt(meeting) });
  return facts;
}

const cleanTitle = (subject) => subject.replace(/^(re|fwd|reschedule|invitation|second reminder):\s*/i, '').replace(/^./, (ch) => ch.toUpperCase());

/**
 * Decide who owns the next reply.
 * @returns the analysis object stored on thread.ai
 */
export function analyze(thread, { clientName, assistantName, now = new Date() }) {
  const c = first(clientName);
  const a = first(assistantName);
  const last = thread.messages.at(-1);
  const inbound = thread.messages.filter((m) => m.direction === 'in');
  const lastIn = inbound.at(-1) ?? last;
  const sender = first(lastIn.from.name);
  const text = `${thread.subject}\n${lastIn.body}`;
  const title = cleanTitle(thread.subject);

  const base = {
    responsibility: 'none', confidence: 0.9, reason: '', summary: '', category: 'general',
    action: null, actionRequired: false, important: false, expectsReply: false,
    keyFacts: [], events: [],
  };
  const lines = sentences(lastIn.body);
  const ask = lines.find((s) => /\?|please/i.test(s));

  // 1. We spoke last: nothing to answer, possibly waiting on them.
  if (last.direction === 'out') {
    const expectsReply = /\?|let me know|please confirm/i.test(last.body);
    const question = sentences(last.body).find((s) => s.includes('?'));
    return {
      ...base,
      expectsReply,
      confidence: 0.93,
      category: 'followup',
      reason: expectsReply
        ? `You replied last and asked a question; the next move is ${sender}'s.`
        : 'You sent the last message and it does not ask for anything.',
      summary: expectsReply
        ? `Waiting on ${lastIn.from.name}. You asked: “${clip(question ?? sentences(last.body)[0] ?? '')}”`
        : `You closed this out with ${lastIn.from.name}.`,
      keyFacts: keyFacts(text, []),
    };
  }

  // 2. Machine-sent mail never needs a reply.
  if (AUTOMATED_SENDER.test(lastIn.from.email) || AUTOMATED_BODY.test(lastIn.body)) {
    const events = extractEvents(lastIn.body, title, now);
    const newsletter = /unsubscribe/i.test(lastIn.body);
    return {
      ...base,
      confidence: 0.97,
      category: newsletter ? 'newsletter' : 'notification',
      reason: `${newsletter ? 'Newsletter' : 'Automated notification'} from ${lastIn.from.name}; there is nobody to answer.`,
      summary: clip(lines.slice(0, 2).join(' '), 220),
      events,
      keyFacts: keyFacts(text, events),
    };
  }

  // 3. The sender closed the loop or withdrew the request.
  if (RESOLVED.test(lastIn.body)) {
    return {
      ...base,
      confidence: 0.9,
      category: inbound.length > 1 ? 'resolved' : 'update',
      reason: `${sender} says nothing further is needed, so no reply is required.`,
      summary: `${sender} confirms nothing more is needed. “${clip(lines[0] ?? '')}”`,
      keyFacts: keyFacts(text, []),
    };
  }

  // 4. Weigh the cues. Earlier messages still count, at reduced weight.
  const table = cueTable(c, a);
  const latest = matchCues(text, table);
  const history = matchCues(inbound.slice(0, -1).map((m) => m.body).join('\n'), table).filter(
    (h) => !latest.some((l) => l.group === h.group),
  );
  const score = (side) => total(latest, side) + 0.4 * total(history, side);
  const sa = score('assistant');
  const sc = score('client');
  const hi = Math.max(sa, sc);
  const ratio = hi / (sa + sc || 1);
  const events = extractEvents(lastIn.body, title, now);
  const deadline = events.find((e) => e.kind === 'deadline');
  const soon = deadline && new Date(deadline.at) - now < 5 * 864e5;
  const by = deadline ? ` by ${new Date(deadline.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : '';

  const shared = {
    ...base,
    events,
    keyFacts: keyFacts(text, events),
    important: Boolean(soon) || URGENT.test(text),
    actionRequired: Boolean(deadline) || URGENT.test(text) || latest.some((x) => x.group === 'customer'),
  };
  const quote = ask ? ` “${clip(ask)}”` : '';

  if (hi < 2) {
    // Nothing recognisable. A question still deserves a human look; a statement does not.
    return ask
      ? { ...shared, responsibility: 'review', confidence: 0.4, action: `Decide who replies to ${sender}`,
          reason: `${sender} asks something, but nothing in the email says whether it is for you or for ${c}.`,
          summary: `${sender} is asking a question.${quote}` }
      : { ...shared, confidence: 0.7, category: 'update', actionRequired: false,
          reason: 'Informational: nothing is asked of anyone.', summary: clip(lines.slice(0, 2).join(' '), 220) };
  }

  const side = sa >= sc ? 'assistant' : 'client';
  const lead = top(latest, side);
  const category = top(latest, side, 9).find((x) => x.cat)?.cat ?? 'general';
  const confidence = Math.min(0.97, ratio * 0.72 + (Math.min(hi, 8) / 8) * 0.25);

  if (ratio < 0.65) {
    const other = top(latest, side === 'assistant' ? 'client' : 'assistant', 1);
    const mine = top(latest, 'assistant', 1);
    const theirs = top(latest, 'client', 1);
    return {
      ...shared, responsibility: 'review', confidence: Math.min(confidence, 0.55), category,
      action: `Decide who replies to ${sender}`,
      reason: `Mixed signals: ${sender} ${join(mine)}, but the email also ${join(theirs.length ? theirs : other)}. Check who should answer.`,
      summary: `${sender} ${join(lead.slice(0, 1))}.${quote}`,
    };
  }

  if (side === 'client') {
    return {
      ...shared, responsibility: 'client', confidence, category,
      important: shared.important || hi >= 8,
      action: `${c} to decide${by}`,
      reason: `${sender} ${join(lead)}. That is a call only ${c} can make.`,
      summary: `${sender} ${lead[0].text}.${quote}`,
    };
  }

  const actions = {
    scheduling: events[0] ? `Confirm the time with ${sender}` : `Sort out timing with ${sender}`,
    billing: `Confirm the payment date with ${sender}`,
    customer: `Resolve ${sender}'s order issue`,
  };
  return {
    ...shared, responsibility: 'assistant', confidence, category,
    action: actions[category] ?? `Reply to ${sender}`,
    reason: `${sender} ${join(lead)}. Routine coordination you can handle without ${c}.`,
    summary: `${sender} ${lead[0].text}.${quote}`,
  };
}

/** A reply the assistant can edit. Never sent without their approval. */
export function draftReply(thread, { clientName, assistantName, tone = 'default' }) {
  const c = first(clientName);
  const ai = thread.ai;
  const lastIn = thread.messages.filter((m) => m.direction === 'in').at(-1) ?? thread.messages.at(-1);
  const to = first(lastIn.from.name);
  const when = ai.keyFacts.find((f) => f.label === 'When')?.value;
  const deadline = ai.keyFacts.find((f) => f.label === 'Deadline')?.value;
  const ref = ai.keyFacts.find((f) => f.label === 'Reference')?.value;
  const responsibility = thread.override?.responsibility ?? ai.responsibility;

  let lines;
  if (responsibility === 'client') {
    lines = [`Thank you for your note.`, `${c} has seen this and will reply to you personally${deadline ? ` before ${deadline}` : ' shortly'}.`, `If anything changes on your side in the meantime, do let me know.`];
  } else if (ai.category === 'scheduling') {
    lines = when
      ? [`Thanks for letting me know.`, `${when} works for ${c}, and I have updated the calendar.`, `Please send across the updated details and I'll make sure everything is ready on our side.`]
      : [`Thanks for getting in touch.`, `I'm checking ${c}'s calendar and will send you two or three options by the end of the day.`, `If a particular day suits you best, tell me and I'll start there.`];
  } else if (ai.category === 'billing') {
    lines = [`Thank you for the reminder, and apologies for the delay.`, `I have raised ${ref ?? 'the invoice'} with our accounts team and will confirm the payment date by tomorrow.`, `Please let me know if the bank details have changed since the last payment.`];
  } else if (ai.category === 'customer') {
    lines = [`I'm sorry your order arrived damaged.`, `We will send replacements for the damaged pieces right away at no cost, and there is no need to return anything.`, `I'll share tracking details as soon as they ship.`];
  } else {
    lines = [`Thank you for your email.`, `I'm looking into this and will come back to you with an answer by tomorrow.`, `If it is time-sensitive, please tell me and I'll prioritise it.`];
  }

  if (tone === 'shorter') lines = lines.slice(0, 2);
  if (tone === 'warmer') lines = [`I hope you're having a good week.`, ...lines];
  const formal = tone === 'formal';
  const greeting = formal ? `Dear ${lastIn.from.name},` : `Hi ${to},`;
  const signoff = formal ? 'Kind regards,' : 'Best,';
  return `${greeting}\n\n${lines.slice(0, 1).join(' ')} ${lines.slice(1).join(' ')}\n\n${signoff}\n${assistantName}\nOffice of ${clientName}`;
}

/** Answer a question about the inbox by routing it to the matching view of the data. */
export function ask(question, threads, current, { clientName }) {
  const q = question.toLowerCase();
  const c = first(clientName).toLowerCase();
  const open = threads.filter((t) => !t.archived && !t.completed);
  const list = (items, lead, empty) => ({
    answer: items.length ? `${lead} (${items.length}):\n${items.slice(0, 8).map((t) => `• ${t.from.name} - ${t.subject}`).join('\n')}` : empty,
    threadIds: items.slice(0, 8).map((t) => t.id),
  });

  if (current && /\bwhy\b/.test(q)) {
    const who = { assistant: 'you', client: clientName, none: 'nobody', review: 'you, to review' }[current.responsibility];
    const how = current.override ? `This was set manually by ${current.override.by === 'client' ? clientName : 'you'}. The AI's original reasoning: ` : '';
    return { answer: `Assigned to ${who} (${Math.round(current.ai.confidence * 100)}% confident). ${how}${current.ai.reason}`, threadIds: [current.id] };
  }
  if (current && /summar/.test(q)) {
    const facts = current.ai.keyFacts.map((f) => `${f.label}: ${f.value}`).join(' · ');
    return { answer: `${current.ai.summary}${facts ? `\n${facts}` : ''}`, threadIds: [current.id] };
  }
  if (current && /\b(draft|write)\b/.test(q)) return { answer: 'I drafted a reply below. Review and edit it before sending.', threadIds: [current.id], draft: true };
  if (/waiting/.test(q)) return list(open.filter((t) => t.waiting), 'You are waiting for a response on', 'Nothing is waiting on anyone else right now.');
  if (new RegExp(`client|${c}`).test(q)) return list(open.filter((t) => t.responsibility === 'client'), `Needs ${clientName}'s personal attention`, `Nothing needs ${clientName} right now.`);
  if (/meeting|appointment|calendar|schedul/.test(q)) return list(open.filter((t) => t.segments.includes('meetings')), 'Meetings and scheduling', 'No meeting-related email in the inbox.');
  if (/deadline|due|urgent|action/.test(q)) return list(open.filter((t) => t.segments.includes('action')), 'Time-sensitive', 'Nothing time-sensitive right now.');
  if (/unread/.test(q)) return list(open.filter((t) => t.unread), 'Unread', 'Everything is read.');
  if (/important/.test(q)) return list(open.filter((t) => t.segments.includes('important')), 'Important', 'Nothing is marked important.');
  if (/attention|need me|\bmy\b|\bi\b.*repl/.test(q)) {
    return list(open.filter((t) => ['assistant', 'review'].includes(t.responsibility)), 'These need you', 'You are all caught up.');
  }

  const words = q.split(/\W+/).filter((w) => w.length > 3 && !['show', 'emails', 'email', 'about', 'from', 'what', 'which', 'with', 'that', 'have'].includes(w));
  const hits = open.filter((t) => words.some((w) => `${t.subject} ${t.from.name} ${t.messages.map((m) => m.body).join(' ')}`.toLowerCase().includes(w)));
  return list(hits, `Conversations mentioning “${words.join(' ')}”`, 'I could not find a matching conversation. Try asking what needs your attention, what you are waiting on, or what needs the client.');
}
