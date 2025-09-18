const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();

const DATA_FILE = path.join(__dirname, 'data.json');
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

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let state = { groups: {}, nodes: [], links: [] };
let persistQueue = Promise.resolve();

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

function normalizeState(raw) {
  const groups = raw && typeof raw.groups === 'object' && raw.groups !== null ? raw.groups : {};
  const nodes = Array.isArray(raw?.nodes)
    ? raw.nodes.map(normalizeNode).filter(Boolean)
    : [];
  const links = Array.isArray(raw?.links)
    ? raw.links.map(normalizeLink).filter(Boolean)
    : [];
  return { groups, nodes, links };
}

async function writeState(next) {
  const payload = JSON.stringify(next, null, 2);
  await fs.writeFile(DATA_FILE, `${payload}\n`);
  state = next;
}

function enqueueMutation(mutator) {
  let result;
  const op = persistQueue
    .catch((err) => {
      console.error('Previous persistence operation failed', err);
    })
    .then(async () => {
      const { next, value } = await mutator(state);
      if (!next || typeof next !== 'object') {
        throw new Error('Mutation must return an object with a `next` state');
      }
      await writeState(next);
      result = value;
    });
  persistQueue = op;
  return op.then(() => result);
}

async function loadState() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    state = normalizeState(parsed);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      state = { groups: {}, nodes: [], links: [] };
      await writeState(state);
    } else {
      console.error('Failed to load data file', err);
      throw err;
    }
  }
}

app.get('/map', (req, res) => {
  res.json(state);
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
    await enqueueMutation((current) => {
      if (current.nodes.some((n) => n.id === node.id)) {
        throw new HttpError(409, 'Node exists');
      }
      return {
        next: {
          ...current,
          nodes: [...current.nodes, node],
        },
      };
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
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
    await enqueueMutation((current) => {
      if (current.links.some((l) => l.id === link.id)) {
        throw new HttpError(409, 'Link exists');
      }
      return {
        next: {
          ...current,
          links: [...current.links, link],
        },
      };
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Failed to save link', err);
    res.status(500).json({ error: 'Failed to save link' });
  }
});

app.patch('/nodes/:id', async (req, res) => {
  const description = typeof req.body?.description === 'string' ? req.body.description : '';
  try {
    await enqueueMutation((current) => {
      const idx = current.nodes.findIndex((n) => n.id === req.params.id);
      if (idx === -1) {
        throw new HttpError(404, 'Node not found');
      }
      const nodes = current.nodes.slice();
      nodes[idx] = { ...nodes[idx], description };
      return {
        next: {
          ...current,
          nodes,
        },
      };
    });
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
  await loadState();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API running on port ${port}`));
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
