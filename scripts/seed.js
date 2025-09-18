const fs = require('fs/promises');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data.json');

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
  const payload = JSON.stringify(DEFAULT_DATA, null, 2);
  await fs.writeFile(DATA_PATH, `${payload}\n`);
  console.log(`Seeded ${DATA_PATH} with default relationship data.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
