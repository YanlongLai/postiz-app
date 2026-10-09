// Offline native-core replay. Synthetic histories; no server or activity code.
const assert = require('node:assert/strict');
const path = require('node:path');
const { Worker, Runtime, bundleWorkflowCode } = require('@temporalio/worker');
const { defaultPayloadConverter } = require('@temporalio/common');
const { temporal } = require('@temporalio/proto');
const root = path.resolve(__dirname, '../..');
const runId = '11111111-1111-4111-8111-111111111111';
const queue = (name) => ({ name, kind: 1 });
const payloads = (...values) => ({
  payloads: values.map((v) => defaultPayloadConverter.toPayload(v)),
});
const E = temporal.api.enums.v1.EventType;

function history(version) {
  const events = [];
  const event = (name, attrs, value) => {
    const id = events.length + 1;
    events.push({
      eventId: id,
      eventTime: { seconds: 1780000000 + id },
      eventType: E[`EVENT_TYPE_${name}`],
      [attrs]: value,
    });
    return id;
  };
  let workflowTaskCompleted;
  const task = () => {
    const scheduled = event(
      'WORKFLOW_TASK_SCHEDULED',
      'workflowTaskScheduledEventAttributes',
      {
        taskQueue: queue('main'),
        startToCloseTimeout: { seconds: 10 },
        attempt: 1,
      }
    );
    const started = event(
      'WORKFLOW_TASK_STARTED',
      'workflowTaskStartedEventAttributes',
      { scheduledEventId: scheduled, identity: 'isolated-replay' }
    );
    workflowTaskCompleted = event(
      'WORKFLOW_TASK_COMPLETED',
      'workflowTaskCompletedEventAttributes',
      {
        scheduledEventId: scheduled,
        startedEventId: started,
        identity: 'isolated-replay',
      }
    );
  };
  const integration = {
    id: 'integration',
    organizationId: 'org',
    providerIdentifier: 'instagram',
    name: 'test',
    token: 'synthetic',
  };
  const post = {
    id: 'post',
    organizationId: 'org',
    state: 'QUEUE',
    publishDate: '2026-01-01T00:00:00.000Z',
    settings: '{}',
    integration,
  };
  const pending = {
    containers: ['synthetic-container'],
    type: 'graph.facebook.com',
    postType: 'stories',
  };
  event(
    'WORKFLOW_EXECUTION_STARTED',
    'workflowExecutionStartedEventAttributes',
    {
      workflowType: { name: `postWorkflowV${version}` },
      taskQueue: queue('main'),
      input: payloads({
        taskQueue: 'instagram',
        postId: 'post',
        organizationId: 'org',
        postNow: true,
      }),
      workflowExecutionTimeout: { seconds: 3600 },
      workflowRunTimeout: { seconds: 3600 },
      workflowTaskTimeout: { seconds: 10 },
      originalExecutionRunId: runId,
      firstExecutionRunId: runId,
      attempt: 1,
    }
  );
  task();
  const suffix = version === '113' ? 'WithReceipts' : '';
  const receiptArgs = version === '113' ? ['post', runId] : [];
  const calls = [
    ['getPost', ['org', 'post'], post, 'main', 'normal'],
    ['getPostsList', ['org', 'post'], [post], 'main', 'normal'],
    [
      'postSocialPending',
      [integration, [post]],
      [{ id: 'post', status: 'pending', pendingData: pending }],
      'instagram',
      'mutation',
    ],
    [
      `checkPostStatus${suffix}`,
      [integration, pending, ...receiptArgs],
      { status: 'ready', pendingData: pending },
      'instagram',
      'check',
    ],
    [
      `finalizePost${suffix}`,
      [integration, pending, ...receiptArgs],
      {
        status: 'completed',
        postId: 'real-frame-id',
        releaseURL: 'https://example.invalid/story',
      },
      'instagram',
      'mutation',
    ],
    [
      'updatePost',
      ['post', 'real-frame-id', 'https://example.invalid/story'],
      undefined,
      'main',
      'normal',
    ],
    ['inAppNotification', ['org'], undefined, 'main', 'normal'],
    [
      'sendWebhooks',
      ['real-frame-id', 'org', 'integration'],
      undefined,
      'main',
      'normal',
    ],
    ['internalPlugs', [integration, {}], [], 'instagram', 'normal'],
    ['globalPlugs', [integration], [], 'instagram', 'normal'],
  ];
  for (const [index, [name, args, result, target, mode]] of calls.entries()) {
    const scheduled = event(
      'ACTIVITY_TASK_SCHEDULED',
      'activityTaskScheduledEventAttributes',
      {
        activityId: String(index + 1),
        activityType: { name },
        taskQueue: queue(target),
        input: payloads(...args),
        workflowTaskCompletedEventId: workflowTaskCompleted,
        startToCloseTimeout: {
          seconds: mode === 'mutation' ? 1800 : mode === 'check' ? 120 : 600,
        },
        ...(mode === 'mutation' ? { heartbeatTimeout: { seconds: 180 } } : {}),
        retryPolicy: {
          maximumAttempts: mode === 'mutation' ? 1 : 3,
          initialInterval: { seconds: mode === 'check' ? 10 : 120 },
          backoffCoefficient: 1,
        },
      }
    );
    const started = event(
      'ACTIVITY_TASK_STARTED',
      'activityTaskStartedEventAttributes',
      { scheduledEventId: scheduled, identity: 'synthetic-provider' }
    );
    event('ACTIVITY_TASK_COMPLETED', 'activityTaskCompletedEventAttributes', {
      scheduledEventId: scheduled,
      startedEventId: started,
      result: payloads(result),
      identity: 'synthetic-provider',
    });
    task();
  }
  event(
    'WORKFLOW_EXECUTION_COMPLETED',
    'workflowExecutionCompletedEventAttributes',
    { workflowTaskCompletedEventId: workflowTaskCompleted }
  );
  return temporal.api.history.v1.History.fromObject({ events });
}

