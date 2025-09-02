const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '..', 'data.db');
const DATA_PATH = path.join(__dirname, '..', 'data.json');

async function main() {
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  const data = JSON.parse(raw);
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
    const insertNode = db.prepare('INSERT OR REPLACE INTO nodes (id, label, "group", x, y, description, avatar) VALUES (?,?,?,?,?,?,?)');
    for (const n of data.nodes) {
      insertNode.run(n.id, n.label, n.group, n.x, n.y, n.description || '', n.avatar || null);
    }
    insertNode.finalize();
    const insertLink = db.prepare('INSERT OR REPLACE INTO links (id, source, target, type) VALUES (?,?,?,?)');
    for (const l of data.links) {
      insertLink.run(l.id, l.source, l.target, l.type || 'solid');
    }
    insertLink.finalize();
  });
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
