const { runWithRetry, resetClient, constants } = require('../lib/mongo');

const { MONGODB_DB } = constants;

const DEFAULT_DATA = {
  groups: {
    team: { label: 'Competitors', color: '#5B8DEF' },
    planters: { label: 'Suppliers', color: '#44C4A1' },
    scientists: { label: 'Manufacturers', color: '#FF9171' },
    main: { label: 'Noah', color: '#9B7DFF' },
  },
  nodes: [
    {
      id: 'main',
      label: 'Noah',
      group: 'main',
      x: 400,
      y: 340,
      r: 56,
      description:
        "Noah-The ice seller who keeps the whole network running. Without him, Bud and Ivy wouldn't have a reason to supply ice, and ADA, Cy, Bo, and Lee wouldn't be moving as much product from the manufacturing side. He's at the center of the supply chain, managing deals, negotiating with suppliers, and figuring out how to stay ahead of competitors like Moe, Ari, and Ned.",
      avatar: '/avatars/main-guy.jpeg',
    },
    {
      id: 't1',
      label: 'Ari',
      group: 'team',
      x: 160,
      y: 145,
      description:
        "Ari - Ari runs a rival ice operation and loves to brag about outselling Noah, which drives Noah crazy; their rivalry fuels most of Noah's motivation to outdo everyone else.",
      avatar: '/avatars/ari.jpeg',
    },
    {
      id: 't2',
      label: 'Moe',
      group: 'team',
      x: 230,
      y: 170,
      description:
        "Mo - Noah and Moe are best friends, but their friendship is complicated by business — Moe is technically Noah's competitor, running his own ice business on the other side of town. They respect each other's hustle but quietly keep an eye on each other's moves.",
      avatar: '/avatars/moe.jpeg',
    },
    {
      id: 't3',
      label: 'Ned',
      group: 'team',
      x: 300,
      y: 160,
      description:
        "Ned- Ned is another competitor who once tried to poach Noah's best supplier, leaving Noah furious and determined never to trust him again.",
      avatar: '/avatars/ned.jpeg',
    },
    {
      id: 't4',
      label: 'Lee',
      group: 'team',
      x: 90,
      y: 240,
      description:
        "Lee - Bo and Lee are inseparable co-workers who grew up learning the trade together, and they have a reputation for getting shipments out faster than anyone else.",
      avatar: '/avatars/lee.jpeg',
    },
    {
      id: 'p1',
      label: 'Ivy',
      group: 'planters',
      x: 660,
      y: 210,
      description:
        "Ivy - Ivy is another supplier for Noah, and while their working relationship is polite, Noah wishes Ivy were more open and collaborative about new ideas.",
      avatar: '/avatars/ivy.jpeg',
    },
    {
      id: 'p2',
      label: 'Bud',
      group: 'planters',
      x: 700,
      y: 340,
      description:
        "Bud - Noah relies on Bud as one of his main suppliers, and though they're only casually friendly, Noah appreciates that Bud always delivers on time and keeps things professional.",
      avatar: '/avatars/bud.jpeg',
    },
    {
      id: 's1',
      label: 'Ada',
      group: 'scientists',
      x: 220,
      y: 520,
      description:
        "Ada - Noah has bad blood with ADA, one of the manufacturers — she once shorted him on a shipment and publicly called him out over it, so he refuses to work with her unless absolutely necessary.",
      avatar: '/avatars/ada.jpeg',
    },
    {
      id: 's2',
      label: 'Bo',
      group: 'scientists',
      x: 120,
      y: 620,
      description:
        "Bo - Ada and Bo are best friends on the manufacturing floor, often teaming up to solve problems and gossip about the sellers' drama.",
      avatar: '/avatars/bo.jpeg',
    },
    {
      id: 's3',
      label: 'Cy',
      group: 'scientists',
      x: 360,
      y: 610,
      description:
        "Cy - Ada and Cy work together as part of the manufacturing team, exchanging casual banter on the job but mostly focusing on production.",
      avatar: '/avatars/cy.jpeg',
    },
  ],
  links: [
    { id: 'l1', source: 't1', target: 'main', type: 'trust' },
    { id: 'l2', source: 't3', target: 'main', type: 'trust' },
    { id: 'l3', source: 't4', target: 's2', type: 'solid' },
    { id: 'l4', source: 'p1', target: 'main', type: 'mixed' },
    { id: 'l5', source: 'p2', target: 'main', type: 'mixed' },
    { id: 'l6', source: 's1', target: 's2', type: 'solid' },
    { id: 'l7', source: 's1', target: 'main', type: 'trust' },
    { id: 'l8', source: 't2', target: 'main', type: 'solid' },
    { id: 'l9', source: 's3', target: 's1', type: 'mixed' },
  ],
};

async function main() {
  await runWithRetry(async ({ db, groups, nodes, links }) => {
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
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => {
  resetClient().catch(() => {});
});
