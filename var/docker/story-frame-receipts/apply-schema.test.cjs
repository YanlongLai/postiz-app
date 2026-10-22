'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyIntegrationSchema } = require('./apply-schema.cjs');

function client(states, options = {}) {
  const executed = [];
  let stateIndex = 0;
  const tx = {
    $queryRawUnsafe: async query => {
      executed.push(query);
      if (query.includes('to_regclass')) return [{ integrationExists: options.table !== false }];
      if (query.includes('information_schema.columns')) {
        const state = states[Math.min(stateIndex++, states.length - 1)];
        if (state === 'ready') return [{ column_name: 'customName', data_type: 'text', is_nullable: 'YES', column_default: null }];
        if (state === 'invalid') return [{ column_name: 'customName', data_type: 'character varying', is_nullable: 'YES', column_default: null }];
        return [];
      }
      return [{ locked: true }];
    },
    $executeRawUnsafe: async query => {
      executed.push(query);
      if (options.ddlError) throw new Error('synthetic-ddl-error');
    },
  };
  return { executed, $transaction: async (fn, opts) => { assert.equal(opts.timeout, 30000); return fn(tx); } };
}

test('check rejects missing customName without mutation', async () => {
  const db = client(['absent']);
  await assert.rejects(applyIntegrationSchema(db), /postiz_integration_schema_not_applied/);
  assert(!db.executed.some(query => query.includes('ALTER TABLE')));
});

test('apply adds only the nullable customName column and verifies it', async () => {
  const db = client(['absent', 'ready']);
  const result = await applyIntegrationSchema(db, { apply: true });
  assert.deepEqual(result, { status: 'applied', contractVersion: 'postiz-integration-custom-name-v1' });
  assert.equal(db.executed.filter(query => query.includes('ALTER TABLE')).length, 1);
  assert.match(db.executed.find(query => query.includes('ALTER TABLE')), /ADD COLUMN IF NOT EXISTS "customName" TEXT/);
});

test('already-correct customName is idempotently verified without DDL', async () => {
  const db = client(['ready']);
  const result = await applyIntegrationSchema(db, { apply: true });
  assert.equal(result.status, 'verified');
  assert(!db.executed.some(query => query.includes('ALTER TABLE')));
});

test('wrong customName shape fails closed without mutation', async () => {
  const db = client(['invalid']);
  await assert.rejects(applyIntegrationSchema(db, { apply: true }), /postiz_integration_custom_name_invalid/);
  assert(!db.executed.some(query => query.includes('ALTER TABLE')));
});

test('missing Integration table and DDL errors are preserved', async () => {
  await assert.rejects(applyIntegrationSchema(client(['absent'], { table: false }), { apply: true }), /postiz_integration_baseline_missing/);
  await assert.rejects(applyIntegrationSchema(client(['absent', 'ready'], { ddlError: true }), { apply: true }), /synthetic-ddl-error/);
});
