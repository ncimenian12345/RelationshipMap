const fs = require('fs').promises;
const path = require('path');
const { MongoClient } = require('mongodb');

const DATA_PATH = path.join(__dirname, '..', 'data.json');
const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://ncimenian12345_db_user:DolJcDnUSJ9l8Tqr@cluster0.et8ozd5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function main() {
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  const data = JSON.parse(raw);

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('relationshipMap');
  const nodes = db.collection('nodes');
  const links = db.collection('links');

  await nodes.deleteMany({});
  await links.deleteMany({});

  if (data.nodes && data.nodes.length) {
    await nodes.insertMany(
      data.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        group: n.group,
        x: n.x,
        y: n.y,
        description: n.description || '',
        avatar: n.avatar || null,
      }))
    );
  }

  if (data.links && data.links.length) {
    await links.insertMany(
      data.links.map((l) => ({
        id: l.id,
        source: l.source,
        target: l.target,
        type: l.type || 'solid',
      }))
    );
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

