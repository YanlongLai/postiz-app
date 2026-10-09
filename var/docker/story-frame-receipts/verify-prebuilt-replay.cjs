'use strict';
// Native replay only; no Temporal service connection or activity execution.
const assert = require('node:assert/strict');
const path = require('node:path');
const { Worker, bundleWorkflowCode } = require('@temporalio/worker');
const { temporal } = require('@temporalio/proto');
const { history } = require('../../../artifacts/STORY-FRAME-RECEIPTS-20261008/temporal-replay.cjs');
const entry = path.resolve('apps/orchestrator/dist/apps/orchestrator/src/workflows/index.js');
const root = path.resolve('apps/orchestrator/dist');
const mode = process.argv[2];
if (!['source', 'prebuilt'].includes(mode)) throw new Error('replay_mode_required');
async function replayOne(bundle, replayHistory, workflowId) {
  const results = [];
  // Exhaust the iterator before inspecting its result: the SDK's finally block
  // closes the history stream and awaits Worker/Core cleanup after the yield.
  for await (const result of Worker.runReplayHistories({ workflowBundle: bundle }, [
    { history: replayHistory, workflowId },
  ])) results.push(result);
  assert.equal(results.length, 1, 'one_replay_result_required');
  assert.equal(results[0].workflowId, workflowId, 'replay_workflow_identity_mismatch');
  assert.ok(typeof results[0].runId === 'string' && results[0].runId.length > 0, 'replay_run_identity_required');
  if (results[0].error) throw results[0].error;
}
async function main() {
  const begin = performance.now();
  let bundle;
  if (mode === 'prebuilt') {
    process.env.POSTIZ_PREBUILT_WORKFLOWS = 'true';
    const source = require(path.join(root, 'libraries/nestjs-libraries/src/temporal/workflow.bundle.js'));
    bundle = source.workflowSource(entry).workflowBundle;
  } else {
    bundle = await bundleWorkflowCode({ workflowsPath: entry, webpackConfigHook(config) {
      config.resolve.alias = { ...config.resolve.alias,
        '@gitroom/orchestrator': path.join(root, 'apps/orchestrator/src'),
        '@gitroom/helpers': path.join(root, 'libraries/helpers/src'),
        '@gitroom/nestjs-libraries': path.join(root, 'libraries/nestjs-libraries/src') };
      return config;
    } });
  }
  const bundle_ms = Math.round(performance.now() - begin);
  const replayStart = performance.now();
  for (const version of ['112', '113']) {
    await replayOne(bundle, history(version), 'isolated-' + version);
  }
  const incompatible = history('113');
  incompatible.events = incompatible.events.slice(0, 4);
  incompatible.events.push(temporal.api.history.v1.HistoryEvent.fromObject({ eventId: 5,
    eventTime: { seconds: 1780000005 }, eventType: temporal.api.enums.v1.EventType.EVENT_TYPE_TIMER_STARTED,
    timerStartedEventAttributes: { timerId: 'negative-timer', startToFireTimeout: { seconds: 1 }, workflowTaskCompletedEventId: 4 } }));
  await assert.rejects(() => replayOne(bundle, incompatible, 'negative'), { name: 'DeterminismViolationError' });
  console.log(JSON.stringify({ status: 'passed', mode, bundle_ms, replay_ms: Math.round(performance.now() - replayStart),
    histories: ['synthetic-V112', 'synthetic-V113'], negative_control: 'rejected', external_effects: 'not_performed' }));
}
// Iterator exhaustion owns native shutdown; do not instantiate a fresh Runtime
// solely to shut it down after the SDK has already deregistered its workers.
if (require.main === module) {
  main().catch(() => { console.error('postiz_native_bundle_replay_failed'); process.exitCode = 1; });
}
module.exports = { main, replayOne };
