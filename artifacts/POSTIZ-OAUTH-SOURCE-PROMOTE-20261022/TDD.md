# Design and verification

1. Start a clean named worktree from verified fork main f0a07798d1426cc911739e613f9c30d6a95ad5a7 and fast-forward only the reviewed repair lineage to ef74d3a7.
2. Run the existing Meta OAuth HTTP/provider regression suite and Node schema/upgrade regressions under the repository's supported Node runtime. Validate the work-item schema and check patch whitespace.
3. Obtain an independent read-only review of the three commits, schema idempotency, callback behavior, tests, and release/source mapping. Commit only promotion evidence in addition to the original preserved repair commits.
4. Merge using a normal merge commit to preserve the image's exact source ancestry. Fast-forward the designated clean main checkout without rewriting its existing local ce0a14c3 commit.
5. Freeze the merged Meta and Marketing pins already selecting the exact ef74d3a7 image. Stage allowlisted Postiz source from the preserved clean ef74d3a7 checkout through the existing official executor. Use code-only mode; no new OAuth transaction or publication is needed for this source promotion.
6. Verify rollout, immutable source/image identity, schema checks, fresh aggregate health, and the existing connected-state flags without reading tokens. Preserve exact logs and release receipts outside source.
7. Release this task's claim and remove its clean worktree without force. Preserve the prior source worktree unless its independent owner's evidence and pending work are explicitly reconciled.

Disproof: a test or review finds a defect, source staging differs from the image source, or official runtime verification cannot establish the pinned identity. Route a functional defect back to hypothesis; route an ownership/dependency mismatch back to decomposition before another attempt.

Rollback: retain the previously verified release bundle and exact Marketing/image pin. Reapply only through the official release path. No database rollback or credential mutation is part of this task; the existing Integration.customName change is additive and independently verified.
