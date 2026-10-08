# Receipt implementation checkpoint

Owner approval recorded in this task. Initial inspection confirms only the last
platform ID is surfaced. Do not call six-frame publication verified from two root
scheduling receipts. No external social mutation in this work item.

DEL-RECEIPTS: provider/database/API boundary, typed deterministic tests, isolated
feature worktree; additive migration and workflow versioning required; high domain
dependence supplied by explicit scope and current source. Delegate implementation
to Harvey, independently review before merge and release.

## Local implementation checkpoint — 2026-10-08 07:00 UTC

Status: implemented and locally verified; not promoted, deployed or observed.
Baseline remains b701236ab1ea969d52c22173c2db0667f0db587f on
feature/story-frame-receipts-20261008, claim CLM-7E630A7EA145. Existing PRD and
work-item manifest are preserved. Exact changed paths are in CHANGED_FILES.md.

Owner explicitly reaffirmed: only per-frame receipts through a minimal private
authenticated interface; no publication/commit/deployment or external operations.

### Verification results

- Scoped PNPM Jest: 7 suites, 40/40 tests passed. Five new suites plus two existing
  Facebook regression suites. Tests exercise actual provider methods, Prisma
  query construction/service projection, activity callback persistence, the new
  workflow with mocked Temporal activity proxies, and the actual authentication
  middleware with mocked credential stores. No live database/provider is used.
- Orchestrator source typecheck: exit 0.
- Backend source typecheck: exit 0.
- Additional new-test/source typecheck: exit 0; typed provider state and receipt
  interfaces verified beyond transpile-only Jest.
- Prisma 6.5 schema validate: passed with a dummy local DATABASE_URL; no database
  connection. Client generate succeeded into ignored local dependencies.
- Offline Prisma migrate diff against baseline snapshot: only receipt enum,
  table, composite key and Post foreign key; generated migration.sql not applied.
- Historical workflow byte comparison against fork HEAD passed in the workflow
  suite. Existing workflow bodies and activity parameter signatures are preserved.
- git diff --check: passed. New DTO/tests/test configuration formatting checked.
  Whole legacy source files contain baseline formatting inconsistencies; unrelated
  formatter changes were removed instead of changing production-adjacent code.

Reproduce from the worktree root using PNPM only:

```sh
pnpm --config.managePackageManagerVersions=false exec jest --config artifacts/STORY-FRAME-RECEIPTS-20261008/jest.config.cjs --runInBand
pnpm --config.managePackageManagerVersions=false exec tsc --noEmit --incremental false -p apps/orchestrator/tsconfig.build.json
pnpm --config.managePackageManagerVersions=false exec tsc --noEmit --incremental false -p apps/backend/tsconfig.build.json
pnpm --config.managePackageManagerVersions=false exec tsc -p artifacts/STORY-FRAME-RECEIPTS-20261008/tsconfig.tests.json
DATABASE_URL=postgresql://offline:offline@localhost:5432/offline pnpm --config.managePackageManagerVersions=false exec prisma validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
pnpm --config.managePackageManagerVersions=false exec prisma migrate diff --from-schema-datamodel artifacts/STORY-FRAME-RECEIPTS-20261008/baseline.prisma --to-schema-datamodel libraries/nestjs-libraries/src/database/prisma/schema.prisma --script
git diff --check
```

PNPM install used --offline --frozen-lockfile --ignore-scripts, reused local cache
and downloaded zero packages. Default PNPM auto-version resolution initially
failed offline; explicit managePackageManagerVersions=false resolved the cached
PNPM 10.6.1 path. Local Node is 26.6.0, outside the declared Node 22 engine range;
supported-runtime release validation remains open. No package manifests/lockfiles
were modified. Prisma client generation is not schema application.

### Closed-loop repair history

Re-plan route: hypothesis, unchanged product scope. The first expanded tests
failed on unrelated DOMPurify ESM/bcrypt dependencies and an incorrectly initialized
Temporal test proxy. Isolated unrelated dependencies with mocks (not receipt,
organization scoping or workflow behavior), initialized stable proxy functions,
and corrected the test import. Final scoped tests pass. Tightening provider state
types revealed widened string literals in test fixtures; fixing the literal type
made the separate test typecheck pass. No production guard was weakened.

### Acceptance and remaining gates

| Criterion | Local result | Evidence / next gate |
| --- | --- | --- |
| Each confirmed frame has index and real ID persisted before next mutation | verified locally | provider + activity + repository tests; PostgreSQL staging verification pending |
| Authenticated organization-scoped narrow receipt GET | verified locally | auth/controller/service/repository tests; deployed auth/read observation pending |
| Partial failures preserve confirmations without replay of ambiguous publish | verified locally | provider checkpoint/resume/hold and workflow failure tests |
| Existing in-flight workflows preserved; versioned evolution | verified locally | byte comparisons, V113 plumbing and old activity signatures |

