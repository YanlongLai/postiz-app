'use strict';
// Synthetic local PostgreSQL only; never starts Postiz or reaches production.
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { CATALOG_SQL } = require('./apply-upgrade.cjs');
const { localDockerOptions, ownedContainer } = require('./local-drill-docker.cjs');
const localDocker = localDockerOptions();
const image = process.env.DAPPGO_UPGRADE_DRILL_IMAGE;
if (!/^[a-z0-9._/:\-]+@sha256:[0-9a-f]{64}$/.test(image || '')) throw new Error('pinned_local_postgres_image_required');
const name = 'dappgo-upgrade-' + randomUUID();
const label = 'org.dappgo.upgrade-drill';
const owner = randomUUID();
const password = randomUUID();
const docker = (args, input) => execFileSync('docker', [...localDocker.args, ...args], {
  env: localDocker.env,
  input, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024,
  stdio: ['pipe', 'pipe', 'pipe'],
});
const sql = (text) => docker(['exec', '-i', name, 'psql', '-X', '-U', 'drill', '-d', 'postgres',
  '-v', 'ON_ERROR_STOP=1', '-At', '--single-transaction'], text);
const hash = (text) => createHash('sha256').update(text).digest('hex');
let createAttempted = false;
let evidence;
let phase = 'image-validation';
try {
  const metadata = JSON.parse(docker(['image', 'inspect', image]))[0];
  if (!metadata.RepoDigests.includes(image)) throw new Error('local_image_identity_invalid');
  createAttempted = true;
  phase = 'isolated-container-create';
  docker(['create', '--pull=never', '--name', name, '--label', label + '=' + owner,
    '--network=none', '--restart=no', '--log-driver=none', '--memory=2g', '--cpus=2',
    '--tmpfs', '/var/lib/postgresql/data', '-e', 'PGDATA=/var/lib/postgresql/data',
    '-e', 'POSTGRES_USER=drill', '-e', 'POSTGRES_DB=postgres', '-e', 'POSTGRES_PASSWORD=' + password, image]);
  docker(['start', name]);
  phase = 'isolated-postgres-readiness';
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const pid1 = docker(['exec', name, 'cat', '/proc/1/comm']).trim();
      if (pid1 !== 'postgres') throw new Error('postgres_initialization_pending');
      docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'drill', '-d', 'postgres']);
      ready = true; break;
    }
    catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250); }
  }
  if (!ready) throw new Error('isolated_postgres_not_ready');
  phase = 'baseline-restore';
  sql('DROP SCHEMA public CASCADE;'); // Exact isolated synthetic DB only.
  sql(readFileSync(join(__dirname, 'baseline-v225.sql'), 'utf8'));
  const before = sql(CATALOG_SQL + ';').trim();
  phase = 'synthetic-data-seed';
  sql(`INSERT INTO "Organization" (id,name,"updatedAt") VALUES ('o','synthetic',now());
    INSERT INTO "Media" (id,name,path,"organizationId","updatedAt") VALUES ('m','synthetic','/synthetic','o',now());
    INSERT INTO "Integration" (id,"internalId","organizationId",name,"providerIdentifier",type,token)
      VALUES ('i','i','o','synthetic','instagram','social','synthetic');
    INSERT INTO "Post" (id,"publishDate","organizationId","integrationId",content,"group","updatedAt")
      VALUES ('p',now(),'o','i','synthetic','g',now());
    INSERT INTO "StoryFrameReceipt" ("postId","publicationId","frameIndex","platformId","confirmedAt")
      VALUES ('p','synthetic',0,'synthetic',now());`);
  const upgrade = readFileSync(join(__dirname, 'upgrade-v225.sql'), 'utf8');
  phase = 'upgrade-apply-and-verify';
  if (process.env.DAPPGO_UPGRADE_OPERATOR_IMAGE) {
    // Shares only this task's otherwise network-isolated loopback namespace.
    // No production URL, publisher, host port or database filesystem is exposed.
    const operatorImage = process.env.DAPPGO_UPGRADE_OPERATOR_IMAGE;
    if (!/^sha256:[0-9a-f]{64}$/.test(operatorImage)) throw new Error('operator_image_id_required');
    const mounts = ['apply-upgrade.cjs', 'upgrade-v225.sql', 'upgrade-v225.json'].flatMap((file) =>
      ['--mount', 'type=bind,source=' + join(__dirname, file) + ',target=/operator/' + file + ',readonly']);
    const run = (apply) => docker(['run', '--rm', '--pull=never', '--network', 'container:' + name,
      '--entrypoint', 'node', ...mounts, '-e', 'DATABASE_URL=postgresql://drill:' + password + '@127.0.0.1:5432/postgres',
      operatorImage, '-e', `const{PrismaClient}=require('/app/node_modules/@prisma/client');const d=new PrismaClient();
      require('/operator/apply-upgrade.cjs').applyUpgrade(d,{apply:${apply}})
      .then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.safeCode||'operator_failed');process.exitCode=1})
      .finally(()=>d.$disconnect());`]);
    const first = JSON.parse(run(true));
    const second = JSON.parse(run(true));
    const check = JSON.parse(run(false));
    if (first.status !== 'applied' || second.status !== 'verified' || check.status !== 'verified') {
      throw new Error('operator_idempotency_failed');
    }
  } else {
    sql(upgrade);
  }
  const after = sql(CATALOG_SQL + ';').trim();
  phase = 'data-preservation-check';
  const counts = sql(`SELECT (SELECT count(*) FROM "Media" WHERE status='ready'),
    (SELECT count(*) FROM "Post"),(SELECT count(*) FROM "StoryFrameReceipt");`).trim();
  if (counts !== '1|1|1') throw new Error('upgrade_did_not_preserve_synthetic_data');
  const plan = { version: 'postiz-v2.25.0', baseline_sha256: hash(before), target_sha256: hash(after),
    sql_sha256: hash(upgrade), statement_count: upgrade.replace(/^\s*--[^\n]*(?:\n|$)/gm, '').split(';').filter((v) => v.trim()).length };
  // A failing transaction must preserve catalog and data, not partially migrate.
  let rejected = false;
  phase = 'atomic-rollback-negative-control';
  try { sql('ALTER TABLE "Media" ADD COLUMN "negativeControl" text; SELECT 1/0;'); }
  catch { rejected = true; }
  if (!rejected || sql(CATALOG_SQL + ';').trim() !== after) throw new Error('atomic_rollback_control_failed');
  evidence = { status: 'passed', image, architecture: metadata.Architecture,
    synthetic_counts_preserved: true, atomic_rollback_verified: true,
    prisma_operator_verified: Boolean(process.env.DAPPGO_UPGRADE_OPERATOR_IMAGE), plan,
    ...(process.env.DAPPGO_UPGRADE_CATALOG_EVIDENCE === 'true'
      ? { baseline_catalog: JSON.parse(before), target_catalog: JSON.parse(after) } : {}) };
} catch {
  process.stderr.write('postiz_isolated_upgrade_drill_failed\n');
  process.stderr.write(JSON.stringify({ event: 'drill_failure', phase }) + '\n'); process.exitCode = 1;
} finally {
  if (createAttempted) {
    try {
      const current = JSON.parse(docker(['container', 'inspect', name]))[0];
      if (!ownedContainer(current, name, label, owner)) {
        throw new Error('upgrade_drill_cleanup_identity_invalid');
      }
      docker(['rm', '-f', name]);
    } catch {
      process.stderr.write('upgrade_drill_cleanup_unverified\n'); process.exitCode = 1;
    }
  }
}
if (!process.exitCode && evidence) process.stdout.write(JSON.stringify(evidence) + '\n');
