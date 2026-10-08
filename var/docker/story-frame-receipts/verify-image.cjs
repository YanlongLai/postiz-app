// Run with --network none --entrypoint node, never by starting application main.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const migration = readFileSync('/app/var/docker/story-frame-receipts/migration.sql');
assert.equal(createHash('sha256').update(migration).digest('hex'),
  '91ad195e56fbaf0e964c732f5aaccaa1f1bd9b04b5d566b1d2f396ee700a61ee');
const operator = require('./apply-schema.cjs');
assert.equal(operator.MIGRATION_SHA256, createHash('sha256').update(migration).digest('hex'));
assert.equal(typeof operator.applyReceiptSchema, 'function');
assert.equal(process.version, 'v22.20.0');
assert.equal(execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(), '10.6.1');
assert.equal(Prisma.prismaVersion.client, '6.5.0');
const model = Prisma.dmmf.datamodel.models.find((item) => item.name === 'StoryFrameReceipt');
assert(model, 'target-generated receipt model missing');
for (const name of ['postId', 'publicationId', 'frameIndex', 'platformId', 'confirmedAt', 'status']) {
  assert(model.fields.some((field) => field.name === name), `missing receipt field ${name}`);
}
const workflows = require('/app/apps/orchestrator/dist/apps/orchestrator/src/workflows/index.js');
assert.equal(typeof workflows.postWorkflowV113, 'function');
assert.equal(typeof workflows.postWorkflowV112, 'function');
for (const app of ['backend', 'orchestrator']) {
  const { selectedPostWorkflow } = require(`/app/apps/${app}/dist/libraries/nestjs-libraries/src/temporal/post.workflow.version.js`);
  delete process.env.POSTIZ_WORKFLOW_VERSION;
  assert.equal(selectedPostWorkflow(), 'postWorkflowV112');
  process.env.POSTIZ_WORKFLOW_VERSION = 'V112';
  assert.equal(selectedPostWorkflow(), 'postWorkflowV112');
  process.env.POSTIZ_WORKFLOW_VERSION = 'V113';
  assert.equal(selectedPostWorkflow(), 'postWorkflowV113');
  process.env.POSTIZ_WORKFLOW_VERSION = 'invalid';
  assert.throws(selectedPostWorkflow, /POSTIZ_WORKFLOW_VERSION must be V112 or V113/);
}
for (const role of ['all', 'web', 'orchestrator']) {
  process.env.POSTIZ_PROCESS_ROLE = role;
  const path = '/app/var/docker/story-frame-receipts/ecosystem.config.cjs';
  delete require.cache[require.resolve(path)];
  const { apps } = require(path);
  assert.equal(apps.length, role === 'all' ? 3 : role === 'web' ? 2 : 1);
  for (const app of apps) {
    assert.deepEqual(app.args, ['--filter', `./apps/${app.name}`, 'run', 'start']);
  }
}
const startup = readFileSync('/app/var/docker/story-frame-receipts/start.sh', 'utf8');
assert(!/db.push|accept-data-loss|pm2 delete|prisma-reset/.test(startup));
console.log('PASS target runtime, Prisma receipt model, retained V112/new V113, activation policy in both compiled services, canonical migration hash, explicit non-migrating process roles');
