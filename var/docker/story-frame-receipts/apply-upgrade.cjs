'use strict';
// Explicit operator step only. Never called from application startup.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const fail = (code) => { const e = new Error(code); e.safeCode = code; throw e; };
const digest = (data) => createHash('sha256').update(data).digest('hex');
const CATALOG_SQL = `SELECT jsonb_build_object(
 'columns', (SELECT jsonb_agg(jsonb_build_array(c.relname,a.attname,
   format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid))
   ORDER BY c.relname,a.attname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
   AND c.relname<>'_prisma_migrations'),
 'constraints', (SELECT jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid))
   ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname<>'_prisma_migrations'),
 'indexes', (SELECT jsonb_agg(jsonb_build_array(tablename,indexname,indexdef) ORDER BY tablename,indexname)
   FROM pg_indexes WHERE schemaname='public' AND tablename<>'_prisma_migrations'),
 'enums', (SELECT jsonb_agg(jsonb_build_array(t.typname,e.enumlabel,e.enumsortorder) ORDER BY t.typname,e.enumsortorder)
   FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
   WHERE n.nspname='public'))::text AS catalog`;

async function schemaDigest(db) {
  const rows = await db.$queryRawUnsafe(CATALOG_SQL);
  if (rows.length !== 1 || typeof rows[0].catalog !== 'string') fail('postiz_upgrade_catalog_invalid');
  return digest(rows[0].catalog);
}

function loadPlan(directory = __dirname) {
  const plan = JSON.parse(readFileSync(join(directory, 'upgrade-v225.json'), 'utf8'));
  const sql = readFileSync(join(directory, 'upgrade-v225.sql'), 'utf8');
  if (plan.version !== 'postiz-v2.25.0' ||
      !['baseline_sha256', 'target_sha256', 'sql_sha256'].every((k) => /^[0-9a-f]{64}$/.test(plan[k])) ||
      digest(sql) !== plan.sql_sha256) fail('postiz_upgrade_plan_invalid');
  const statements = sql.replace(/^\s*--[^\n]*(?:\n|$)/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
  if (statements.length !== plan.statement_count || !statements.length ||
      /\b(?:DROP\s+(?:TABLE|COLUMN|TYPE|SCHEMA)|TRUNCATE|DELETE\s+FROM|UPDATE\s+\")/i.test(sql)) {
    fail('postiz_upgrade_sql_invalid');
  }
  return { plan, statements };
}

async function applyUpgrade(db, { apply = false, directory = __dirname } = {}) {
  const { plan, statements } = loadPlan(directory);
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL search_path TO public");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout TO '5s'");
    if (apply) {
      await tx.$queryRawUnsafe("SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('dappgo-postiz-upgrade-v225'))");
      // Lock existing relations before validating. Concurrent DDL changing the
      // reviewed catalog either waits or causes a bounded atomic rollback.
      const rows = await tx.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
      if (!rows.length) fail('postiz_upgrade_baseline_missing');
      for (const row of rows) {
        await tx.$executeRawUnsafe('LOCK TABLE public."' + row.tablename.replaceAll('"', '""') + '" IN ACCESS EXCLUSIVE MODE');
      }
    }
    const before = await schemaDigest(tx);
    if (before === plan.target_sha256) return { status: 'verified', version: plan.version, sql_sha256: plan.sql_sha256 };
    if (before !== plan.baseline_sha256) fail('postiz_upgrade_baseline_mismatch');
    if (!apply) fail('postiz_upgrade_not_applied');
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
    if (await schemaDigest(tx) !== plan.target_sha256) fail('postiz_upgrade_target_mismatch');
    return { status: 'applied', version: plan.version, sql_sha256: plan.sql_sha256 };
  }, { maxWait: 5000, timeout: 60000 });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--check', '--apply'].includes(args[0])) {
    console.error('Usage: apply-upgrade.cjs --check|--apply'); process.exitCode = 64;
  } else {
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient();
    applyUpgrade(db, { apply: args[0] === '--apply' })
      .then((r) => console.log(JSON.stringify(r)))
      .catch((e) => { console.error(JSON.stringify({ status: 'failed', reason: e.safeCode || 'postiz_upgrade_database_operation_failed' })); process.exitCode = 1; })
      .finally(() => db.$disconnect());
  }
}
module.exports = { CATALOG_SQL, schemaDigest, loadPlan, applyUpgrade };
