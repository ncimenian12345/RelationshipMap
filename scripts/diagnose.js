const { pingDatabase, runWithRetry, resetClient } = require('../lib/mongo');

async function main() {
  console.log('Running MongoDB connectivity diagnostic...');
  const status = await pingDatabase();
  console.log(
    `✔ Ping successful. Database "${status.database}" currently has ${status.nodesCount} nodes and ${status.linksCount} links.`
  );

  const sampleNodes = await runWithRetry(async ({ nodes }) =>
    nodes
      .find({}, { projection: { _id: 1, label: 1, group: 1 } })
      .sort({ _id: 1 })
      .limit(5)
      .toArray()
  );
  if (sampleNodes.length === 0) {
    console.log('ℹ No nodes found in the collection.');
  } else {
    console.log('ℹ Sample nodes:', sampleNodes);
  }

  const diagnosticsId = `diagnostic_${Date.now()}`;
  await runWithRetry(async ({ nodes }) =>
    nodes.insertOne({
      _id: diagnosticsId,
      label: 'Diagnostics Check',
      group: 'diagnostics',
      x: 0,
      y: 0,
      description: 'Temporary document inserted by diagnostics script.',
    })
  );
  console.log('✔ Write check succeeded. Temporary diagnostics node inserted.');

  await runWithRetry(async ({ nodes }) => nodes.deleteOne({ _id: diagnosticsId }));
  console.log('✔ Cleanup succeeded. Temporary diagnostics node removed.');

  console.log('Diagnostics complete. MongoDB connectivity looks healthy.');
}

main()
  .catch((err) => {
    console.error('Diagnostics failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    resetClient().catch(() => {});
  });