Unresolved: release engineer must validate Node 22, PostgreSQL schema application,
coordinated worker/version rollout and Temporal history compatibility. The provider
mutation-to-database commit window is not atomic; a lost real ID holds for manual
reconciliation. Instagram PUBLISHED containers without a saved real media ID are
never fabricated as receipts; local source contains no verified real-ID lookup.
Historical V112 executions do not receive/backfill receipts. Empty/partial arrays
are not evidence of full publication success.

Progress: on-track for bounded local implementation; production assurance open.
Next action: independent review of this diff, then the separately authorized
release gates in RELEASE_REQUIREMENTS.md. No independent-review agent tool is
available in this session, so no peer/assurance sign-off is claimed; delegate this
review through the main task's existing process. Rollback preserves receipt data
and new activity handlers until V113 drains. No external call, secret read,
commit, push, deployment, database application or social publication occurred.

## Supported-runtime validation — 2026-10-08 07:10 UTC

This checkpoint supersedes the historical Node 22 pending gate above and the
local-runtime warning in RELEASE_REQUIREMENTS.md. Implementation source and tests
were not changed during this bounded validation; only this evidence was updated.
Baseline/claim remain b701236ab1ea969d52c22173c2db0667f0db587f /
CLM-7E630A7EA145; the claim was rechecked active with no conflicts.

### Actual runtime, not a version-string substitution

Read-only cache discovery located the Owner-provisioned node@22.12.0/bin/node
and pnpm@10.6.1/bin/pnpm.cjs. Every check invoked the cached PNPM CLI explicitly
with the cached Node binary, and prepended that Node binary directory to PATH
so PNPM exec and subprocess shebangs also used Node 22.12.0. No dlx, install,
runtime download, new dependency manager, or Node 26 fallback was used.

PNPM exec node reported:

```json
{"node":"v22.12.0","pnpm":"pnpm/10.6.1 npm/? node/v22.12.0 darwin arm64"}
```

The executable path was verified to the provisioned node@22.12.0 cache entry.
PNPM --version was 10.6.1. Prisma --version independently reported Prisma/client
6.5.0, Node.js v22.12.0, TypeScript 5.5.4 and darwin-arm64.

Runtime file SHA-256 identities:

- Node binary: 53dc65febda99ecaafe692de5ec60efdc2f7bd4fb14d1ba8cd30dc2af103953f
- PNPM CLI entry: b276da51dc8ca5b0d3ee3371695b50fc8b3244b281b091c63a3f082a88dadeb9

### Fresh results

| Check under Node 22.12.0 / PNPM 10.6.1 | Result |
| --- | --- |
| Scoped Jest, same seven suites | exit 0; 40/40 tests; 3.059 seconds |
| Orchestrator source tsc --noEmit --incremental false | exit 0 |
| Backend source tsc --noEmit --incremental false | exit 0 |
| Additional new-test/source tsconfig.tests.json | exit 0 |
| Prisma schema validate | exit 0; schema valid |
| Prisma client generate | exit 0; client 6.5.0 generated in ignored local dependencies |
| Prisma migrate diff baseline -> current schema --script | exit 0; same additive enum/table/composite key/Post foreign key |
| git diff --check | exit 0 |

Prisma checks used only the synthetic offline DATABASE_URL already documented
above. CHECKPOINT_DISABLE=1 and PRISMA_HIDE_UPDATE_MESSAGE=1 disabled Prisma
update checks/messages. The schema-to-schema diff did not connect to a database,
and no migration was applied. Jest emitted a non-failing transitive DEP0040
punycode deprecation warning; all suites and typechecks still passed. No source
repair or dependency upgrade was needed for supported-runtime compatibility.

### Reproduction

Resolve RECEIPT_NODE22_BIN to the directory containing the provisioned cached
Node binary and RECEIPT_PNPM10_CLI to the cached PNPM 10.6.1 bin/pnpm.cjs entry.
These are task-specific variables, not replacement HOME or CODEX_HOME values.
From the owned worktree root, export PATH="$RECEIPT_NODE22_BIN:$PATH" and
CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1, then replace every `pnpm`
in the earlier reproduction commands with:

```sh
"$RECEIPT_NODE22_BIN/node" "$RECEIPT_PNPM10_CLI"
```

