const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();

const API_KEY = process.env.API_KEY || 'dev-key';
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://Vercel-Admin-relationship-map:zgivlkrP37H67Opj@relationship-map.sxtr2sd.mongodb.net/?retryWrites=true&w=majority&appName=relationship-map';
const MONGODB_DB = process.env.MONGODB_DB || 'relationship-map';

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

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const client = new MongoClient(MONGODB_URI);
let collectionsPromise;

function getCollections() {
  if (!collectionsPromise) {
    collectionsPromise = client
      .connect()
      .then(() => {
        const db = client.db(MONGODB_DB);
        return {
          groups: db.collection('groups'),
          nodes: db.collection('nodes'),
          links: db.collection('links'),
        };
      })
      .catch((err) => {
        collectionsPromise = null;
        throw err;
      });
  }
  return collectionsPromise;
}

const documentToNode = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
};

const documentToLink = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
};

async function fetchMapData() {
  const { groups, nodes, links } = await getCollections();
  const [groupDocs, nodeDocs, linkDocs] = await Promise.all([
    groups.find({}).toArray(),
    nodes.find({}).toArray(),
    links.find({}).toArray(),
  ]);

  const groupsMap = {};
  for (const doc of groupDocs) {
    if (!doc || typeof doc._id !== 'string') continue;
    const { _id, ...rest } = doc;
    groupsMap[_id] = rest;
  }

  return {
    groups: groupsMap,
    nodes: nodeDocs.map(documentToNode).filter(Boolean),
    links: linkDocs.map(documentToLink).filter(Boolean),
  };
}

async function insertNode(node) {
  const { nodes } = await getCollections();
  await nodes.insertOne({
    _id: node.id,
    label: node.label,
    group: node.group,
    x: node.x,
    y: node.y,
    description: node.description,
    ...(typeof node.avatar === 'string' && node.avatar ? { avatar: node.avatar } : {}),
    ...(Number.isFinite(node.r) ? { r: node.r } : {}),
  });
}

async function insertLink(link) {
  const { links } = await getCollections();
  await links.insertOne({
    _id: link.id,
    source: link.source,
    target: link.target,
    type: link.type,
  });
}

async function updateNodeDescription(id, description) {
  const { nodes } = await getCollections();
  const result = await nodes.updateOne(
    { _id: id },
    { $set: { description } }
  );
  if (result.matchedCount === 0) {
    throw new HttpError(404, 'Node not found');
  }
}

app.get('/map', async (req, res) => {
  try {
    const map = await fetchMapData();
    res.json(map);
  } catch (err) {
    console.error('Failed to load map', err);
    res.status(500).json({ error: 'Failed to load map' });
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
    await insertNode(node);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
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
    await insertLink(link);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
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
    await updateNodeDescription(req.params.id, description);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Failed to update node', err);
    res.status(500).json({ error: 'Failed to update node' });
  }
});

async function start() {
  await getCollections();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API running on port ${port}`));
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
