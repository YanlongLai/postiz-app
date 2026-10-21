# Exact local prerequisites (not executed)

Latest checkpoint: Owner authorized task-owned containers after starting existing
Docker Desktop. PostgreSQL 17.10 SQL validation has now executed and passed;
the tmpfs test container was stopped/removed. The instructions below remain the
reproduction contract. A Temporal dev server has NOT been started; offline native
replay is verified separately. Historical missing-daemon inventory is superseded.

## PostgreSQL SQL application

Read-only inventory: Docker CLI exists, but the local Unix socket is unreachable.
No postgres/psql binaries were found on PATH or in inspected Homebrew/runtime
caches; no reachable isolated server was supplied. Do NOT infer an environment
DATABASE_URL is local/test, and do not reset or reuse any existing database.

Outside this no-new-daemon task, provision/start a local Docker daemon and make
the repository's PostgreSQL 17 image available (postgres:17-alpine, as declared in
docker-compose.dev.yaml). Alternatively provision a dedicated PostgreSQL 17
instance at exactly 127.0.0.1:15432, with an empty database named
story_receipt_validation. No Temporal, Postiz or social provider service is needed
for this SQL test. A separately approved disposable container launch is:

```sh
docker run --rm --name story-frame-receipts-validation \
  -p 127.0.0.1:15432:5432 \
  -e POSTGRES_USER=validation \
  -e POSTGRES_PASSWORD=local-validation-only \
  -e POSTGRES_DB=story_receipt_validation \
  --tmpfs /var/lib/postgresql/data:rw,nosuid \
  postgres:17-alpine
```

This is a launch requirement, not an authorization or a command executed here.
Do not mount existing data volumes. Use a separate terminal to stop this named
disposable container after the test. Nothing here installs Docker or pulls images.

Using the provisioned Node 22.12.0 + PNPM 10.6.1 invocation from EVIDENCE.md,
set only the explicitly isolated test URL and run:

```sh
RECEIPT_TEST_DATABASE_URL=postgresql://validation:local-validation-only@127.0.0.1:15432/story_receipt_validation \
  RECEIPT_PNPM10_CLI="$RECEIPT_PNPM10_CLI" \
  "$RECEIPT_NODE22_BIN/node" "$RECEIPT_PNPM10_CLI" --config.managePackageManagerVersions=false \
  exec node artifacts/STORY-FRAME-RECEIPTS-20261008/postgres-migration-check.cjs --execute-on-isolated-server
```

Prepend RECEIPT_NODE22_BIN to PATH, disable Prisma update checks as before.
The runner refuses other hosts/ports/database names, query-string connection
overrides, and nonempty user-table catalogs. It never falls back to DATABASE_URL.
It generates the FULL fork baseline DDL offline, applies baseline and additive
SQL inside one transaction, seeds only synthetic organization/integration/post
fixtures, and checks ordered receipts, immutable conflict behavior, preserved
parent data, separate repeat-run identity, PK/FK/enum rejection and delete cascade.
Finally it ROLLBACKs the transaction, leaving the initially empty DB empty. No
DROP/reset command is used. Actual SQL application/assertions passed in the latest
isolated run. Timestamp reads explicitly interpret Prisma's TIMESTAMP(3) as UTC
rather than allowing pg to interpret naive timestamp text in the host local zone.
Without explicit opt-in and test URL it exits 2 (SKIP), before any connection.

## Temporal

No server is required for the currently passing native-core replay. Run the
supported PNPM prefix with:

```sh
exec node artifacts/STORY-FRAME-RECEIPTS-20261008/temporal-replay.cjs
```

The installed SDK/native core version is 1.15.0. The full workflow index bundles
offline with repository aliases and local .swcrc discovery disabled only in this
test harness; the inherited .swcrc has a non-portable author-machine baseUrl.
Production Nest configuration uses compiled JS, so this source-harness override
is not claimed to reproduce a production release artifact build.

For actual server execution/queue dispatch testing, separately provision matching
@temporalio/testing@1.15.0 and its local time-skipping test-server executable, or
provide an explicitly isolated Temporal dev server/namespace. Starting that server
would introduce a task-owned daemon and is now Owner-authorized only for an
isolated bounded experiment. None was started in this checkpoint. Before doing so, record
its binary/image identity and dedicated loopback address/namespace. Use only
synthetic activity implementations, never real PostActivity/provider credentials.
Existing production history must be supplied by the separately approved read-only
release process; synthetic histories are not substitutes for that evidence.
