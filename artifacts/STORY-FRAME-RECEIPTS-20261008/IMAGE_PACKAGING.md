# Bounded image packaging experiment

## Hypothesis and decomposition (before execution)

The exact production amd64 image can serve as both builder and runtime base,
retaining its Node 22.20 runtime, installed dependency closure, nginx and
frontend artifacts. Only backend/orchestrator compiled output and the target-
generated Prisma client/schema need replacement. No dependency installation,
frontend build, database connection or database schema synchronization belongs
in image construction or startup.

Disprove this hypothesis if the pinned image lacks build tools, differs in
dependency manifests/lockfile, cannot compile the scoped source, cannot generate
Prisma offline for its Linux target, or changes preserved frontend artifacts.
Re-decompose rather than substituting an upstream or floating image.

1. Pull the exact digest for linux/amd64 with bounded output polling.
2. Inspect image configuration and a network-disabled, entrypoint-overridden
   disposable container. Do not inspect secret/environment file contents.
3. Verify Node/PNPM/Prisma/Nest tools, source/dependency layout and frontend hash.
4. Prepare a digest-pinned overlay Dockerfile and non-mutating process startup
   configuration inside the expanded same-owner claim.
5. Build locally only when the dependency closure is verified; compare frontend
   hashes and check compiled workflow/Prisma exports with networking disabled.

The default repository CMD invokes root `pnpm run pm2`, whose `pm2-run` first
deletes processes and runs `prisma db push --accept-data-loss`. It must not be
inherited. Additive production SQL remains a separate approved release step.
No registry push, production deployment, publication or live database operation
is authorized by this experiment.

## First experiment and revised hypothesis

The exact amd64 artifact pulled successfully. Its platform config digest is
014038372ac111dd2981ab44817bea85d07eb7ee599bf565f6ff856313653182;
the supplied 79edf720 digest is the OCI index. Runtime inspection confirms
Node 22.20.0, PNPM 10.6.1, Prisma 6.5.0, Nest 11.0.21, pm2-runtime and nginx.
All five manifest/lockfile hashes match the owned source exactly. Actual image
entrypoint is docker-entrypoint.sh and CMD is sh -c 'nginx && pnpm run pm2'.

Offline Prisma generation succeeded. First backend compilation failed at the
default approximately 2 GiB Node heap limit. Re-plan route: hypothesis (the
dependency/layout decomposition holds). Adopt the original Dockerfile.dev's
4096 MiB build-only NODE_OPTIONS setting, then retry once. This setting is not
inherited by the runtime stage. No frontend build, dependency install or DB
connection occurred.

Baseline full frontend regular-file hash, excluding only node_modules:
6a380e1078abcbd8e5d7dd9339af452712e3210c756c97c6c021cffe3f5d4fa4.
Baseline nginx config hash:
3de8784ec0031427edd18b1e40cf7bcb8a6057441a7875ee94a2ac2a4264053a.

## Successful overlay and activation follow-up

With the original build's 4096 MiB heap budget, backend and orchestrator compiled
offline in 119.5 seconds total. Both target-generated Prisma model and V112/V113
compiled exports passed entrypoint-overridden, network-disabled checks. Full
frontend and nginx hashes matched the baseline exactly. No frontend rebuild.
This first successful local image predates the explicit workflow activation gate
and is not a rollout candidate; the gate-inclusive rebuild is the next check.

Read-only canonical marketing deployment source confirms the postiz container
at deploy/k8s/marketing-stack.yaml:442 pins this base at line 445 and does not
override command/args. The later commands are Kubernetes probes and the separate
watchdog sidecar, not the Postiz entrypoint. Thus replacing the inherited image
entrypoint/CMD is essential; no Marketing repository file was edited here.

Packaging defaults POSTIZ_WORKFLOW_VERSION=V112, passes the activation environment
to the existing per-package start commands, and rejects invalid values before
nginx/PM2 startup. The policy helper is included in both compiled service trees.
The same tested image is used for both phases; only explicit activation settings
change on the second rollout after all old-image workers are gone.

The canonical committed migration.sql is copied read-only into
/app/var/docker/story-frame-receipts/migration.sql. SHA256 is
91ad195e56fbaf0e964c732f5aaccaa1f1bd9b04b5d566b1d2f396ee700a61ee,
also asserted by verify-image.cjs. This is operator-controlled release material,
not a startup migration; startup never reads or executes this SQL.

## Operator helper experiment hypothesis (before execution)

The separately Main-owned apply-schema.cjs should fail closed for absence on
check, create exactly the additive contract on explicit apply, verify an existing
complete schema idempotently, and refuse partial schema repair. Test it through
actual native Prisma transactions against full-baseline PostgreSQL 17 in a fresh
task-owned loopback/tmpfs container. Preserve every Post fixture field across
success/repeat/failure; destroy only that disposable container afterward. No
helper edits are in this task's scope. A failed real test is handed back to Main
with exact safe error code and the bounded failing operation.

### Actual operator failure and minimal verified repair proposal

On fresh loopback PostgreSQL 17.10 with full baseline and a synthetic Post,
actual native Prisma 6.5 passes absence check but explicit apply fails P2010
before DDL: Prisma cannot deserialize the void returned by
SELECT pg_advisory_xact_lock(hashtext('dappgo-story-frame-schema-v1')).
Receipt table remains absent and Post count remains one. Main-owned helper was
not edited. Re-plan route: hypothesis (the transactional/schema guard boundary
holds; the lock result type is wrong for Prisma's raw query decoder).

Proposed query replacement, verified with the same real Prisma transaction:
SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('dappgo-story-frame-schema-v1')).
It returns locked=true and preserves transaction-scoped advisory locking.
Application, idempotency and partial-schema cases remain blocked until Main's
repair is supplied and the full fresh-database experiment is rerun.

