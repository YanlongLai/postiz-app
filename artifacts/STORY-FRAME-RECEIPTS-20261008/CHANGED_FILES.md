# Exact implementation inventory

All paths are relative to the owned postiz-story-frame-receipts-20261008 worktree.
Fork baseline is b701236ab1ea969d52c22173c2db0667f0db587f.
Focused implementation commit: f58bddb03d40c3f92eb1544ffb46b13ff991e737.
Activation follow-up: 71c3dcb72af1e3f3789fa537f53d61aa9fb62222.
No push or deployment performed here.

## Packaging and activation additions

- Dockerfile.story-frame-receipts
- var/docker/story-frame-receipts/start.sh
- var/docker/story-frame-receipts/ecosystem.config.cjs
- var/docker/story-frame-receipts/verify-image.cjs
- var/docker/story-frame-receipts/apply-schema.cjs (Main-authored; tested here)
- libraries/nestjs-libraries/src/temporal/post.workflow.version.ts
- artifacts/STORY-FRAME-RECEIPTS-20261008/IMAGE_PACKAGING.md
- artifacts/STORY-FRAME-RECEIPTS-20261008/schema-operator-check.cjs

## Modified source

- apps/backend/src/public-api/routes/v1/public.integrations.controller.ts
- apps/orchestrator/src/activities/post.activity.ts
- apps/orchestrator/src/workflows/index.ts
- libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
- libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts
- libraries/nestjs-libraries/src/database/prisma/schema.prisma
- libraries/nestjs-libraries/src/integrations/social.abstract.ts
- libraries/nestjs-libraries/src/integrations/social/facebook.provider.ts
- libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts
- libraries/nestjs-libraries/src/integrations/social/instagram.standalone.provider.ts
- libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts

## New source

- apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.1.3.ts
- libraries/nestjs-libraries/src/dtos/posts/story.frame.receipt.dto.ts

## New tests

- apps/backend/src/public-api/routes/v1/story-frame-receipts.spec.ts
- apps/orchestrator/src/activities/story-frame-receipts.spec.ts
- apps/orchestrator/src/workflows/post-workflows/story-frame-receipts.spec.ts
- libraries/nestjs-libraries/src/database/prisma/posts/story-frame-receipts.spec.ts
- libraries/nestjs-libraries/src/integrations/social/story-frame-receipts.spec.ts

Existing facebook.provider.spec.ts and facebook-story-url.spec.ts were run unchanged.

## New or updated implementation evidence

- artifacts/STORY-FRAME-RECEIPTS-20261008/EVIDENCE.md (updated)
- artifacts/STORY-FRAME-RECEIPTS-20261008/TDD.md (updated)
- artifacts/STORY-FRAME-RECEIPTS-20261008/REQUIREMENTS_GRILL.md (new)
- artifacts/STORY-FRAME-RECEIPTS-20261008/RELEASE_REQUIREMENTS.md (new)
- artifacts/STORY-FRAME-RECEIPTS-20261008/CHANGED_FILES.md (new)
- artifacts/STORY-FRAME-RECEIPTS-20261008/baseline.prisma (new, exact HEAD schema snapshot)
- artifacts/STORY-FRAME-RECEIPTS-20261008/migration.sql (new, generated offline, not applied)
- artifacts/STORY-FRAME-RECEIPTS-20261008/jest.config.cjs (new, scoped test runner)
- artifacts/STORY-FRAME-RECEIPTS-20261008/tsconfig.tests.json (new, test/source typecheck)
- artifacts/STORY-FRAME-RECEIPTS-20261008/LOCAL_VALIDATION_PLAN.md (new, hypotheses and bounded repair record)
- artifacts/STORY-FRAME-RECEIPTS-20261008/LOCAL_SERVER_REQUIREMENTS.md (new, isolated reproduction contract)
- artifacts/STORY-FRAME-RECEIPTS-20261008/temporal-replay.cjs (new, actual SDK/native-core replay)
- artifacts/STORY-FRAME-RECEIPTS-20261008/temporal-replay.interceptor.ts (new, pass-through command capture)
- artifacts/STORY-FRAME-RECEIPTS-20261008/postgres-migration-check.cjs (new, fail-closed transactional SQL integration test)

The pre-existing untracked PRD.md and work-item.json are preserved unchanged.
Ignored local node_modules was provisioned via PNPM offline with scripts disabled;
the local generated Prisma client is not a source edit or production migration.
