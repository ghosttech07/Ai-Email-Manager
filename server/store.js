// Persistence. One small collection interface with two backends:
//   - MongoDB through Mongoose when MONGODB_URI is set
//   - an in-memory Map otherwise, so the prototype runs with zero setup
// Everything above this file is backend-agnostic.
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

const matches = (doc, filter) => Object.entries(filter).every(([k, v]) => doc[k] === v);

function memoryCollection() {
  const docs = new Map();
  return {
    async find(filter = {}) {
      return [...docs.values()].filter((d) => matches(d, filter)).map((d) => structuredClone(d));
    },
    async get(id) {
      const d = docs.get(id);
      return d ? structuredClone(d) : null;
    },
    async put(doc) {
      docs.set(doc.id, structuredClone(doc));
      return doc;
    },
    async remove(filter) {
      for (const d of [...docs.values()]) if (matches(d, filter)) docs.delete(d.id);
    },
  };
}

function mongoCollection(name, indexes = []) {
  const schema = new mongoose.Schema(
    { _id: String },
    { strict: false, versionKey: false, minimize: false },
  );
  indexes.forEach((field) => schema.index({ [field]: 1 }));
  const Model = mongoose.model(name, schema);
  const out = (d) => {
    if (!d) return null;
    const { _id, ...rest } = d;
    return { id: _id, ...rest };
  };
  return {
    async find(filter = {}) {
      return (await Model.find(filter).lean()).map(out);
    },
    async get(id) {
      return out(await Model.findById(id).lean());
    },
    async put(doc) {
      const { id, ...rest } = doc;
      await Model.replaceOne({ _id: id }, rest, { upsert: true });
      return doc;
    },
    async remove(filter) {
      await Model.deleteMany(filter);
    },
  };
}

export const db = { mode: 'memory' };

export async function connectStore() {
  const make = config.mongoUri ? mongoCollection : memoryCollection;
  if (config.mongoUri) {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
    db.mode = 'mongodb';
  }
  db.users = make('User', ['email', 'clientToken']);
  db.accounts = make('Account', ['userId']);
  db.threads = make('Thread', ['userId', 'accountId']);
  db.activity = make('Activity', ['userId']);
  return db.mode;
}

export const newId = () => randomUUID();

export async function logActivity(userId, kind, text, threadId = null) {
  await db.activity.put({ id: newId(), userId, kind, text, threadId, at: new Date().toISOString() });
}
