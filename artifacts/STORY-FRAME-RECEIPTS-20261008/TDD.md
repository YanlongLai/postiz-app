# Receipt design

## Startup remediation hypothesis — optional native telemetry

The third official release verified the additive schema but the new V112
orchestrator did not become ready. A blocked process had loaded the native
Sentry CPU profiler even though its DSN was unset. Independent bounded imports
and native Temporal connection probes succeeded, so a deterministic profiler
deadlock is not established. Defer this optional native module until the existing
DSN guard permits telemetry, inside its existing error boundary. Preserve enabled
telemetry settings and every workflow byte. Unit tests must reject native loading
when disabled and preserve configured/error behavior. The exact target image
must verify this in both compiled service trees. Production readiness and queue
poller checks remain mandatory; passing imports cannot substitute for them.

## Explicit activation policy

POSTIZ_WORKFLOW_VERSION selects V112 by default (unset or explicit V112).
Only explicit V113 permits new V113 starts and a successful capability response;
empty/unknown values reject rather than falling back. Normal starts validate
before any existing-execution termination. Missing-post recovery applies the same
policy; deterministic workflow code and existing workflow bytes remain unchanged.
Capabilities fail 503 before the schema probe when inactive/invalid. Rollout is
two-phase using one image: first V112 everywhere until every old worker is gone,
then V113 activation on that same image, then Content activation.

Use existing provider pending/finalize interfaces with additive typed receipt
data. Persist only confirmed per-frame identifiers through the existing service
and Prisma repository boundary. New workflow version and activity when required;
no editing existing workflow files. Authenticated query must constrain organization
and return a narrow explicit projection. Never infer a platform ID from a pending
container or scheduling ID. Keep ambiguous Facebook mutations on hold.

## Implemented contract

New V113 is copied from dispatched fork V112; all existing workflow files remain
byte-identical. Scheduling and missing-post starts select V113; existing execution
histories continue using their original activities and signatures. Generic code
calls new provider methods, with default delegation for unaffected providers.

Confirmed receipts use zero-based frameIndex, platformId, confirmedAt (ISO UTC),
and status=confirmed. Provider methods await persistence after each successful
publish response, before another frame mutation. Nested Prisma upsert scopes the
write to the organization-owned post and keeps existing confirmations immutable.
The internal publicationId is Temporal runId, preventing repeated schedules from
using earlier-occurrence confirmations. It is never projected through the API.

GET /public/v1/posts/:id/story-frame-receipts uses existing PublicAuthMiddleware
and its authenticated organization. The response is {postId, receipts:[{postId,
frameIndex,platformId,confirmedAt,status}]}; missing/foreign/deleted posts return
404. Existing posts with no new confirmations return an empty receipts array.
The GET returns known receipt history; repeated occurrences may have repeated
frameIndex values with different confirmation times. No run ID or pending state
is exposed and no completeness/success inference is made from an empty/partial
array.

Facebook resumes an armed frame only when a durable receipt proves confirmation;
otherwise the existing ambiguity hold remains. Instagram skips durable confirmed
frames, preserving real IDs. A PUBLISHED container without a saved real media ID
holds: the local source has no verified container-to-media-ID lookup contract.
Single-frame Stories are marked in opaque pending state so V113 also records them;
ordinary Instagram Feed/carousel paths keep legacy behavior.

## Owner-approved capability preflight

GET /public/v1/integrations/story-frame-capabilities remains under existing
PublicAuthMiddleware and authenticated organization context. Controller -> typed
DTO/service -> repository performs a DIRECT Prisma storyFrameReceipt.findFirst
read scoped through the owning post, selecting every new receipt column. A direct
receipt read is required: nested receipt selection on an empty Post result could
avoid querying a missing table. No receipt rows are returned by this endpoint.
On successful probe (including empty migrated tables), the exact response is
{contractVersion:'story-frame-receipts-v1',maxFrames:3,perFrameReceipts:true}.
Any probe failure returns generic 503, without DB/provider details. There is no
raw SQL in application readiness code, caching, auto-migration or legacy fallback.
This proves backend contract/schema availability, not provider-worker rollout
readiness. Enable the new backend/capability response only after staged workers
have the V113 handlers; Content's three-frame activation must require this gate.
