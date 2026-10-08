# Not deployed: production prerequisites

1. Owner reports independent Avicenna review found no additional actionable bug,
   including the later capability additions. Owner authorized a focused local
   implementation commit, excluding unfinished packaging. Canonical promotion,
   push, merge, deployment and publication remain separate gates.
2. Local supported-runtime gate is COMPLETE: Node 22.12.0 + PNPM 10.6.1 passed
   46 tests, three typechecks and Prisma validation/generation/offline diff.
   Preserve the supported Node 22 range and validate the actual release artifact;
   the historical Node 26 warning is superseded by EVIDENCE.md.
3. Regenerate Prisma 6.5 client in the release image. Apply the additive schema
   before enabling the new API/activity code. migration.sql is an offline
   generated diff, NOT an applied migration or new migration-history baseline.
   It creates one enum, one receipt table, a composite primary key and a Post
   foreign key; no existing data is changed/backfilled. Reconcile the live schema
   against the fork baseline and test the approved schema application on an
   isolated PostgreSQL copy first. The local PostgreSQL 17.10 full-baseline plus
   additive SQL experiment now passes with rollback, preserved fixture data and
   PK/FK/enum/cascade checks; the live schema still needs separate reconciliation
   and approved application. Never blindly invoke prisma-db-push with its
   existing --accept-data-loss flag. This worktree does not contain a historical
   migrations directory; do not assume migrate deploy will apply this artifact.
4. Stage the new activity methods on all affected task queues before API/new
   scheduling and missing-post dispatch select V113. An old main worker can
   receive an unknown V113 start; an old provider worker can receive an unknown
   new activity. Use the existing coordinated versioned worker rollout, not an
   uncoordinated mixed-worker deployment. Retain V112 and all older exports and
   activity signatures for in-flight executions. Offline native Temporal SDK
   replay of synthetic V112/V113 histories and outbound command assertions now
   pass (see temporal-replay.cjs). Production-history replay, server dispatch,
   provider queues and mixed-worker compatibility remain unverified. Raw replay
   accepted changed activity names/IDs in these fixtures: never treat that as
   permission to rewrite V112 or migrate in-flight executions to V113.
5. In the separately approved observation window, verify authenticated reads,
   foreign-org denial, and each actually confirmed frame ID/time. Two scheduling
   or final-post receipts do not prove six individual Stories were published.
   No live publication or receipt claim is made by this implementation evidence.

## Local isolated-server prerequisite

Owner started existing Docker Desktop 29.7.2 and approved task-owned containers.
SQL validation completed on cached PostgreSQL 17 Alpine (server 17.10), using
only a loopback tmpfs container; that container was stopped/removed after rollback.
Native offline Temporal replay completed; actual Temporal dev-server execution
and real production-history/queue rollout checks remain open. The cached Temporal
CLI reports embedded Server 1.28.0 and can launch an isolated server if a later
bounded experiment requires it. None was launched here.

## Capability activation gate

Content's tagged three-frame Story preflight must require authenticated
GET /public/v1/integrations/story-frame-capabilities with exact contractVersion
story-frame-receipts-v1, maxFrames=3 and perFrameReceipts=true. Missing route,
503/schema failure or mismatched fields must reject activation without legacy
fallback. This endpoint reads all receipt columns through Prisma before reporting
ready; it does not prove provider workers are updated. Stage workers first, then
enable the new backend/capability route, and only then activate three-frame Content.
Owner subsequently confirmed the focused Avicenna capability review found no
blocker. Canonical promotion and actual worker/schema parity remain required.

## Known non-atomic provider boundary

Provider mutation and PostgreSQL receipt commit cannot be one transaction. If
the mutation succeeds but the real ID is lost before receipt persistence, the
safe outcome is a hold, not an invented receipt or blind retry. Facebook retains
its armed ambiguity hold. Instagram PUBLISHED containers with saved receipts
resume without publishing again; those without saved real IDs remain held. The
local provider code does not supply a verified real-ID lookup for that case.
Confirmed earlier frames remain available through the GET on partial failure.

## Rollback

Return new dispatch to V112 through a reviewed follow-up change only after
handling/draining V113 executions. Preserve the additive receipt table and
confirmations; do not drop it or erase evidence. Retain new activity handlers
until V113 is drained. No existing in-flight workflow is rewritten by rollback.
