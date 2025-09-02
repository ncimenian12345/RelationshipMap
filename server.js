const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();

const DATA_PATH = path.join(__dirname, 'data.json');
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

async function readData() {
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  return JSON.parse(raw);
}
async function writeData(data) {
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2));
}

app.get('/map', async (req, res) => {
  const data = await readData();
  res.json(data);
});

app.post('/nodes', async (req, res) => {
  const { id, label, group, x, y, description = '', avatar = null } = req.body || {};
  if (!id || !label || !group || typeof x !== 'number' || typeof y !== 'number') {
    return res.status(400).json({ error: 'id, label, group, x, y required' });
  }
  const data = await readData();
  if (data.nodes.some((n) => n.id === id)) {
    return res.status(409).json({ error: 'Node exists' });
  }
  data.nodes.push({ id, label, group, x, y, description, avatar });
  await writeData(data);
  res.status(201).json({ ok: true });
});

app.post('/links', async (req, res) => {
  const { id, source, target, type = 'solid' } = req.body || {};
  if (!id || !source || !target) {
    return res.status(400).json({ error: 'id, source, target required' });
  }
  const data = await readData();
  if (data.links.some((l) => l.id === id)) {
    return res.status(409).json({ error: 'Link exists' });
  }
  data.links.push({ id, source, target, type });
  await writeData(data);
  res.status(201).json({ ok: true });
});

app.patch('/nodes/:id', async (req, res) => {
  const { description = '' } = req.body || {};
  const data = await readData();
  const node = data.nodes.find((n) => n.id === req.params.id);
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }
  node.description = description;
  await writeData(data);
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on port ${port}`));