## Gate-inclusive verification checkpoint

Source implementation commits are f58bddb03d40c3f92eb1544ffb46b13ff991e737 and
71c3dcb72af1e3f3789fa537f53d61aa9fb62222 (activation follow-up); no push.
Gate-inclusive amd64 backend/orchestrator compilation passed in 115.7 seconds
with target Prisma generation and network-disabled RUN steps. Subsequent runtime-
layer assembly includes the Main-owned operator helper and canonical read-only
SQL, retaining the compiled policy in both services and default activation V112.

Entrypoint-overridden Linux checks passed: runtime versions, generated receipt
model, old V112/new V113 exports, activation policy in both compiled trees, SQL
digest and explicit process roles. Actual Temporal SDK compilation of the
release image's compiled workflow index passed: 3,641,668-byte bundle, V112/V113
present, no Temporal server or application/provider activity executed.
Default-entrypoint invalid-activation test exits 64 before nginx/PM2 startup.
Full frontend and nginx hashes are identical to the base above.

The disposable operator-test PostgreSQL container was stopped and auto-removed
after the failed lock experiment; only synthetic local fixtures were discarded.
No other container/volume or production state was changed. Packaging remains
local/uncommitted pending Main's operator repair and full successful integration
rerun. The local image is not published or a production-ready release claim.

### Second operator failure after Main's lock repair

The fresh-DB test with Main's text-cast lock progressed past the lock, then failed
P2010 / PostgreSQL 42601, syntax at token "no" (confirmed without printing raw
diagnostics). Main subsequently adopted the independently verified boolean lock
projection, but the separate SQL splitter still needs repair.

The canonical SQL's comment contains a semicolon: "Additive only; no historical
receipt backfill." Naive sql.split(';') breaks that comment into executable
text. Digest and canonical SQL must remain unchanged. Proposed Main-owned fix:
after digest verification, remove full-line SQL comments before splitting this
exact hash-pinned, known three-statement DDL. Do not generalize this splitter to
untrusted/arbitrary SQL. Full application/idempotency/partial tests remain open.

To isolate later guard behavior while the splitter is blocked, the canonical
SQL was applied as one intact PostgreSQL query ONLY in the disposable task DB.
The actual Prisma helper then returned verified on --check, confirming its
complete-schema guard query types work. This diagnostic is not evidence that
helper --apply works; the full fresh-DB helper application test is still required.

## Final repaired-helper verification: passed

This checkpoint supersedes the two historical helper failures above. Main's
helper now returns a supported boolean from the transaction advisory lock,
verifies the ORIGINAL SQL digest before removing full-line comments, and checks
exactly three statements. No broad/general SQL parser was introduced.
Verified helper SHA256:
d54403e45db3ed922d05e8295f2263440858eeb2cd6d45e7a0817df21419668a.

Fresh task-owned PostgreSQL 17.10, full fork baseline, actual native Prisma 6.5.0
under Node 22.12.0 / PNPM 10.6.1: schema-operator-check.cjs exits 0.
The actual canonical fixture retains its semicolon-containing comment and its
unchanged 91ad195 migration digest. The regression asserts that naive splitting
would yield four chunks, then exercises real helper application successfully.

- Absent check fails closed with story_schema_not_applied.
- Explicit apply creates the complete contract and returns applied.
- Check returns verified; second apply returns verified without DDL/data loss.
- Entire original Post row and all three confirmed receipt rows remain identical.
- Missing-column partial schema fails without repair or Post mutation.
- Enum-only partial schema remains held without creating a table or Post mutation.

Final amd64 overlay rebuild reused all compiled service layers and regenerated
only operator/runtime packaging layers. Target-runtime verification passed,
including the embedded helper export and its canonical migration digest.
Frontend regular-file and nginx hashes remain identical to the pinned base.
Default entrypoint is the explicit start.sh, no inherited root pm2/database push,
and activation defaults to V112. The temporary PostgreSQL container was stopped
and auto-removed; only disposable synthetic fixtures were discarded.

Reproduction from the owned source (local only):

```sh
docker build --platform linux/amd64 --network none --pull=false \
  -f Dockerfile.story-frame-receipts -t postiz-story-frame-receipts:local-20261008 .
docker run --rm --pull=never --platform linux/amd64 --network none \
  --entrypoint node postiz-story-frame-receipts:local-20261008 \
  /app/var/docker/story-frame-receipts/verify-image.cjs
```

Local packaging acceptance is verified; production readiness remains a separate
gate: canonical promotion, published/frozen image identity, approved live-schema
check/application, two-phase same-image worker rollout, then Content activation
and separately authorized live receipt observation. No registry push or live
database/deployment/publication action was performed.

Final locally inspected linux/amd64 image identity:
sha256:e802d7e1b6400c9481d25b0dab974650498883c52b6b2225fe3303e672c9be3a.
Local OCI index (including build attestation):
sha256:347a2181aea964b6e35549a0fceefc1763e0a0800e9ad5f03b7c4dd1fa0b3f2a.
These are local build evidence, not registry publication or canonical-release
promotion. Packaging/operator independent review remains with Main before rollout.