async function main() {
  assert.equal(
    process.version,
    `v${require(path.join(root, 'package.json')).volta.node}`,
    'Run via the repository-pinned Node runtime'
  );
  const bundle = await bundleWorkflowCode({
    workflowsPath: path.join(root, 'apps/orchestrator/src/workflows/index.ts'),
    workflowInterceptorModules: [
      path.join(__dirname, 'temporal-replay.interceptor.ts'),
    ],
    webpackConfigHook: (config) => {
      for (const rule of config.module.rules) {
        if (rule.use?.loader?.includes('swc-loader'))
          rule.use.options.swcrc = false;
      }
      config.resolve.alias = {
        ...config.resolve.alias,
        '@gitroom/nestjs-libraries': path.join(
          root,
          'libraries/nestjs-libraries/src'
        ),
        '@gitroom/helpers': path.join(root, 'libraries/helpers/src'),
        '@gitroom/orchestrator': path.join(root, 'apps/orchestrator/src'),
      };
      return config;
    },
  });
  const replay = async (fixture, workflowId) => {
    const commands = [];
    await Worker.runReplayHistory(
      {
        workflowBundle: bundle,
        sinks: {
          receiptReplay: {
            activity: {
              callDuringReplay: true,
              fn: (_info, input) => commands.push(input),
            },
          },
        },
      },
      fixture,
      workflowId
    );
    return commands;
  };
  for (const version of ['112', '113']) {
    const fixture = history(version);
    const commands = await replay(fixture, `isolated-v${version}`);
    const recorded = fixture.events
      .filter((e) => e.activityTaskScheduledEventAttributes)
      .map((e) => e.activityTaskScheduledEventAttributes.activityType.name);
    assert.deepEqual(
      commands.map((c) => c.activityType),
      recorded
    );
    if (version === '113') {
      const receiptCommands = commands.filter((c) =>
        c.activityType.endsWith('WithReceipts')
      );
      assert.equal(receiptCommands.length, 2);
      for (const command of receiptCommands) {
        // Sink arguments originate in the workflow V8 realm; compare scalar
        // contract values, not cross-realm Array prototype identity.
        assert.equal(command.args.length, 4);
        assert.equal(command.args[2], 'post');
        assert.equal(command.args[3], runId);
        assert.equal(command.taskQueue, 'instagram');
      }
    }
    console.log(
      `PASS native replay: synthetic V${version} publication history`
    );
  }
  const incompatible = history('112');
  incompatible.events[0].workflowExecutionStartedEventAttributes.workflowType.name =
    'postWorkflowV113';
  const changed = await replay(incompatible, 'negative-v113');
  const oldNames = incompatible.events
    .filter((e) => e.activityTaskScheduledEventAttributes)
    .map((e) => e.activityTaskScheduledEventAttributes.activityType.name);
  assert.notDeepEqual(
    changed.map((c) => c.activityType),
    oldNames
  );
  console.log(
    'PASS interface negative control: V113 commands differ from V112 history; do not upgrade in-flight histories'
  );
  const incompatibleCommand = history('113');
  incompatibleCommand.events = incompatibleCommand.events.slice(0, 4);
  incompatibleCommand.events.push(
    temporal.api.history.v1.HistoryEvent.fromObject({
      eventId: 5,
      eventTime: { seconds: 1780000005 },
      eventType: E.EVENT_TYPE_TIMER_STARTED,
      timerStartedEventAttributes: {
        timerId: 'negative-timer',
        startToFireTimeout: { seconds: 1 },
        workflowTaskCompletedEventId: 4,
      },
    })
  );
  await assert.rejects(
    () => replay(incompatibleCommand, 'negative-command'),
    /nondetermin|determinism/i
  );
  console.log(
    'PASS native negative control: timer history rejects activity command'
  );
  await Runtime.instance().shutdown();
}
if (require.main === module) main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await Runtime.instance()
    .shutdown()
    .catch(() => {});
});
module.exports = { history };
