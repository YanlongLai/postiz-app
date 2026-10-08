// Opt-in validation of the real operator helper on a disposable loopback DB.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve, join } = require('node:path');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');
const root = resolve(__dirname, '../..');
const { applyReceiptSchema, MIGRATION_SHA256 } = require(join(root, 'var/docker/story-frame-receipts/apply-schema.cjs'));
async function main() {
  assert.equal(process.version, 'v22.12.0');
  if (!process.argv.includes('--execute-on-isolated-server') || !process.env.RECEIPT_TEST_DATABASE_URL) {
    console.log('SKIP explicit isolated-server opt-in required; no connection attempted');
    process.exitCode = 2;
    return;
  }
  const url = new URL(process.env.RECEIPT_TEST_DATABASE_URL);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '15432');
  assert.equal(url.pathname, '/story_receipt_operator_validation');
  assert.equal(url.search, '');
  const cli = process.env.RECEIPT_PNPM10_CLI;
  assert(cli, 'Explicit cached PNPM10 CLI required');
  const baseline = execFileSync(process.execPath, [cli, '--config.managePackageManagerVersions=false', 'exec', 'prisma',
    'migrate', 'diff', '--from-empty', '--to-schema-datamodel', join(__dirname, 'baseline.prisma'), '--script'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CHECKPOINT_DISABLE: '1' } });
  const pg = new Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  const options = { sqlPath: join(__dirname, 'migration.sql') };
  const canonicalSql = readFileSync(options.sqlPath, 'utf8');
  assert.equal(createHash('sha256').update(canonicalSql).digest('hex'), MIGRATION_SHA256);
  assert(canonicalSql.includes('-- Not applied. Additive only; no historical receipt backfill.'),
    'Actual semicolon-in-comment regression fixture must remain present');
  assert.equal(canonicalSql.split(';').map(s => s.trim()).filter(Boolean).length, 4,
    'Naive splitting must demonstrate four chunks, not the three DDL statements');
  try {
    await pg.connect();
    assert.equal((await pg.query('SELECT current_database() AS name')).rows[0].name, url.pathname.slice(1));
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")).rows[0].n, 0,
      'Refuse any existing user tables');
    await pg.query(baseline);
    await pg.query('INSERT INTO "Organization" (id,name,"updatedAt") VALUES ($1,$2,now())', ['org', 'isolated validation']);
    await pg.query('INSERT INTO "Integration" (id,"internalId","organizationId",name,"providerIdentifier",type,token) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      ['integration', 'synthetic', 'org', 'fixture', 'test', 'social', 'synthetic-not-secret']);
    await pg.query('INSERT INTO "Post" (id,"publishDate","organizationId","integrationId",content,"group","updatedAt") VALUES ($1,now(),$2,$3,$4,$5,now())',
      ['post', 'org', 'integration', 'preserve original fixture', 'fixture']);
    const fixture = async () => (await pg.query('SELECT row_to_json(p)::text AS row FROM "Post" p')).rows;
    const before = await fixture();
    await assert.rejects(() => applyReceiptSchema(db, options), (e) => e.safeCode === 'story_schema_not_applied');
    console.log('PASS absent --check fails closed');
    assert.equal((await applyReceiptSchema(db, { ...options, apply: true })).status, 'applied');
    console.log('PASS --apply creates complete contract through actual Prisma; canonical semicolon-comment regression');
    for (let frame = 0; frame < 3; frame++) {
      await pg.query('INSERT INTO "StoryFrameReceipt" ("postId","publicationId","frameIndex","platformId","confirmedAt") VALUES ($1,$2,$3,$4,$5)',
        ['post', 'run', frame, `real-frame-${frame}`, '2026-10-08T06:00:00Z']);
    }
    const receipts = async () => (await pg.query('SELECT row_to_json(r)::text AS row FROM "StoryFrameReceipt" r ORDER BY "frameIndex"')).rows;
    const savedReceipts = await receipts();
    assert.equal((await applyReceiptSchema(db, options)).status, 'verified');
    assert.equal((await applyReceiptSchema(db, { ...options, apply: true })).status, 'verified');
    assert.deepEqual(await fixture(), before);
    assert.deepEqual(await receipts(), savedReceipts);
    console.log('PASS --check ready, second --apply idempotent, original Post and three receipt fixtures unchanged');
    // Intentional malformed schema only inside this disposable local test DB.
    await pg.query('ALTER TABLE "StoryFrameReceipt" DROP COLUMN "platformId"');
    const catalog = async () => (await pg.query(`SELECT attname FROM pg_attribute WHERE attrelid='public."StoryFrameReceipt"'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`)).rows;
    const partialBefore = await catalog();
    await assert.rejects(() => applyReceiptSchema(db, { ...options, apply: true }), (e) => e.safeCode === 'story_schema_columns_invalid');
    assert.deepEqual(await catalog(), partialBefore);
    assert.deepEqual(await fixture(), before);
    console.log('PASS partial columns fail without repair or Post mutation');
    await pg.query('DROP TABLE "StoryFrameReceipt"');
    await assert.rejects(() => applyReceiptSchema(db, { ...options, apply: true }), (e) => e.safeCode === 'story_schema_partial_requires_review');
    assert.equal((await pg.query("SELECT to_regclass('public.\"StoryFrameReceipt\"') AS receipt")).rows[0].receipt, null);
    assert.deepEqual(await fixture(), before);
    console.log('PASS enum-only partial state remains held without repair');
  } finally {
    await db.$disconnect();
    await pg.end();
  }
}
main().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', reason: error.safeCode || error.code || error.name }));
  process.exitCode = 1;
});
