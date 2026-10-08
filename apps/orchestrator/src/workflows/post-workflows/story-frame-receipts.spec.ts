import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';

const mockActivities: Record<string, jest.Mock> = Object.fromEntries(
  [
    'getPost',
    'getPostsList',
    'inAppNotification',
    'changeState',
    'updatePost',
    'sendWebhooks',
    'isCommentable',
    'internalPlugs',
    'globalPlugs',
    'postSocialPending',
    'checkPostStatusWithReceipts',
    'finalizePostWithReceipts',
  ].map((name) => [name, jest.fn()])
);
jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => mockActivities,
  sleep: jest.fn(async () => {}),
  defineSignal: (name: string) => name,
  setHandler: jest.fn(),
  workflowInfo: () => ({ runId: 'private-workflow-run' }),
  startChild: jest.fn(async () => {}),
  ActivityFailure: class extends Error {},
  ApplicationFailure: class extends Error {},
}));
import { postWorkflowV113 } from './post.workflow.v1.1.3';
import { startChild } from '@temporalio/workflow';

describe('V113 receipt workflow compatibility', () => {
  beforeEach(() => {
    for (const activity of Object.values(mockActivities)) activity.mockReset();
    const post = {
      id: 'post',
      organizationId: 'org',
      state: 'QUEUE',
      publishDate: new Date(0),
      settings: '{}',
      integration: {
        id: 'integration',
        organizationId: 'org',
        providerIdentifier: 'instagram',
        name: 'test',
      },
    };
    mockActivities.getPost.mockResolvedValue(post);
    mockActivities.getPostsList.mockResolvedValue([post]);
    mockActivities.internalPlugs.mockResolvedValue([]);
    mockActivities.globalPlugs.mockResolvedValue([]);
    mockActivities.postSocialPending.mockResolvedValue([
      {
        id: 'post',
        status: 'pending',
        pendingData: { containers: ['upload-container'] },
      },
    ]);
    mockActivities.checkPostStatusWithReceipts.mockResolvedValue({
      status: 'ready',
      pendingData: { containers: ['upload-container'] },
    });
    mockActivities.finalizePostWithReceipts.mockResolvedValue({
      status: 'completed',
      postId: 'real-last-frame',
      releaseURL: 'https://instagram.com/story',
    });
  });

  it('passes post/run identity to new activities and only marks real completion', async () => {
    await postWorkflowV113({
      taskQueue: 'instagram',
      postId: 'post',
      organizationId: 'org',
    });
    expect(mockActivities.checkPostStatusWithReceipts).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'post',
      'private-workflow-run'
    );
    expect(mockActivities.finalizePostWithReceipts).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'post',
      'private-workflow-run'
    );
    expect(mockActivities.updatePost).toHaveBeenCalledWith(
      'post',
      'real-last-frame',
      'https://instagram.com/story'
    );
  });

  it('does not rerun postPending when confirmation resolution fails', async () => {
    mockActivities.finalizePostWithReceipts.mockRejectedValue(
      new Error('unknown outcome')
    );
    await postWorkflowV113({
      taskQueue: 'instagram',
      postId: 'post',
      organizationId: 'org',
    });
    expect(mockActivities.postSocialPending).toHaveBeenCalledTimes(1);
    expect(mockActivities.updatePost).not.toHaveBeenCalled();
    expect(mockActivities.changeState).toHaveBeenCalledWith(
      'post',
      'ERROR',
      expect.anything(),
      expect.anything()
    );
  });

  it('repeat child uses V113, creating its own private run identity', async () => {
    const post = await mockActivities.getPost();
    post.intervalInDays = 1;
    await postWorkflowV113({
      taskQueue: 'instagram',
      postId: 'post',
      organizationId: 'org',
    });
    expect(startChild).toHaveBeenCalledWith(
      postWorkflowV113,
      expect.anything()
    );
  });

  it('all pre-existing workflow source bytes match fork baseline', () => {
    const paths = execFileSync(
      'git',
      [
        'ls-tree',
        '-r',
        '--name-only',
        'HEAD',
        'apps/orchestrator/src/workflows',
      ],
      { encoding: 'utf8' }
    )
      .trim()
      .split('\n')
      .filter((path) => path !== 'apps/orchestrator/src/workflows/index.ts');
    for (const path of paths) {
      expect(readFileSync(path)).toEqual(
        execFileSync('git', ['show', `HEAD:${path}`])
      );
    }
  });
});
