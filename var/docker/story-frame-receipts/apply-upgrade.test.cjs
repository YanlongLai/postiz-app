'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { applyUpgrade, loadPlan, schemaDigest } = require('./apply-upgrade.cjs');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const fixture = (t, options = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'postiz-upgrade-plan-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const sql = options.sql || 'ALTER TABLE "Media" ADD COLUMN status text;';
  const plan = { version: 'postiz-v2.25.0', baseline_sha256: hash('baseline'), target_sha256: hash('target'),
    sql_sha256: hash(sql), statement_count: 1, ...options.plan };
  writeFileSync(join(directory, 'upgrade-v225.sql'), sql);
  writeFileSync(join(directory, 'upgrade-v225.json'), JSON.stringify(plan));
  return directory;
};
const db = (catalogs, executionError) => {
  const executed = [];
  const tx = {
    $executeRawUnsafe: async (statement) => {
      executed.push(statement);
      if (executionError && statement.startsWith('ALTER')) throw new Error('synthetic-private-error');
    },
    $queryRawUnsafe: async (query) => query.includes('AS catalog') ? [{ catalog: catalogs.shift() }]
      : query.includes('SELECT tablename') ? [{ tablename: 'Media' }] : [{ locked: true }],
  };
  return { executed, $transaction: async (fn, options) => {
    assert.equal(options.timeout, 60000); return fn(tx);
  } };
};
test('checked-in upgrade SQL, count and digest are bound to one plan', () => {
  const result = loadPlan();
  assert.equal(result.statements.length, 80);
  assert.equal(result.plan.sql_sha256, hash(readFileSync(join(__dirname, 'upgrade-v225.sql'))));
});
test('check rejects unapplied baseline without mutation', async (t) => {
  const client = db(['baseline']);
  await assert.rejects(applyUpgrade(client, { directory: fixture(t) }), /postiz_upgrade_not_applied/);
  assert(!client.executed.some((s) => s.startsWith('ALTER') || s.startsWith('LOCK')));
});
test('unrecognized live baseline is not accepted as an upgrade', async (t) => {
  const client = db(['unrelated']);
  await assert.rejects(applyUpgrade(client, { apply: true, directory: fixture(t) }), /baseline_mismatch/);
  assert(!client.executed.some((s) => s.startsWith('ALTER')));
});
test('already upgraded catalog is idempotent', async (t) => {
  const client = db(['target']);
  assert.equal((await applyUpgrade(client, { apply: true, directory: fixture(t) })).status, 'verified');
  assert(!client.executed.some((s) => s.startsWith('ALTER')));
});
test('applies only after locked baseline and verifies target in transaction', async (t) => {
  const client = db(['baseline', 'target']);
  assert.equal((await applyUpgrade(client, { apply: true, directory: fixture(t) })).status, 'applied');
  assert(client.executed.indexOf('LOCK TABLE public."Media" IN ACCESS EXCLUSIVE MODE') < client.executed.indexOf('ALTER TABLE "Media" ADD COLUMN status text'));
});
test('incorrect resulting catalog rejects transaction', async (t) => {
  await assert.rejects(applyUpgrade(db(['baseline', 'partial']), { apply: true, directory: fixture(t) }), /target_mismatch/);
});
test('DDL error propagates to rollback instead of success', async (t) => {
  await assert.rejects(applyUpgrade(db(['baseline'], true), { apply: true, directory: fixture(t) }), /synthetic-private-error/);
});
test('invalid catalog cannot be hashed as a healthy identity', async () => {
  await assert.rejects(schemaDigest({ $queryRawUnsafe: async () => [] }), /catalog_invalid/);
});
for (const sql of ['DROP TABLE "Media";', 'ALTER TABLE "Media" DROP COLUMN path;', 'TRUNCATE "Media";', 'DELETE FROM "Media";', 'UPDATE "Media" SET path=1;']) {
  test('rejects destructive migration ' + sql.split(' ')[0], (t) => {
    assert.throws(() => loadPlan(fixture(t, { sql })), /sql_invalid/);
  });
}
test('rejects changed bytes and invalid identity/count', (t) => {
  for (const plan of [{ sql_sha256: '0'.repeat(64) }, { baseline_sha256: 'invalid' }, { version: 'unreviewed' }, { statement_count: 2 }]) {
    assert.throws(() => loadPlan(fixture(t, { plan })), /plan_invalid|sql_invalid/);
  }
});
