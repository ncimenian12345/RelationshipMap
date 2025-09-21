const { MongoClient, ServerApiVersion } = require('mongodb');

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://Vercel-Admin-relationship-map:zgivlkrP37H67Opj@relationship-map.sxtr2sd.mongodb.net/?retryWrites=true&w=majority&appName=relationship-map';
const MONGODB_DB = process.env.MONGODB_DB || 'relationship-map';

let cachedClient = null;
let connectPromise = null;

function createClient() {
  return new MongoClient(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    },
  });
}

function isClientUsable(client) {
  return !!client && !!client.topology && !client.topology.isDestroyed();
}

async function resetClient() {
  if (cachedClient) {
    try {
      await cachedClient.close();
    } catch (err) {
      // ignore close errors so we can recreate the client
    }
  }
  cachedClient = null;
  connectPromise = null;
}

async function getClient() {
  if (isClientUsable(cachedClient)) {
    return cachedClient;
  }
  if (!connectPromise) {
    cachedClient = createClient();
    connectPromise = cachedClient
      .connect()
      .catch(async (err) => {
        await resetClient();
        throw err;
      });
  }
  await connectPromise;
  return cachedClient;
}

function shouldResetForError(err) {
  if (!err) return false;
  const transientNames = new Set([
    'MongoNetworkError',
    'MongoNotConnectedError',
    'MongoServerSelectionError',
    'MongoTopologyClosedError',
    'MongoTimeoutError',
  ]);
  if (transientNames.has(err.name)) {
    return true;
  }
  const msg = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  if (!msg) return false;
  return (
    msg.includes('server selection timed out') ||
    msg.includes('topology was destroyed') ||
    msg.includes('connection closed')
  );
}

async function getCollections() {
  try {
    const client = await getClient();
    const db = client.db(MONGODB_DB);
    return {
      client,
      db,
      groups: db.collection('groups'),
      nodes: db.collection('nodes'),
      links: db.collection('links'),
    };
  } catch (err) {
    if (shouldResetForError(err)) {
      await resetClient();
      const client = await getClient();
      const db = client.db(MONGODB_DB);
      return {
        client,
        db,
        groups: db.collection('groups'),
        nodes: db.collection('nodes'),
        links: db.collection('links'),
      };
    }
    throw err;
  }
}

async function runWithRetry(operation) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const collections = await getCollections();
      return await operation(collections);
    } catch (err) {
      lastError = err;
      if (shouldResetForError(err) && attempt === 0) {
        await resetClient();
        continue;
      }
      break;
    }
  }
  throw lastError;
}

async function pingDatabase() {
  return runWithRetry(async ({ db }) => {
    await db.command({ ping: 1 });
    const [groupsCount, nodesCount, linksCount] = await Promise.all([
      db.collection('groups').estimatedDocumentCount(),
      db.collection('nodes').estimatedDocumentCount(),
      db.collection('links').estimatedDocumentCount(),
    ]);
    return {
      ok: true,
      database: MONGODB_DB,
      groupsCount,
      nodesCount,
      linksCount,
    };
  });
}

module.exports = {
  getCollections,
  runWithRetry,
  pingDatabase,
  resetClient,
  constants: {
    MONGODB_URI,
    MONGODB_DB,
  },
};
