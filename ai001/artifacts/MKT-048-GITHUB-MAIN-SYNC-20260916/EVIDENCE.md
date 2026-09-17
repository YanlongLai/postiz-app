# MKT-048 evidence — GitHub main promotion

## Acceptance matrix

| Criterion | Evidence | Result |
| --- | --- | --- |
| Story upload/status/finalization/lookup use Graph v20 | `facebook.provider.ts` uses `FACEBOOK_STORY_GRAPH_API_VERSION` for all Story-only edges | pass |
| General Facebook operations remain on Graph v25 | `META_GRAPH_API_VERSION` remains `v25.0`; non-Story URLs are unchanged | pass |
| Canonical Story URL behavior remains intact | Existing helper and fallback tests remain in `facebook-story-url.spec.ts`; provider tests pass | pass |
| Duplicate-safe failure behavior remains intact | `does not retry the publish when canonical URL lookup fails` passes | pass |
| No provider mutation during verification | All provider calls are mocked; no credentials configured | pass |
| Backend build compiles the changed provider | `pnpm run build:backend` | pass (Node 26 engine warning only) |
| Repository-wide CI is green | Default Jest config has pre-existing missing `@nx/jest`; full TypeScript check has unrelated baseline errors | pending upstream baseline repair |

## Commands

The focused regression run used an isolated config because the repository's
checked-in `jest.config.ts` imports the missing `@nx/jest` package:

```text
pnpm exec jest libraries/nestjs-libraries/src/integrations/social/facebook.provider.spec.ts libraries/nestjs-libraries/src/integrations/social/facebook-story-url.spec.ts --runInBand --coverage=false --config ai001/artifacts/MKT-048-GITHUB-MAIN-SYNC-20260916/jest.focused.config.json
Test Suites: 2 passed, 2 total
Tests:       7 passed, 7 total
```

Also verified:

```text
pnpm install --frozen-lockfile --ignore-scripts   # passed
pnpm run prisma-generate                          # passed
pnpm run build:backend                            # passed
git diff --check                                  # passed
```

## Release boundary

This evidence covers the GitHub fork promotion only. It does not authorize or
claim a production deployment. Production remains on the previously verified
image until a separate release/canary gate is approved.
