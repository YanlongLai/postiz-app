'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = readFileSync(path.join(__dirname, 'verify-prebuilt-replay.cjs'), 'utf8');

function load(replays) {
  const closed = [];
  const output = [];
  const module = { exports: {} };
  function requireMock(name) {
    if (name === 'node:assert/strict') return assert;
    if (name === 'node:path') return path;
    if (name === '@temporalio/worker') return {
      Worker: {
        async *runReplayHistories(options, histories) {
          assert.ok(options.workflowBundle);
          const [{ workflowId }] = histories;
          try {
            yield* replays(workflowId);
          } finally {
            // Cleanup is asynchronous and happens strictly after the result.
            await new Promise(resolve => setImmediate(resolve));
            closed.push(workflowId);
          }
        },
        runReplayHistory() { throw new Error('single_result_api_leaks_iterator'); },
      },
      bundleWorkflowCode: async () => ({ code: 'synthetic' }),
      Runtime: { instance() { throw new Error('unexpected_runtime_instantiation'); } },
    };
    if (name === '@temporalio/proto') return { temporal: { api: {
      history: { v1: { HistoryEvent: { fromObject: value => value } } },
      enums: { v1: { EventType: { EVENT_TYPE_TIMER_STARTED: 1 } } },
    } } };
    if (name.endsWith('temporal-replay.cjs')) return { history: () => ({ events: [1, 2, 3, 4] }) };
    if (name.endsWith('workflow.bundle.js')) return { workflowSource: () => ({ workflowBundle: { code: 'synthetic' } }) };
    throw new Error('unexpected_require:' + name);
  }
  vm.runInNewContext(source, {
    require: requireMock, module,
    process: { argv: ['node', 'helper', 'prebuilt'], env: {} },
    performance, console: { log: value => output.push(JSON.parse(value)) },
  });
  return { ...module.exports, closed, output };
}

const result = workflowId => ({ workflowId, runId: 'synthetic-run', error: undefined });
function nondeterminism() {
  const error = new Error('Replay failed with a nondeterminism error');
  error.name = 'DeterminismViolationError';
  return error;
}

test('successful replay awaits iterator cleanup before returning', async () => {
  const helper = load(id => [result(id)]);
  await helper.replayOne({}, {}, 'positive');
  assert.deepEqual(helper.closed, ['positive']);
});

test('negative replay awaits cleanup before propagating nondeterminism', async () => {
  const helper = load(id => [{ ...result(id), error: nondeterminism() }]);
  await assert.rejects(() => helper.replayOne({}, {}, 'negative'), { name: 'DeterminismViolationError' });
  assert.deepEqual(helper.closed, ['negative']);
});

for (const [label, results, message] of [
  ['missing result', () => [], /one_replay_result_required/],
  ['extra result', id => [result(id), result(id)], /one_replay_result_required/],
  ['wrong workflow', () => [result('other')], /replay_workflow_identity_mismatch/],
  ['missing run identity', id => [{ ...result(id), runId: '' }], /replay_run_identity_required/],
]) test('rejects ' + label + ' after closing the iterator', async () => {
  const helper = load(results);
  await assert.rejects(() => helper.replayOne({}, {}, 'positive'), message);
  assert.deepEqual(helper.closed, ['positive']);
});

test('reports PASS only after all positive and negative workers close', async () => {
  const helper = load(id => [{ ...result(id), error: id === 'negative' ? nondeterminism() : undefined }]);
  await helper.main();
  assert.deepEqual(helper.closed, ['isolated-112', 'isolated-113', 'negative']);
  assert.equal(helper.output.length, 1);
  assert.equal(helper.output[0].negative_control, 'rejected');
});

for (const [label, error] of [['successful negative', undefined], ['unrelated negative error', new Error('transport failed')]]) {
  test('fails closed for ' + label, async () => {
    const helper = load(id => [{ ...result(id), error: id === 'negative' ? error : undefined }]);
    await assert.rejects(() => helper.main());
    assert.deepEqual(helper.closed, ['isolated-112', 'isolated-113', 'negative']);
    assert.equal(helper.output.length, 0);
  });
}
