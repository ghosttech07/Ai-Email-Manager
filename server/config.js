import 'dotenv/config';
import { randomBytes } from 'node:crypto';

// Times written in emails ("Thursday at 10:00 AM") are the client's local time. Hosts such as
// Render run on UTC, which would shift every extracted meeting, so the server works in the
// client's time zone. Set CLIENT_TIMEZONE to an IANA name to change it.
process.env.TZ = process.env.CLIENT_TIMEZONE || 'Asia/Kolkata';

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || '',
  geminiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  // 'gemini' or 'claude' to force one when both keys are set; empty picks Gemini first.
  aiProvider: (process.env.AI_PROVIDER || '').toLowerCase(),
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-opus-5-5',
  // Without a configured secret, tokens only live as long as this process.
  jwtSecret: process.env.JWT_SECRET || randomBytes(32).toString('hex'),
};
