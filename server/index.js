import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { connectStore } from './store.js';
import { engine } from './ai/index.js';
import { api } from './routes.js';
import { startBackfill } from './services/sync.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// In production the same server hosts the built React app.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((error, req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

const storage = await connectStore();
startBackfill();
app.listen(config.port, () => {
  console.log(`Handoff API on http://localhost:${config.port}`);
  console.log(`  storage: ${storage === 'mongodb' ? 'MongoDB' : 'in-memory (set MONGODB_URI to persist)'}`);
  console.log(`  ai:      ${engine.id === 'rules' ? 'built-in rules engine (set GEMINI_API_KEY or ANTHROPIC_API_KEY for a real model)' : `${engine.label} (${engine.model})`}`);
});
