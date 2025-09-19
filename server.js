const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();

const API_KEY = process.env.API_KEY || 'dev-key';
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://ncimenian12345_db_user:DolJcDnUSJ9l8Tqr@cluster0.et8ozd5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DATABASE_NAME = process.env.MONGODB_DB || 'relationship-map';

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;
let connectPromise;
let shuttingDown = false;

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

async function getDb() {
  if (db) {
    return db;
  }
  if (!connectPromise) {
    connectPromise = (async () => {
      await client.connect();
      await client.db('admin').command({ ping: 1 });
      console.log('Pinged your deployment. You successfully connected to MongoDB!');
      db = client.db(DATABASE_NAME);
      return db;
    })();
  }
  return connectPromise;
}

async function getCollection(name) {
  const database = await getDb();
  return database.collection(name);
}

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

function normalizeNode(node) {
  const id = sanitizeString(node?.id ?? '');
  const label = sanitizeString(node?.label ?? '');
  const group = sanitizeString(node?.group ?? '');
  const x = toFiniteNumber(node?.x);
  const y = toFiniteNumber(node?.y);
  if (!id || !label || !group || x === null || y === null) {
    return null;
  }
  const normalized = {
    id,
    label,
    group,
    x,
    y,
    description: typeof node?.description === 'string' ? node.description : '',
  };
  const r = toFiniteNumber(node?.r);
  if (r !== null) {
    normalized.r = r;
  }
  if (typeof node?.avatar === 'string' && node.avatar.trim()) {
    normalized.avatar = node.avatar.trim();
  }
  return normalized;
}

function normalizeLink(link) {
  const id = sanitizeString(link?.id ?? '');
  const source = sanitizeString(link?.source ?? '');
  const target = sanitizeString(link?.target ?? '');
  if (!id || !source || !target) {
    return null;
  }
  const type = sanitizeString(link?.type ?? '') || 'solid';
  return { id, source, target, type };
}

function formatGroupDocument(doc) {
  const id = sanitizeString(doc?._id ?? '');
  const label = sanitizeString(doc?.label ?? '');
  const color = sanitizeString(doc?.color ?? '');
  if (!id || !label) {
    return null;
  }
  const group = { label };
  if (color) {
    group.color = color;
  }
  return [id, group];
}

function formatNodeDocument(doc) {
  if (!doc) {
    return null;
  }
  const normalized = normalizeNode({
    ...doc,
    id: doc._id,
  });
  if (!normalized) {
    return null;
  }
  return normalized;
}

function formatLinkDocument(doc) {
  if (!doc) {
    return null;
  }
  const normalized = normalizeLink({
    ...doc,
    id: doc._id,
  });
  if (!normalized) {
    return null;
  }
  return normalized;
}

function toNodeDocument(node) {
  const document = {
    _id: node.id,
    label: node.label,
    group: node.group,
    x: node.x,
    y: node.y,
    description: node.description,
  };
  if (Object.prototype.hasOwnProperty.call(node, 'r')) {
    document.r = node.r;
  }
  if (node.avatar) {
    document.avatar = node.avatar;
  }
  return document;
}

function toLinkDocument(link) {
  return {
    _id: link.id,
    source: link.source,
    target: link.target,
    type: link.type,
  };
}

app.get('/map', async (req, res) => {
  try {
    const database = await getDb();
    const [groupDocs, nodeDocs, linkDocs] = await Promise.all([
      database.collection('groups').find({}).toArray(),
      database.collection('nodes').find({}).toArray(),
      database.collection('links').find({}).toArray(),
    ]);

    const groups = {};
    for (const doc of groupDocs) {
      const entry = formatGroupDocument(doc);
      if (!entry) continue;
      const [groupId, group] = entry;
      groups[groupId] = group;
    }

    const nodes = nodeDocs.map(formatNodeDocument).filter(Boolean);
    const links = linkDocs.map(formatLinkDocument).filter(Boolean);

    res.json({ groups, nodes, links });
  } catch (err) {
    console.error('Failed to load map data', err);
    res.status(500).json({ error: 'Failed to load map data' });
  }
});

app.post('/nodes', async (req, res) => {
  const { id, label, group, x, y, description = '', avatar = null, r = null } = req.body || {};
  if (
    typeof id !== 'string' ||
    typeof label !== 'string' ||
    typeof group !== 'string' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return res.status(400).json({ error: 'id, label, group, x, y required' });
  }
  const trimmedId = id.trim();
  const trimmedLabel = label.trim();
  const trimmedGroup = group.trim();
  if (!trimmedId || !trimmedLabel || !trimmedGroup) {
    return res.status(400).json({ error: 'id, label, group must be non-empty strings' });
  }
  const node = {
    id: trimmedId,
    label: trimmedLabel,
    group: trimmedGroup,
    x,
    y,
    description: typeof description === 'string' ? description : '',
  };
  if (typeof avatar === 'string' && avatar.trim()) {
    node.avatar = avatar.trim();
  }
  if (Number.isFinite(r)) {
    node.r = r;
  }
  try {
    const nodesCollection = await getCollection('nodes');
    const existing = await nodesCollection.findOne({ _id: node.id });
    if (existing) {
      return res.status(409).json({ error: 'Node exists' });
    }
    await nodesCollection.insertOne(toNodeDocument(node));
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Node exists' });
    }
    console.error('Failed to save node', err);
    res.status(500).json({ error: 'Failed to save node' });
  }
});

app.post('/links', async (req, res) => {
  const { id, source, target, type = 'solid' } = req.body || {};
  if (typeof id !== 'string' || typeof source !== 'string' || typeof target !== 'string') {
    return res.status(400).json({ error: 'id, source, target required' });
  }
  const link = {
    id: id.trim(),
    source: source.trim(),
    target: target.trim(),
    type: typeof type === 'string' && type.trim() ? type.trim() : 'solid',
  };
  if (!link.id || !link.source || !link.target) {
    return res.status(400).json({ error: 'id, source, target required' });
  }
  try {
    const linksCollection = await getCollection('links');
    const existing = await linksCollection.findOne({ _id: link.id });
    if (existing) {
      return res.status(409).json({ error: 'Link exists' });
    }
    await linksCollection.insertOne(toLinkDocument(link));
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Link exists' });
    }
    console.error('Failed to save link', err);
    res.status(500).json({ error: 'Failed to save link' });
  }
});

app.patch('/nodes/:id', async (req, res) => {
  const description = typeof req.body?.description === 'string' ? req.body.description : '';
  try {
    const nodesCollection = await getCollection('nodes');
    const result = await nodesCollection.updateOne(
      { _id: req.params.id },
      { $set: { description } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to update node', err);
    res.status(500).json({ error: 'Failed to update node' });
  }
});

async function start() {
  await getDb();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API running on port ${port}`));
}

start().catch((err) => {
  console.error('Failed to start server', err);
  client
    .close()
    .catch((closeErr) => {
      console.error('Error closing MongoDB client during shutdown', closeErr);
    })
    .finally(() => {
      process.exit(1);
    });
});

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  try {
    await client.close();
    console.log(`MongoDB client closed after ${signal}`);
  } catch (err) {
    console.error('Error closing MongoDB client', err);
  } finally {
    process.exit(0);
  }
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});
