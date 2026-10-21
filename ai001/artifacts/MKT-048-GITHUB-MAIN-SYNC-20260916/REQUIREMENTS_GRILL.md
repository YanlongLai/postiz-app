# Requirements grill — MKT-048-GITHUB-MAIN-SYNC-20260916

## Intake

- Status: `ready-for-design`
- Assigned at: `2026-09-16T18:00:00Z`
- Assigned by: `Owner`
- Scope summary: Promote the verified DappGo Facebook Story compatibility fix to the YanlongLai Postiz fork main through an isolated branch and PR.
- Mutation class: `code`

## Work-item provenance

- Codex task ID: `01a08974-8062-7c61-a4af-e0212d205d8a`
- Host ID: `local`
- Repository: `YanlongLai/postiz-app`
- Branch: `fix/dappgo-mkt-048-story-v20-20260916`
- Worktree: `dappgo-mkt-048-story-v20-20260916`
- Session started at: `2026-09-16T18:00:00Z`
- Commit SHA: omitted until promotion
- Remote ref: omitted until promotion
- Pull request: omitted until promotion

## Facts verified by AI001

- Production runs `mkt-048-facebook-story-links-v223-20260914` at source commit `bf2ace25`, pinned by a GHCR digest.
- `fork/main` resolves to `b5d6b1e2` and already contains the canonical Facebook Story URL helper and regression tests from the equivalent fork patch.
- `fork/main` still uses the upstream `v25.0` Meta Graph API constant; the production compatibility pin is absent.
- The current production patch is deliberately narrowed here: retain `v25.0` for general Facebook operations and use `v20.0` only for Story operations, avoiding a global downgrade.
- Existing Postiz worktrees and released claims were inspected; no active overlapping MKT-048 or Facebook Story claim was found. The repository does not contain the coordinator script, so Git worktree and committed provenance are the ownership record for this item.

## Design-tree rounds

### Round 1 — frontier

#### Q1 — promotion scope

- Question: Which DappGo correction should be promoted first?
- Recommended answer: Promote only the verified Facebook Story Graph-version compatibility fix, preserve the existing canonical URL implementation, and do not merge the full upstream `main` or deploy production in this change.
- Owner answer: `可以先把自己的修正 提出來 套用到github 的main 並修復問題`
- Evidence/impact: The production Story receipts and MKT-048 evidence establish the problem boundary; a narrow PR is reviewable and reversible.

## Shared understanding

- Goal: Make the GitHub fork main carry the Story compatibility repair without losing current upstream provider behavior.
- Non-goals: No bulk upstream sync, no credential changes, no social publication, no production deployment in this bounded promotion.
- Acceptance criteria: Story-specific Graph calls use `v20.0`; non-Story Facebook calls retain `v25.0`; canonical Story URL tests remain green; focused and repository tests pass; PR is opened against fork `main`.
- Affected products/services: Postiz Facebook provider and its tests.
- Data/provider/platform boundaries: Facebook Graph API only; no live provider calls during tests.
- Rollout and rollback: Merge only after CI/review; production remains on the pinned image until a separate canary gate. Rollback is reverting the PR or retaining the current production image.
- Success and stop conditions: Stop if tests show non-Story regressions, if the diff expands beyond the provider/tests, or if live credentials/provider mutation would be required.
- Protected approvals still required: GitHub merge and production deployment remain Owner-authorized release actions.

## Readiness decision

- Owner confirmation: The current request authorizes promoting the bounded DappGo fix to GitHub main.
- Ready for design: `yes`
- Next AI001 action: Implement the version split, add regression coverage, run tests, and prepare the PR.
