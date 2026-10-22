# Promotion evidence

## Intake and capture

- Task: 01a16211-ed83-79c1-af01-bf7acea4ea7f; host: local; worktree: postiz-oauth-source-promote-20261022.
- Verified GitHub fork main: f0a07798d1426cc911739e613f9c30d6a95ad5a7.
- Preserved remote repair head: ef74d3a70fc1b4984eac59ee13b929b32af98f8f.
- Claimed POSTIZ-OAUTH-SOURCE-PROMOTE-20261022 with CLM-2DE0E77C0953 after explicit expired-claim takeover. The original worktree was preserved.
- Private Access and Gitea health passed using the existing operator token file through the launcher's supported environment variable. The launcher's stale default file path was not treated as lost access.
- Live baseline: the Postiz Deployment selects the exact ef74d3a7 immutable image recorded in PRD.md and has one ready replica. The production release Lease has no current holder.
- Provider recovery is prior, separately accepted evidence. This task will verify persisted flags, not perform another reconnect or a test publication.

## Verification

- Supported runtime: Node v22.23.4, official Darwin ARM64 archive verified with SHA-256 c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428. Earlier host-Node-26 observations were superseded by the explicit supported-runtime checks below.
- Node schema/upgrade regression: 20 tests passed, zero failed/skipped; log node22-schema.log.
- Jest callback/receipt/workflow regression: 10 suites, 117 tests passed; log node22-jest.log. The existing receipt Jest configuration was reused with its existing patterns plus meta.oauth.http.test.ts.
- Marketing full unittest discovery: 175 tests passed; log marketing-unittest.log.
- postiz-meta-oauth-reconnect-contract: PASS for facebook and instagram.
- production-image-contract validate --require-all-digests: PASS, all supplied images pinned.
- Work-item JSON Schema and git diff --check: PASS.
- Independent review: PASS for the exact three-commit repair and preserved-ancestry image reuse, with limits recorded in REVIEW.md.
- Official selective release dry-run: completed for dappgo-marketing-agent plus the Meta coordinator, using code-only mode and exact ef74d3a7 source. This preview is not deployment evidence.

Exact invocation-owned logs and deployment receipts are retained in the task's private operator evidence directory. A started failing check blocks promotion; an unavailable CI check is recorded separately and never represented as passed.

## Release decision

Producer and responsible release director: proceed to normal reviewed PR merge and the existing official selective deployment under the user's scoped authority. Preserve original repair ancestry and the exact current immutable image. Fresh runtime and connected-state verification remain required before cleanup/completion.
