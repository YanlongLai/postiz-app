// Explicit operator step, never called by application startup.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const MIGRATION_SHA256 = '91ad195e56fbaf0e964c732f5aaccaa1f1bd9b04b5d566b1d2f396ee700a61ee';
const fail = code => { const error = new Error(code); error.safeCode = code; throw error; };

async function schemaState(db) {
  const [state] = await db.$queryRawUnsafe(`SELECT
    to_regclass('public."Post"') IS NOT NULL AS "postExists",
    to_regclass('public."StoryFrameReceipt"') IS NOT NULL AS "receiptExists",
    EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typname='StoryFrameReceiptStatus') AS "enumExists"`);
  if (!state?.postExists) fail('story_schema_baseline_missing');
  const postKey = await db.$queryRawUnsafe(`SELECT c.contype, a.attname, format_type(a.atttypid,a.atttypmod) AS type
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    WHERE c.conrelid='public."Post"'::regclass AND c.contype='p' AND cardinality(c.conkey)=1`);
  if (postKey.length !== 1 || postKey[0].attname !== 'id' || postKey[0].type !== 'text') fail('story_schema_baseline_key_invalid');
  if (!state.receiptExists && !state.enumExists) return 'absent';
  if (!state.receiptExists || !state.enumExists) fail('story_schema_partial_requires_review');
  const columns = await db.$queryRawUnsafe(`SELECT a.attname, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull
    FROM pg_attribute a WHERE a.attrelid='public."StoryFrameReceipt"'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`);
  const expected = [['postId','text'],['publicationId','text'],['frameIndex','integer'],['platformId','text'],['confirmedAt','timestamp(3) without time zone'],['status','"StoryFrameReceiptStatus"']];
  if (columns.length !== expected.length || columns.some((column, index) => column.attname !== expected[index][0]
    || column.type !== expected[index][1] || column.attnotnull !== true)) fail('story_schema_columns_invalid');
  const labels = await db.$queryRawUnsafe(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='StoryFrameReceiptStatus' ORDER BY e.enumsortorder`);
  if (labels.length !== 1 || labels[0].enumlabel !== 'confirmed') fail('story_schema_enum_invalid');
  const constraints = await db.$queryRawUnsafe(`SELECT c.contype, c.confdeltype, c.confupdtype,
    c.confrelid=to_regclass('public."Post"') AS "postTarget",
    ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
    ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(num,ord)
      JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS "targetColumns"
    FROM pg_constraint c WHERE c.conrelid='public."StoryFrameReceipt"'::regclass`);
  const pk = constraints.filter(c => c.contype === 'p');
  const fk = constraints.filter(c => c.contype === 'f');
  if (pk.length !== 1 || JSON.stringify(pk[0].columns) !== JSON.stringify(['postId','publicationId','frameIndex'])
    || fk.length !== 1 || JSON.stringify(fk[0].columns) !== JSON.stringify(['postId'])
    || JSON.stringify(fk[0].targetColumns) !== JSON.stringify(['id']) || !fk[0].postTarget
    || fk[0].confdeltype !== 'c' || fk[0].confupdtype !== 'c') fail('story_schema_constraints_invalid');
  return 'ready';
}

async function applyReceiptSchema(db, { apply = false, sqlPath = join(__dirname, 'migration.sql') } = {}) {
  const sql = readFileSync(sqlPath, 'utf8');
  if (createHash('sha256').update(sql).digest('hex') !== MIGRATION_SHA256) fail('story_schema_migration_digest_invalid');
  return db.$transaction(async tx => {
    if (apply) await tx.$queryRawUnsafe("SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('dappgo-story-frame-schema-v1'))");
    const before = await schemaState(tx);
    if (before === 'ready') return { status: 'verified', contractVersion: 'story-frame-receipts-v1', migrationSha256: MIGRATION_SHA256 };
    if (!apply) fail('story_schema_not_applied');
    // The digest pins this exact generated migration. Its full-line comments
    // may contain semicolons; those are not PostgreSQL statement boundaries.
    const statements = sql.replace(/^\s*--[^\n]*(?:\n|$)/gm, '')
      .split(';').map(value => value.trim()).filter(Boolean);
    if (statements.length !== 3) fail('story_schema_migration_statements_invalid');
    for (const statement of statements) {
      await tx.$executeRawUnsafe(statement);
    }
    if (await schemaState(tx) !== 'ready') fail('story_schema_application_not_verified');
    return { status: 'applied', contractVersion: 'story-frame-receipts-v1', migrationSha256: MIGRATION_SHA256 };
  }, { maxWait: 5000, timeout: 30000 });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--check', '--apply'].includes(args[0])) {
    console.error('Usage: apply-schema.cjs --check|--apply');
    process.exitCode = 64;
  } else {
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient();
    applyReceiptSchema(db, { apply: args[0] === '--apply' })
      .then(result => console.log(JSON.stringify(result)))
      .catch(error => {
        // Never print connection strings, raw Prisma diagnostics or row data.
        console.error(JSON.stringify({ status: 'failed', reason: error.safeCode || 'story_schema_database_operation_failed' }));
        process.exitCode = 1;
      }).finally(() => db.$disconnect());
  }
}
module.exports = { schemaState, applyReceiptSchema, MIGRATION_SHA256 };
