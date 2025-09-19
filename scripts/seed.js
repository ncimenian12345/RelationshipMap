const { MongoClient, ServerApiVersion } = require('mongodb');

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

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const DEFAULT_DATA = {
  groups: {
    team: { label: 'The Team', color: '#5B8DEF' },
    planters: { label: 'The Planters', color: '#44C4A1' },
    scientists: { label: 'The Scientists', color: '#FF9171' },
    main: { label: 'The Main Guy', color: '#9B7DFF' },
  },
  nodes: [
    {
      id: 'main',
      label: 'The Main Guy',
      group: 'main',
      x: 400,
      y: 340,
      r: 56,
      description: '',
      avatar: '/avatars/main-guy.jpeg',
    },
    {
      id: 't1',
      label: 'Ari',
      group: 'team',
      x: 160,
      y: 145,
      description: '',
      avatar: '/avatars/ari.jpeg',
    },
    {
      id: 't2',
      label: 'Moe',
      group: 'team',
      x: 230,
      y: 170,
      description: '',
      avatar: '/avatars/moe.jpeg',
    },
    {
      id: 't3',
      label: 'Ned',
      group: 'team',
      x: 300,
      y: 160,
      description: '',
      avatar: '/avatars/ned.jpeg',
    },
    {
      id: 't4',
      label: 'Lee',
      group: 'team',
      x: 90,
      y: 240,
      description: '',
      avatar: '/avatars/lee.jpeg',
    },
    {
      id: 'p1',
      label: 'Ivy',
      group: 'planters',
      x: 660,
      y: 210,
      description: '',
      avatar: '/avatars/ivy.jpeg',
    },
    {
      id: 'p2',
      label: 'Bud',
      group: 'planters',
      x: 700,
      y: 340,
      description: '',
      avatar: '/avatars/bud.jpeg',
    },
    {
      id: 's1',
      label: 'Ada',
      group: 'scientists',
      x: 220,
      y: 520,
      description: '',
      avatar: '/avatars/ada.jpeg',
    },
    {
      id: 's2',
      label: 'Bo',
      group: 'scientists',
      x: 120,
      y: 620,
      description: '',
      avatar: '/avatars/bo.jpeg',
    },
    {
      id: 's3',
      label: 'Cy',
      group: 'scientists',
      x: 360,
      y: 610,
      description: '',
      avatar: '/avatars/cy.jpeg',
    },
  ],
  links: [
    { id: 'l1', source: 't1', target: 'main', type: 'dashed' },
    { id: 'l2', source: 't3', target: 'main', type: 'dashed' },
    { id: 'l3', source: 't4', target: 's2', type: 'solid' },
    { id: 'l4', source: 'p1', target: 'main', type: 'curved' },
    { id: 'l5', source: 'p2', target: 'main', type: 'curved' },
    { id: 'l6', source: 's1', target: 's2', type: 'solid' },
    { id: 'l7', source: 's1', target: 'main', type: 'dashed' },
  ],
};

async function main() {
  await client.connect();
  try {
    await client.db('admin').command({ ping: 1 });
    console.log('Pinged your deployment. You successfully connected to MongoDB!');

    const database = client.db(DATABASE_NAME);
    const groupsCollection = database.collection('groups');
    const nodesCollection = database.collection('nodes');
    const linksCollection = database.collection('links');

    const groupDocs = Object.entries(DEFAULT_DATA.groups).reduce((docs, [id, value]) => {
      const groupId = sanitizeString(id);
      const label = sanitizeString(value?.label);
      if (!groupId || !label) {
        return docs;
      }
      const group = { _id: groupId, label };
      const color = sanitizeString(value?.color);
      if (color) {
        group.color = color;
      }
      docs.push(group);
      return docs;
    }, []);

    const nodeDocs = DEFAULT_DATA.nodes.reduce((docs, node) => {
      const id = sanitizeString(node?.id);
      const label = sanitizeString(node?.label);
      const group = sanitizeString(node?.group);
      const x = toFiniteNumber(node?.x);
      const y = toFiniteNumber(node?.y);
      if (!id || !label || !group || x === null || y === null) {
        return docs;
      }
      const doc = {
        _id: id,
        label,
        group,
        x,
        y,
        description: typeof node?.description === 'string' ? node.description : '',
      };
      const radius = toFiniteNumber(node?.r);
      if (radius !== null) {
        doc.r = radius;
      }
      const avatar = sanitizeString(node?.avatar);
      if (avatar) {
        doc.avatar = avatar;
      }
      docs.push(doc);
      return docs;
    }, []);

    const linkDocs = DEFAULT_DATA.links.reduce((docs, link) => {
      const id = sanitizeString(link?.id);
      const source = sanitizeString(link?.source);
      const target = sanitizeString(link?.target);
      if (!id || !source || !target) {
        return docs;
      }
      const type = sanitizeString(link?.type) || 'solid';
      docs.push({ _id: id, source, target, type });
      return docs;
    }, []);

    await Promise.all([
      groupsCollection.deleteMany({}),
      nodesCollection.deleteMany({}),
      linksCollection.deleteMany({}),
    ]);

    if (groupDocs.length) {
      await groupsCollection.insertMany(groupDocs);
    }
    if (nodeDocs.length) {
      await nodesCollection.insertMany(nodeDocs);
    }
    if (linkDocs.length) {
      await linksCollection.insertMany(linkDocs);
    }

    console.log(`Seeded MongoDB database "${DATABASE_NAME}" with default relationship data.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Failed to seed MongoDB with default relationship data.', err);
  process.exit(1);
});
