const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'relationship-map';

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
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const db = client.db(MONGODB_DB);
    const groups = db.collection('groups');
    const nodes = db.collection('nodes');
    const links = db.collection('links');

    await Promise.all([
      groups.deleteMany({}),
      nodes.deleteMany({}),
      links.deleteMany({}),
    ]);

    const groupDocs = Object.entries(DEFAULT_DATA.groups).map(([id, value]) => ({
      _id: id,
      ...value,
    }));
    if (groupDocs.length) {
      await groups.insertMany(groupDocs);
    }

    const nodeDocs = DEFAULT_DATA.nodes.map(({ id, ...rest }) => ({
      _id: id,
      ...rest,
    }));
    if (nodeDocs.length) {
      await nodes.insertMany(nodeDocs);
    }

    const linkDocs = DEFAULT_DATA.links.map(({ id, ...rest }) => ({
      _id: id,
      ...rest,
    }));
    if (linkDocs.length) {
      await links.insertMany(linkDocs);
    }

    console.log(`Seeded MongoDB database "${MONGODB_DB}" with demo relationship data.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
