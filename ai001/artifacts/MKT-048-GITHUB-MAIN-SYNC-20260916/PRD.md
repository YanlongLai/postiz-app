# MKT-048 GitHub main sync — PRD

## Problem

Facebook Story publishing needs the legacy Graph API version for Story upload,
finalization, status polling, and canonical Story URL lookup. The current
upstream provider uses the newer global version, while the running DappGo
release has already demonstrated the Story-compatible version.

## Goal

Promote the DappGo compatibility behavior to `YanlongLai/postiz-app:main`
without globally downgrading unrelated Facebook authentication, feed, page,
or analytics calls.

## Acceptance criteria

1. Story-only Graph calls resolve through `FACEBOOK_STORY_GRAPH_API_VERSION = v20.0`.
2. General Facebook calls continue to resolve through `META_GRAPH_API_VERSION = v25.0`.
3. Existing canonical URL validation and Story fallback behavior remain intact.
4. Regression tests cover both version boundaries and canonical URL behavior.
5. No provider mutation is performed by the test suite.
