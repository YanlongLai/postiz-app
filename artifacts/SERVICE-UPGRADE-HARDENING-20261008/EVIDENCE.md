# Evidence and checkpoint

## Replay verifier lifecycle follow-up

Temporal 1.15's single-result replay convenience API did not exhaust its cleanup
iterator, so PASS preceded worker drain. The verification helper now fully
consumes runReplayHistories before assertions and requires the typed negative
determinism failure. Nine regression tests and independent assurance passed.
Native verification with the revised helper mounted read-only into the same
immutable image exited zero only after every worker stopped: prebuilt 88 ms
preparation/833 ms replay; source 1482 ms preparation/454 ms replay. Different
host load affects absolute timings; these are not whole-service startup claims.
This follow-up changes only verification code and evidence, not the production
runtime or compiled workflow bundle. The selected image source remains the
explicitly tested v2.25 integration commit and digest, not a newer arbitrary HEAD.

## Final image verification, 2026-10-09 07:16 UTC

The corrected linux/amd64 image completed successfully. Local immutable image
identity is sha256:00e78fa40e0f7c930eee641ad324931dafc7aa2b53cf6aff11a1af5248c8daea.
The image's runtime/Prisma/receipt model, retained V112 and V113 exports,
non-migrating startup roles and generated upload routes all passed with network
disabled. Native isomorphic DOMPurify/jsdom and the actual compiled sanitizer
preserve readable content while rejecting executable markup; sanitization was
not disabled to resolve the frontend build failure.

Both native Temporal replay modes passed synthetic V112/V113 histories and
rejected the deliberately incompatible negative history. Prebuilt preparation
took 75 ms versus 3285 ms for source bundling (about 98% less preparation time).
These measurements do not represent whole-service startup; native worker drain
after the negative control also completed and both processes exited zero.

The final image's Prisma operator passed a second isolated PostgreSQL drill:
80 additive statements, exact baseline/target catalog identities, apply/reapply/
read-only verification, 1/1/1 synthetic media/post/receipt preservation and atomic
rollback control. PostgreSQL runs arm64 locally while the operator image runs
amd64; this is not a production migration or full amd64 database drill.
All 48 focused Node regression tests passed without skips. The final image
contains the same runtime source; a later added test and this evidence are not
runtime changes. Frozen promotion, fresh pre-upgrade backup and selective live
verification remain open. Production has not been upgraded; no social post ran.

## Frontend build remediation, 2026-10-09

The frozen full image hit exit 137 during the frontend compiler. Docker reports
8,319,213,568 bytes of memory and 18 CPUs, with no other running containers at the
follow-up observation. A per-Node 3072 MiB heap and two workers did not constrain
aggregate Turbopack memory; the later Turbopack attempt was also killed. No failed
image is approved for release and no production service was changed.

The canonical release Dockerfile now explicitly selects webpack, with installed
Next 16.3.1's supported webpackBuildWorker and webpackMemoryOptimizations options.
It preserves locked dependencies, generated upload-route checks and prebuilt
workflow verification. Four configuration regression tests pass, including
disabled telemetry, DSN-only instrumentation and explicit upload-token behavior.
Independent review found no actionable regression in this scoped change; actual
image completion, native replay and aggregate memory evidence remain pending.
Reference: https://nextjs.org/docs/app/guides/memory-usage

## Checkpoint 2026-10-09 04:50 UTC

Implementation in progress; not merged, pushed or deployed. GitHub Actions paused,
not run/not passed. 107 retained/customized Jest tests and Backend/Orchestrator/
Frontend type checks pass. Independent review confirmed 21 old workflow files
and 29 existing decorated activity signatures unchanged.

### Remediation and measured evidence

1. Independent P1: a clean v2.25 frontend build without STORAGE_PROVIDER baked
   uploads to /404. Fixed explicit local build configuration and added generated
   route verification. Final fixed image build remains in progress, not passed.
2. Independent P1: existing schema Job shipped only Story receipt SQL, omitting
   v2.25 columns/tables. Captured production structure read-only, with no data,
   credentials, owner or privilege export. Actual Mastra runtime tables differ
   from the Git-only baseline. Regenerated 80-statement SQL against introspected
   structure and preserved unsupported catalog details in the schema-only fixture.
3. Isolated PostgreSQL 17 drill passed using a local pinned arm64 image, no
   external networking or host ports. Production baseline catalog digest matches
   the recreated fixture exactly: c7e4ac4820ae3520ded639ff77e8d1e09d06400d90453203305a1204471dcf12.
   SQL preserved synthetic Media/Post/Story receipt counts, and rollback control
   preserved the entire catalog. The real Prisma operator applied once, re-applied
   idempotently and verified read-only. Temporary containers were removed by
   exact ownership checks. This is not a production-backup restore or amd64 proof.
4. The operator binds SQL bytes, statement count, baseline/target catalog hashes;
   it locks relations and verifies target inside one bounded transaction. Fourteen
   Node unit tests pass, including mismatch/destructive-SQL/partial-result controls.
5. First full amd64 image built successfully but was captured before fixes;
   it is explicitly not releaseable. Its old replay fixture still asserted Node
   22.12.0; current fixture derives the canonical 22.20.0 package pin. Final image
   must run the updated test before release.
6. Dependency-cache refactor initially omitted .npmrc, so frozen install correctly
   rejected injectWorkspacePackages mismatch. Added the tracked configuration;
   do not regenerate or relax the lockfile to bypass it. Prisma generation now
   uses the installed locked 6.5.0 CLI rather than dlx's separate dependency graph.

### Open criteria

Final fixed image/native replay and bundle startup measurements; exact migration
independent review and backup restore; retention collector integration; frozen
release gates, merge and selective production verification remain pending.
Progress: at-risk until those gates pass. No social publication, live SQL migration,
service restart, Bastion change or SD3.5 reinstatement has occurred.

## Bounded safety remediation follow-up

Independent drill review found ambient Docker context targeting, ambiguous create
cleanup and temporary-init-server readiness defects. The drill now validates an
explicit local socket, removes ambient remote targeting variables, attempts exact
ownership cleanup even after ambiguous creation, and requires final PostgreSQL
PID 1 plus TCP readiness. A second review found cleanup could emit success too
early or expose daemon diagnostics. Success is now emitted only after verified
cleanup; failures use one sanitized code. Forty-three Node regression tests pass,
with no TODO, skip or live execution. The real isolated Prisma drill was rerun
against the exact production-schema fixture after the initial socket/readiness
repair; the final cleanup-policy rerun is pending collection.

Workflow bundle manifest v2 covers sorted compiled JavaScript paths and hashes,
not just the entry point. Sibling dependency drift, missing metadata and symlinks
fail closed. The 107-test Jest run includes this contract. The final amd64 image
is being rebuilt from the corrected source; earlier image identities are not
release evidence and production remains unchanged.
