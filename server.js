const express = require('express');
const { MongoClient } = require('mongodb');
const app = express();

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://ncimenian12345_db_user:DolJcDnUSJ9l8Tqr@cluster0.et8ozd5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const API_KEY = process.env.API_KEY || 'dev-key';

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function auth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.split(' ')[1];
  if (token !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use(auth);

let nodesCollection;
let linksCollection;

async function initDb() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('relationshipMap');
  nodesCollection = db.collection('nodes');
  linksCollection = db.collection('links');
  await nodesCollection.createIndex({ id: 1 }, { unique: true });
  await linksCollection.createIndex({ id: 1 }, { unique: true });
}

app.get('/map', async (req, res) => {
  const nodes = await nodesCollection.find({}, { projection: { _id: 0 } }).toArray();
  const links = await linksCollection.find({}, { projection: { _id: 0 } }).toArray();
  res.json({ nodes, links });
});

app.post('/nodes', async (req, res) => {
  const { id, label, group, x, y, description = '', avatar = null } = req.body || {};
  if (!id || !label || !group || typeof x !== 'number' || typeof y !== 'number') {
    return res.status(400).json({ error: 'id, label, group, x, y required' });
  }
  try {
    await nodesCollection.insertOne({ id, label, group, x, y, description, avatar });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Node exists' });
    }
    throw err;
  }
});

app.post('/links', async (req, res) => {
  const { id, source, target, type = 'solid' } = req.body || {};
  if (!id || !source || !target) {
    return res.status(400).json({ error: 'id, source, target required' });
  }
  try {
    await linksCollection.insertOne({ id, source, target, type });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Link exists' });
    }
    throw err;
  }
});

app.patch('/nodes/:id', async (req, res) => {
  const { description = '' } = req.body || {};
  const result = await nodesCollection.updateOne(
    { id: req.params.id },
    { $set: { description } }
  );
  if (result.matchedCount === 0) {
    return res.status(404).json({ error: 'Node not found' });
  }
  res.json({ ok: true });
});

async function start() {
  await initDb();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API running on port ${port}`));
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
