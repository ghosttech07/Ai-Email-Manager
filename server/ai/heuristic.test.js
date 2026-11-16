// Guards the triage behaviour the product promises: every sample conversation lands with the
// owner a careful human would pick, and a new message can change that decision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMailbox } from '../data/mailbox.js';
import { analyze } from './heuristic.js';

const ctx = { clientName: 'Meera Raghavan', assistantName: 'Ananya Iyer', now: new Date() };
const box = buildMailbox(ctx);
const seeds = [...box.gmail, ...box.outlook];

const toThread = (seed, extra = []) => ({
  subject: seed.subject,
  messages: [...seed.messages, ...extra].map((m) => ({
    from: { name: m.from[0], email: m.from[1] }, body: m.body, direction: m.out ? 'out' : 'in',
  })),
});
const owner = (key, extra) => analyze(toThread(seeds.find((s) => s.key === key), extra), ctx);

const expected = {
  assistant: ['shoot', 'room', 'chipped', 'overdue', 'clinic'],
  client: ['gst', 'wholesale', 'investor', 'offer', 'family', 'board'],
  review: ['interview', 'returns', 'school'],
  none: ['paid', 'newsletter', 'courier', 'distributor', 'packaging', 'calendar', 'settlement', 'flight', 'digest'],
};

for (const [responsibility, keys] of Object.entries(expected)) {
  for (const key of keys) {
    test(`${key} -> ${responsibility}`, () => assert.equal(owner(key).responsibility, responsibility));
  }
}

test('every sample conversation is covered', () => {
  assert.equal(Object.values(expected).flat().length, seeds.length);
});

test('a thread we answered last is waiting, not actionable', () => {
  assert.equal(owner('distributor').expectsReply, true);
});

test('a new message changes the decision', () => {
  const reply = (key) => box.incoming.find((i) => i.replyTo === key).message;
  assert.equal(owner('distributor', [reply('distributor')]).responsibility, 'assistant');
  assert.equal(owner('interview', [reply('interview')]).responsibility, 'assistant');
  assert.equal(owner('shoot', [reply('shoot')]).responsibility, 'none');
});

test('new arrivals are routed', () => {
  const fresh = (key) => {
    const item = box.incoming.find((i) => i.key === key);
    return analyze(toThread({ subject: item.subject, messages: [item.message] }), ctx).responsibility;
  };
  assert.equal(fresh('venue'), 'client');
  assert.equal(fresh('expo'), 'none');
});

test('deadlines and meetings are extracted', () => {
  assert.ok(owner('gst').events.some((e) => e.kind === 'deadline'));
  assert.ok(owner('room').events.some((e) => e.kind === 'meeting' && e.timed));
});