Keep --config.managePackageManagerVersions=false on each PNPM invocation.
Additionally run the same prefix with `exec prisma generate --schema
libraries/nestjs-libraries/src/database/prisma/schema.prisma`; no db push,
migrate deploy, live URL or provider operation is part of this validation.

### Reconciled assurance and remaining gates

Owner reports independent Avicenna review found no additional actionable bug.
This is attributed review evidence from the Owner's current handoff, not a claim
that this session dispatched or independently reread that review.

Supported local runtime gate: verified/closed. Bounded implementation validation:
complete. No production completion claim: approved canonical promotion, release
image validation, PostgreSQL schema application, coordinated Temporal worker
rollout/history validation and live receipt observation remain separate gates.
The documented provider-to-database non-atomic window and safe ambiguity holds
are unchanged. This validation did not commit, deploy, publish, access a live
database, read secrets, or modify implementation files.

## Isolated SQL / native Temporal / capability checkpoint — 2026-10-08 12:02 UTC

Owner authorized task-owned local Docker containers after starting existing
Docker Desktop 29.7.2. Same-owner claim CLM-7E630A7EA145 was explicitly renewed;
latest lease expiry 2026-10-08T15:56:12Z. No competing claim or baseline change.

### Actual isolated PostgreSQL: passed

Cached postgres:17-alpine image identity:
sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193;
server PostgreSQL 17.10, aarch64 Alpine. Container
story-frame-receipts-pg-20261008-01a11404 was explicitly task-labeled, exposed only
127.0.0.1:15432 and used tmpfs, without existing data mounts. No image was pulled.

postgres-migration-check.cjs applied FULL generated fork-baseline DDL followed by
the exact migration.sql inside one rollback-only transaction on a fresh dedicated
database. PASS: existing fixture Post content preserved; three ordered receipts;
immutable conflict/time behavior; repeat-run identity; duplicate PK rejection
23505; orphan FK rejection 23503; invalid status rejection 22P02; Post delete
cascade; full rollback. A separate psql check confirmed public table count 0 after
rollback. The exact task container was stopped/auto-removed; no fixture data was
retained. No db push, reset, production URL or production database operation.

Harness repairs are documented in LOCAL_VALIDATION_PLAN.md: supply cached PNPM
CLI explicitly because exec omits npm_execpath; interpret TIMESTAMP(3) via AT TIME
ZONE UTC instead of pg's host-local naive timestamp decoder. Neither repair
changes migration or application behavior. Final SQL runner exited 0.

### Actual Temporal SDK/native replay: passed, bounded scope

Installed @temporalio/worker/native-core 1.15.0 bundled the ACTUAL full workflows
index (3.60MB) under Node 22.12.0. temporal-replay.cjs / pass-through interceptor
replayed synthetic V112 and V113 full publication paths and asserted actual
scheduled activity names, provider task queue and V113 post/run arguments.
PASS negative controls: V113 scheduled names differ from V112 history; a valid
open timer history rejects an activity command with TMPRL1100 nondeterminism.
Final native runner exited 0 and its workers stopped.

Raw native replay accepted changed activity names/IDs in these fixtures. Explicit
outbound command assertions therefore supplement replay; do not describe raw
replay alone as activity-interface compatibility proof. The inherited source
.swcrc has a non-portable baseUrl; the TEST bundler disables discovery and supplies
repository aliases. Production compiled-JS artifact validation remains separate.
Synthetic history is not production history, and no real activity/provider runs.

Cached Temporal admin-tools CLI was inspected locally and reports embedded Server
1.28.0. No Temporal dev server was started; no real queue-dispatch or mixed-worker
rollout test is claimed. This preserves the Owner's bounded experiment limit.

### Owner-approved Story capability activation gate: implemented

Authenticated GET /public/v1/integrations/story-frame-capabilities (relative API
path /integrations/story-frame-capabilities) returns exactly:

```json
{"contractVersion":"story-frame-receipts-v1","maxFrames":3,"perFrameReceipts":true}
```

Controller -> DTO/service -> repository directly calls Prisma
storyFrameReceipt.findFirst, organization-scoped through Post, selecting EVERY
new receipt column. This avoids the empty-Post nested-query false-ready case.
Empty migrated tables are ready; missing/partial schema or DB failures produce
generic 503 'Story frame receipts schema is not ready'. No content, credentials,
receipt rows or DB error details are exposed. No raw SQL is used in application
readiness code and no legacy fallback/migration side effect is introduced.

Fresh supported-runtime tests: 7 suites, 46/46 passed; backend, orchestrator and
test/source typechecks each exited 0. Capability regressions cover exact static
response/authenticated org plumbing/direct table column projection and fail-closed
P2021/P2022/P1001 behavior. git diff --check passed. Prior 40-test checkpoint is
historical and superseded by this additive gate verification.

