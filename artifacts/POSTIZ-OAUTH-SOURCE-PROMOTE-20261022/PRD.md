# Postiz source promotion

Phase: ready-for-design. Risk tier: R3. Authority: the Owner's direct request in Codex task 01a16211-ed83-79c1-af01-bf7acea4ea7f to create a new worktree, merge the Postiz source, deploy, and clean this task.

## Goal and acceptance

Promote the three preserved OAuth/schema commits ce0a14c3, a31559dc and ef74d3a7 into YanlongLai/postiz-app main through a reviewed PR. Preserve their ancestry, verify the existing immutable image built from ef74d3a7, and complete the official selective code-only release with fresh health and runtime evidence.

The functional source is ef74d3a70fc1b4984eac59ee13b929b32af98f8f. The image is ghcr.io/yanlonglai/postiz-app:meta-oauth-schema-20261022-ef74d3a7@sha256:3730969ba40c12ce90d47250eb2d95c02c98fd8633506ac5a703ed4e37d78468. New promotion documentation does not change those runtime inputs. A merge commit must retain ef74d3a7 as an ancestor of canonical fork main.

## Boundaries

Android submissions belong to another session. This work does not alter credentials, reconnect providers, publish content, change schedules, or change unrelated service pins. The existing Marketing claim and its worktree remain with their owner. The previous expired Postiz claim was taken over explicitly for the bounded source promotion; its source and artifacts remain preserved.

## Stop conditions

Stop promotion on a failing regression, actionable independent review finding, source/image mismatch, active overlapping owner, live release Lease, or failed release gate. Preserve uncertain deployment outcomes and read them back before retry. Keep a reproducible rollback target and do not bypass a production gate.
