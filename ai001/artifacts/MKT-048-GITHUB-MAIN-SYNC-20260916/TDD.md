# MKT-048 GitHub main sync — TDD

## Implementation

- Keep the upstream global Meta Graph API constant at `v25.0`.
- Add a named Story-specific constant at `v20.0`.
- Replace only Story upload/status/finalization/lookup URL construction with
  the Story-specific constant.
- Leave OAuth, page discovery, feed, comments, video feed, and analytics calls
  on the global constant.

## Verification

- Focused Jest tests for the Facebook provider and Story URL helper.
- Static search to ensure Story endpoints use the Story constant and general
  endpoints retain the global constant.
- Repository-required `pnpm` checks proportional to the changed provider.

## Rollback

Revert the topic branch/PR. Production is not changed by this work item.
