# MKT-048 Experiment — Story API version split

## Hypothesis

Using `v20.0` only for Facebook Story endpoints will preserve the production
Story compatibility fix while avoiding an unnecessary global downgrade of the
newer Facebook Graph API used by other operations.

## Disproof conditions

- Any Story endpoint still resolves to `v25.0`.
- Any non-Story endpoint resolves to `v20.0`.
- Focused tests or provider type checks fail.
- The diff requires live provider credentials or creates an external post.

## Expected evidence

The final diff is limited to the Facebook provider, its tests, and this
AI001 work-item record; tests pass without network/provider mutation.

## Observed results

- `pnpm install --frozen-lockfile --ignore-scripts`: passed in the isolated
  worktree; no tracked dependency changes.
- `pnpm run prisma-generate`: passed locally; no schema or database mutation.
- Focused Jest run with the checked-in isolated config
  `jest.focused.config.json`: **2 suites / 7 tests passed**. The tests exercise
  the v20 Story publish and canonical URL lookup
  paths, preserve v25 for general calls, and preserve the no-retry fallback.
- `pnpm run build:backend`: passed locally. The workspace emitted the existing
  Node engine warning because this host has Node 26 while the repository asks
  for Node 22.12.x.
- `git diff --check`: passed.
- The repository's default Jest config is currently not runnable from this
  checkout because it imports `@nx/jest`, which is absent from the lockfile.
  This is recorded as a pre-existing test-infrastructure finding and is not
  included in this Story compatibility change.
- A repository-wide TypeScript check still reports pre-existing baseline
  errors in unrelated files; no error was reported in the changed provider or
  its focused spec.
- No live Facebook credentials, provider calls, scheduled posts, or
  production resources were touched.
