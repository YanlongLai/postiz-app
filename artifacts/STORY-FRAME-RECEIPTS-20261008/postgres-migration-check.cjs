// Opt-in integration test on a disposable, empty LOCAL PostgreSQL database.
// Generated schema/migration DDL and fixture queries are test-only, not app code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const root = path.resolve(__dirname, '../..');

async function main() {
  assert.equal(process.version, 'v22.12.0');
  if (
    !process.argv.includes('--execute-on-isolated-server') ||
    !process.env.RECEIPT_TEST_DATABASE_URL
  ) {
    console.log(
      'SKIP: requires --execute-on-isolated-server and explicit RECEIPT_TEST_DATABASE_URL; no connection attempted'
    );
    process.exitCode = 2;
    return;
  }
  const url = new URL(process.env.RECEIPT_TEST_DATABASE_URL);
  assert(['postgresql:', 'postgres:'].includes(url.protocol));
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '15432');
  assert(/^\/story_receipt_validation(?:_[a-z0-9]+)?$/.test(url.pathname));
  assert.equal(url.search, '', 'Connection option overrides are forbidden');
  const pnpmCli = process.env.RECEIPT_PNPM10_CLI || process.env.npm_execpath;
  assert(pnpmCli, 'Supply the cached PNPM 10.6.1 CLI path explicitly');
  const baselineSql = execFileSync(
    process.execPath,
    [
      pnpmCli,
      '--config.managePackageManagerVersions=false',
      'exec',
      'prisma',
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema-datamodel',
      path.join(__dirname, 'baseline.prisma'),
      '--script',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CHECKPOINT_DISABLE: '1',
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
      },
    }
  );
  const migrationSql = fs.readFileSync(
    path.join(__dirname, 'migration.sql'),
    'utf8'
  );
  const client = new Client({
    connectionString: url.href,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    query_timeout: 10000,
  });
  let connected = false;
  let transaction = false;
  try {
    await client.connect();
    connected = true;
    const identity = await client.query('SELECT current_database() AS db');
    assert.equal(identity.rows[0].db, url.pathname.slice(1));
    const empty = await client.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')"
    );
    assert.equal(
      empty.rows[0].n,
      0,
      'Refuse any database containing user tables'
    );
    await client.query('BEGIN');
    transaction = true;
    await client.query(baselineSql);
    await client.query(
      'INSERT INTO "Organization" (id,name,"updatedAt") VALUES ($1,$2,now())',
      ['org', 'isolated validation']
    );
    await client.query(
      'INSERT INTO "Integration" (id,"internalId","organizationId",name,"providerIdentifier",type,token) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        'integration',
        'synthetic',
        'org',
        'isolated',
        'test',
        'social',
        'synthetic-not-a-secret',
      ]
    );
    await client.query(
      'INSERT INTO "Post" (id,"publishDate","organizationId","integrationId",content,"group","updatedAt") VALUES ($1,now(),$2,$3,$4,$5,now())',
      ['post', 'org', 'integration', 'preserve existing content', 'fixture']
    );
    await client.query(migrationSql);
    const insert =
      'INSERT INTO "StoryFrameReceipt" ("postId","publicationId","frameIndex","platformId","confirmedAt") VALUES ($1,$2,$3,$4,$5)';
    for (let i = 0; i < 3; i++)
      await client.query(insert, [
        'post',
        'run-1',
        i,
        `actual-${i}`,
        '2026-10-08T06:00:00Z',
      ]);
    await client.query(
      `${insert} ON CONFLICT ("postId","publicationId","frameIndex") DO NOTHING`,
      ['post', 'run-1', 0, 'must-not-overwrite', '2026-10-09T06:00:00Z']
    );
    const rows = await client.query(
      'SELECT "frameIndex","platformId",status,"confirmedAt" AT TIME ZONE \'UTC\' AS "confirmedAt" FROM "StoryFrameReceipt" ORDER BY "frameIndex"'
    );
    assert.deepEqual(
      rows.rows.map((r) => [r.frameIndex, r.platformId, r.status]),
      [
        [0, 'actual-0', 'confirmed'],
        [1, 'actual-1', 'confirmed'],
        [2, 'actual-2', 'confirmed'],
      ]
    );
    assert.equal(
      rows.rows[0].confirmedAt.toISOString(),
      '2026-10-08T06:00:00.000Z'
    );
    await client.query(insert, [
      'post',
      'run-2',
      0,
      'new-occurrence',
      '2026-10-09T06:00:00Z',
    ]);
    for (const [sql, params, code] of [
      [
        insert,
        ['post', 'run-1', 0, 'duplicate', '2026-10-08T06:00:00Z'],
        '23505',
      ],
      [
        insert,
        ['missing-post', 'run-1', 0, 'orphan', '2026-10-08T06:00:00Z'],
        '23503',
      ],
      ['UPDATE "StoryFrameReceipt" SET status=$1', ['pending'], '22P02'],
    ]) {
      await client.query('SAVEPOINT negative_control');
      await assert.rejects(
        () => client.query(sql, params),
        (error) => error.code === code
      );
      await client.query('ROLLBACK TO SAVEPOINT negative_control');
    }
    assert.equal(
      (await client.query('SELECT content FROM "Post" WHERE id=$1', ['post']))
        .rows[0].content,
      'preserve existing content'
    );
    await client.query('DELETE FROM "Post" WHERE id=$1', ['post']);
    assert.equal(
      (await client.query('SELECT count(*)::int AS n FROM "StoryFrameReceipt"'))
        .rows[0].n,
      0
    );
    await client.query('ROLLBACK');
    transaction = false;
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"
        )
      ).rows[0].n,
      0
    );
    console.log(
      'PASS isolated PostgreSQL: full baseline + additive SQL, preserved data, ordered/immutable receipts, repeat identity, PK/FK/enum negatives, cascade, rollback'
    );
  } finally {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    if (connected) await client.end();
  }
}
main().catch((error) => {
  // Do not print connection URLs, passwords or database error details.
  console.error(
    `FAIL isolated SQL validation (${
      error.code || error.name
    }); no credentials printed`
  );
  process.exitCode = 1;
  if (error.code === 'ERR_ASSERTION') console.error(error.message);
});
