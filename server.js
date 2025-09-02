const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const app = express();

const DB_PATH = path.join(__dirname, 'data.db');
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

const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    "group" TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    description TEXT DEFAULT '',
    avatar TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    type TEXT DEFAULT 'solid'
  )`);
});

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

app.get('/map', async (req, res) => {
  const nodes = await dbAll('SELECT id, label, "group" as "group", x, y, description, avatar FROM nodes');
  const links = await dbAll('SELECT id, source, target, type FROM links');
  res.json({ nodes, links });
});

app.post('/nodes', async (req, res) => {
  const { id, label, group, x, y, description = '', avatar = null } = req.body || {};
  if (!id || !label || !group || typeof x !== 'number' || typeof y !== 'number') {
    return res.status(400).json({ error: 'id, label, group, x, y required' });
    }
  try {
    await dbRun(
      'INSERT INTO nodes (id, label, "group", x, y, description, avatar) VALUES (?,?,?,?,?,?,?)',
      [id, label, group, x, y, description, avatar]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err && err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
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
    await dbRun(
      'INSERT INTO links (id, source, target, type) VALUES (?,?,?,?)',
      [id, source, target, type]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err && err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return res.status(409).json({ error: 'Link exists' });
    }
    throw err;
  }
});

app.patch('/nodes/:id', async (req, res) => {
  const { description = '' } = req.body || {};
  const result = await dbRun('UPDATE nodes SET description = ? WHERE id = ?', [description, req.params.id]);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Node not found' });
  }
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on port ${port}`));
