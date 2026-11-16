# Handoff

AI email triage for personal assistants and the clients they work for.

An assistant's real problem is not reading email, it is knowing **who owes the reply**. Handoff reads a client's inbox and sorts every conversation three ways: the assistant replies, the client replies, or nobody needs to. When it cannot tell, it says so and asks the assistant instead of guessing. The client gets a separate, bare page that lists only the few emails that need them.

Stack: MongoDB, Express, React, Node (MERN), with Google Gemini or Claude for the AI.

## Run it

```bash
npm install
npm run build
npm start
```

Open http://localhost:4000 and choose **Explore the demo workspace**, or create an account to go through onboarding.

No configuration is needed. With nothing set, data lives in memory and a built-in rules engine does the AI work. Copy `.env.example` to `.env` to change that:

| Variable | Effect |
| --- | --- |
| `MONGODB_URI` | Persist to MongoDB (for example a free Atlas cluster). Unset: in-memory, resets on restart. |
| `GEMINI_API_KEY` | Use Google Gemini (free tier) for classification, summaries, drafts and questions. |
| `GEMINI_MODEL` | Gemini model id. Default `gemini-3.5-flash-lite`; other models are tried automatically when one is busy. |
| `ANTHROPIC_API_KEY` | Use Claude instead. With neither key set, the rules engine runs. |
| `AI_MODEL` | Claude model id. Default `claude-opus-5-5`. |
| `JWT_SECRET` | Signs login tokens. Set a long random value in production. |

For development with hot reload: `npm run dev` (API on 4000, Vite on 5173). Tests: `npm test`.

## Deploy

One Node service hosts both the API and the built React app.

1. Push this folder to a GitHub repository.
2. On Render: **New > Blueprint**, pick the repository. `render.yaml` sets the build and start commands and generates `JWT_SECRET`.
3. Optional: create a free MongoDB Atlas cluster and paste its connection string as `MONGODB_URI`; add `ANTHROPIC_API_KEY` for Claude.

Any Node host works the same way: build with `npm install && npm run build`, start with `npm start`.

## What to try

| Journey | Where |
| --- | --- |
| Sign up, connect Gmail or Outlook, watch the inbox get sorted live | Create account |
| See who owns every reply at a glance | Overview |
| Work a segment; search and filter without losing the open conversation | Inbox and the sidebar |
| Read the AI brief: summary, reason, confidence, key facts | Any conversation |
| Correct the AI, or ask it to look again | The owner tag on a conversation |
| Draft with AI, edit, change tone, approve and send | Bottom of a conversation |
| Watch the AI reconsider when a reply arrives | **Simulate new email** (top bar), five scripted arrivals |
| Ask the inbox a question | **Ask** (top bar), or Ctrl+J |
| Be the client: handle it, or hand it back with a note | **Open Meera's view** (sidebar) |
| See the client's action land on the assistant's side | Overview > Activity, and the conversation itself |

## How the AI works

Every conversation goes through one pipeline (`server/ai/index.js`), on arrival and again whenever a new message lands in it:

- **Input**: the whole conversation, not just the last message, plus who the client and assistant are.
- **Output** (structured, schema-validated): owner (`assistant`, `client`, `none`, `review`), confidence, a one-line reason, a summary, category, next action, key facts, and any meetings or deadlines.
- **Not guessing**: below 60% confidence the owner becomes `review`.
- **Not inventing work**: newsletters, receipts, FYI notes, resolved threads and threads where we spoke last are `none`.
- **Corrections stick** until new information arrives; then the AI decides again and the change is logged.
- **Replies are never sent automatically**: a draft must be reviewed and approved.

If the model is busy or a call fails, the rules engine answers immediately so nothing stalls, and a background job re-runs those conversations through the model once it is available.

Three engines implement that contract (Gemini, Claude, rules):

- **Claude** (`ANTHROPIC_API_KEY` set): structured outputs for classification and Q&A, plain text for drafts, a cached system prompt, and email content treated as data, never as instructions.
- **Rules engine** (`server/ai/heuristic.js`, the default and the fallback if a Claude call fails): weighted cues in the text; the cues that fired become the reason shown to the user. `npm test` checks all 23 sample conversations and the reclassification cases against it.

## What is simulated

| Area | In this prototype | In production |
| --- | --- | --- |
| Gmail / Outlook connection | A consent dialog and a sample mailbox | OAuth, then the Gmail API and Microsoft Graph (`server/services/sync.js` is the seam) |
| Incoming email | The **Simulate new email** button | Provider push notifications or polling |
| Sending | The reply is stored and the thread reclassified; nothing leaves the app | Send through the provider API |
| AI without an API key | The rules engine | Claude |
| Client access | An unguessable private link | The same link behind a one-time code or SSO |

The sample mailbox (`server/data/mailbox.js`) is not pre-labelled: every email is classified by the same pipeline live mail would use, and dates are generated relative to today.

## Structure

```
server/
  index.js            Express app; serves the built client in production
  routes.js           Auth, mailboxes, inbox, AI, client view
  store.js            One collection interface: Mongoose or in-memory
  ai/                 Claude engine, rules engine, tests
  services/inbox.js   Effective owner, waiting state, segments (single source of truth)
  services/sync.js    Simulated providers, incoming email, sending
  data/mailbox.js     Sample conversations
client/src/
  state.jsx           Session, inbox (polled), toasts
  components/         Shell, Ask panel, connect dialog, shared UI
  pages/              Welcome, Onboarding, Overview, Inbox, Settings, ClientView
  styles.css          Design tokens and components
```

## Design notes

- **One colour job.** Colour means who owns the reply: teal for the assistant, amber for the client, blue for "needs review", grey for nobody. Nothing else on the screen is coloured.
- **One question per screen.** Overview answers "who owes a reply right now?"; its largest element is the handoff bar. The client view answers "what needs me?" and has no navigation at all.
- **States.** Loading keeps the final layout, errors appear inside the block that failed with a retry, and every empty segment says what would appear there.
- **Phone.** The sidebar folds into a menu, the inbox shows one region at a time, and the client view is built phone-first.

## Demo video outline

1. The problem in one line, then sign up and connect Gmail (point out the "simulated" notice).
2. Overview: the handoff bar, the finding sentence, Start replying.
3. A conversation: AI brief, reason, confidence; draft, change tone, approve and send.
4. Needs review: why the AI was unsure; correct it.
5. Simulate new email twice: a waiting thread comes back, a request is withdrawn.
6. Ask: "What am I waiting for a response on?"
7. The client's view on a phone: hand one over with a note, handle another.
8. Back to the assistant: Activity and the handed-over conversation.
9. Settings: what is simulated and what comes next.
