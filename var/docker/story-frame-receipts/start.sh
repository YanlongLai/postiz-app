#!/bin/sh
set -eu
cd /app
case "${POSTIZ_WORKFLOW_VERSION-V112}" in
  V112|V113) ;;
  *) echo 'POSTIZ_WORKFLOW_VERSION must be V112 or V113' >&2; exit 64 ;;
esac
case "${POSTIZ_PROCESS_ROLE:-all}" in
  all|web) nginx ;;
  orchestrator) ;;
  *) echo 'POSTIZ_PROCESS_ROLE must be all, web or orchestrator' >&2; exit 64 ;;
esac
exec pm2-runtime start /app/var/docker/story-frame-receipts/ecosystem.config.cjs
