# Bounded validation decomposition — 2026-10-08

Authority: isolated local tests only, no live database/publication/production write,
no extra daemon. Renewed same-owner claim CLM-7E630A7EA145 after expired lease;
no competing owner was present. Preserve all existing implementation changes.

Hypothesis H1: installed Temporal Worker SDK/native core can bundle the actual
V112/V113 workflow code and replay synthetic publication histories entirely
offline. This tests workflow isolation and command compatibility without mocked
workflow APIs or a Temporal server. Counterevidence: bundle/native-load failure,
unexpected commands, or incompatible replay. Negative control: replay a V112
publication history as V113 must reject changed receipt activity commands.
Synthetic fixtures are NOT production history or server rollout evidence.

Hypothesis H2: additive SQL can be validated on an already-available isolated local
PostgreSQL server without starting an extra daemon. Read-only inventory found no
psql/postgres/temporal CLI, no installed @temporalio/testing package, and an
unreachable local Docker socket. Therefore no SQL application experiment starts:
an approved isolated server is prerequisite. Do not connect to environment URLs,
reset any database, pull images, install tools or start Docker/containers here.

Experiment sequence: (1) native offline bundle/replay, if runnable; (2) record
exact SQL/server launch requirements and test assertions; (3) reconcile the
completed Node 22 gate in release prerequisites. If H1 fails, return to hypothesis
and identify the installed SDK/config cause, with bounded fixes to test tooling
only. No production workflow, activity or provider edits are authorized here.

Experiment 1 failed before replay: SWC discovered the inherited orchestrator
.swcrc with a non-portable author-machine baseUrl. Re-plan route: hypothesis;
the fixture is not yet under test. Configure only this offline bundler to ignore
inherited .swcrc, retaining SDK TypeScript settings and explicit repository aliases.
Do not alter production build configuration or suppress replay errors.

Experiment 2: actual full workflow index bundled, and native replay accepted
both synthetic V112 and V113 paths. The negative assumption was disproved:
this history/SDK combination also accepted changed activity names on V113.
Re-plan route: hypothesis. Replay alone is insufficient for activity-interface
parity. Add a pass-through outbound interceptor/sink to capture actual schedule
commands and compare their names with the fixture; verify V113 receipt arguments
and use mismatched activity IDs as a native nondeterminism negative control.
No workflow implementation or historical file changes are made.

The strengthened harness first hit cross-V8-realm Array prototype identity in
Node assert.deepStrictEqual, despite matching scalar values. Compare the explicit
post/run scalars instead; this is test-harness normalization, not a relaxed
receipt contract. Native replay failures and activity name checks remain strict.

The installed native replayer also accepted a changed activity ID in this fixture.
Do not claim either name or ID checking from native replay alone. Final negative
control uses a structurally valid open history recording a timer instead of the
first activity command. The pass-through sink independently checks the actual
activity interface regardless of native history identity matching behavior.

Owner subsequently started existing Docker Desktop and authorized task-owned
isolated PostgreSQL/Temporal containers. H2 is now testable: local daemon 29.7.2
is reachable, PostgreSQL 17 Alpine and Temporal 1.28.1 tooling images are cached.
New decomposition: create a uniquely labeled PostgreSQL container on loopback
15432 using tmpfs, no existing volume; apply full baseline plus additive SQL in
the runner's rollback-only transaction. Prove constraints and untouched parent
data, then stop only the exact task-owned container. No db push/reset or live URL.

First SQL execution stopped before connecting: PNPM exec provides its user agent
but not npm_execpath. Correct test-tool hypothesis: explicitly supply the already
verified cached RECEIPT_PNPM10_CLI path. No baseline or migration was applied by
that failed guard. One corrected database experiment follows, then hand off.

The database experiment reached receipt assertions, then rolled back on a pg
driver timestamp interpretation mismatch: PostgreSQL TIMESTAMP(3) is timezone-less,
and pg interpreted its text as the host's local zone. Prisma's UTC storage contract
is unchanged. Normalize the test SELECT with AT TIME ZONE 'UTC' before comparing
ISO time. This changes only the test's read decoder, not migration or application
code. Parent data/schema were rolled back and the test database remains empty.