### Remaining release prerequisites

1. Focused review of capability additions (earlier Avicenna review predates them),
   then canonical source commit/merge/promotion through the main task.
2. Release artifact/runtime/schema identity reconciliation. Owner reported a
   production fork-base/image and Node 22.20 read-only reconciliation; this session
   did not inspect production or change the source baseline based on that report.
3. Approved LIVE additive schema application after live-schema drift check; local
   rollback-only success is not production migration completion.
4. Stage new receipt activity handlers and V113 workflow exports on all relevant
   workers before enabling backend capability response and three-frame Content.
   Real history/server dispatch/mixed-worker compatibility remains unobserved.
5. Content preflight must fail before uploads/publish on missing route, error/503,
   or contract mismatch; NO legacy fallback. The capability probes backend/schema,
   not worker-version parity. Observe real per-frame receipts only in a separately
   authorized release/publication window.

Current status: locally verified source and isolated SQL/native replay; release
and production observation open. Updated exact file inventory and prerequisites
are in CHANGED_FILES.md / RELEASE_REQUIREMENTS.md. No commit, merge, production
deployment, production database write or publication was performed here.

## Focused source commit authorization

Owner subsequently reported independent Avicenna assurance found no capability
blocker and explicitly authorized the local source commit with source/tests,
work-item documents, isolated SQL and native replay evidence. Unfinished image
packaging is excluded. Supported-runtime verification remains 46/46 tests and
three typechecks; isolated PostgreSQL and native Temporal results above remain
unchanged. Coordinator check passed without identity mismatch or conflict.
The host's implicit machine-local Git email is unsuitable; use only per-command
author/committer identity matching the intentional Owner identity in canonical
fork and Meta history, verified by ai001_safe_commit.py. No global Git identity
configuration, push, live database operation, deployment or publication is part
of this commit authorization.

## Explicit workflow activation remediation

The focused implementation was committed as f58bddb03d40c3f92eb1544ffb46b13ff991e737
with verified identity/trailers and no push. Owner then identified the real mixed-
old-worker rollout hazard from unconditional V113 dispatch. Re-plan route:
decomposition, separating handler installation from workflow activation.

New shared process policy defaults to V112 only when unset or explicitly V112;
V113 requires explicit selection. Empty/unknown values reject outside legacy
Temporal catch blocks and before existing workflow termination. Normal starts
and missing-post recovery both use this helper. Existing workflow source is
unchanged. Capabilities require explicit V113 selection AND the successful
receipt-table/column probe; inactive or invalid selection gives generic 503
without querying the schema. No provider worker parity is inferred from this GET.

Node 22.12.0 / PNPM 10.6.1: 60/60 tests, seven suites, and backend/orchestrator/
test-source typechecks each exit 0. Tests exercise actual service.startWorkflow
and missing-post activity paths for unset/V112/V113, invalid rejection before
Temporal calls, inactive capability 503, active schema-success response and
active schema failures. Historical 46-test result predates this gate.

Release remains open: deploy the same new handler image with V112 first, verify
all old workers/pods gone and main/provider queues supported, then a second
rolling activation of that same image with V113. Content activates only after
that second rollout and schema readiness. Production SQL, actual queue rollout
and live publication observation remain unperformed here.

## Minimal image packaging and real operator validation

See IMAGE_PACKAGING.md for the complete hypothesis, failed experiments,
Main-owned helper repairs and final regression evidence. The exact production
amd64 base was pulled and inspected locally. Node 22.20.0, PNPM 10.6.1,
Prisma 6.5.0 and all dependency manifests match. Minimal backend/orchestrator
compilation and Linux-generated Prisma client passed without frontend rebuilding
or database access. Actual compiled Temporal workflow bundling passed offline.

Final real PostgreSQL 17.10 integration through the repaired operator helper
passes absence/apply/check/idempotent/partial-held/data-preservation cases under
native supported Node 22.12.0 and Prisma 6.5.0. Canonical semicolon-comment SQL
fixture and original migration hash are explicitly regression-tested. Both
historical helper failures (void decoding and naive comment splitting) are
superseded by this successful fresh-database run. Main-owned helper was inspected
and tested, not edited by this task.

The final local image includes read-only canonical migration.sql at the controlled
operator path, verifies its digest and helper export, defaults workflow activation
to V112, and replaces the unsafe inherited entrypoint/CMD. Full frontend and
nginx hashes are unchanged. The disposable PostgreSQL container was removed
after validation. Owner authorized a focused local packaging commit after these
checks; no registry push, live-schema operation, deployment or publication.
