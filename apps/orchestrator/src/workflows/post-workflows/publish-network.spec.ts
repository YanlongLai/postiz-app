const mockPolicies: any[] = [];
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
    'postComment',
    'checkPostStatus',
    'finalizePost',
    'checkPostStatusWithReceipts',
    'finalizePostWithReceipts',
  ].map((name) => [name, jest.fn()])
);
jest.mock('@temporalio/workflow', () => ({
  proxyActivities: (options: any) => {
    mockPolicies.push(options);
    return mockActivities;
  },
  sleep: jest.fn(async () => {}),
  defineSignal: (name: string) => name,
  setHandler: jest.fn(),
  workflowInfo: () => ({ runId: 'run' }),
  startChild: jest.fn(),
  ActivityFailure: class extends Error {
    cause: any;
  },
  ApplicationFailure: require('@temporalio/common').ApplicationFailure,
}));
import { ActivityFailure } from '@temporalio/workflow';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { postWorkflowV112 } from './post.workflow.v1.1.2';
import { postWorkflowV113 } from './post.workflow.v1.1.3';

describe.each([postWorkflowV112, postWorkflowV113])(
  '%p network failure policy',
  (workflow) => {
    beforeEach(() => {
      Object.values(mockActivities).forEach((mock) => mock.mockReset());
      mockPolicies.length = 0;
      const root = {
        id: 'post',
        organizationId: 'org',
        state: 'QUEUE',
        publishDate: new Date(0),
        settings: '{}',
        integration: {
          id: 'integration',
          organizationId: 'org',
          providerIdentifier: 'threads',
          name: 'example',
        },
      };
      mockActivities.getPost.mockResolvedValue(root);
      mockActivities.getPostsList.mockResolvedValue([
        root,
        { id: 'reply', delay: 0 },
      ]);
      mockActivities.isCommentable.mockResolvedValue(true);
      mockActivities.internalPlugs.mockResolvedValue([]);
      mockActivities.globalPlugs.mockResolvedValue([]);
      mockActivities.postSocialPending.mockResolvedValue([
        {
          id: 'post',
          postId: 'published-id',
          releaseURL: 'https://example.test/post',
          status: 'success',
        },
      ]);
    });

    it('never republishes the root when the provider rejects a reply', async () => {
      const failure = new ActivityFailure('activity failed') as any;
      failure.cause = new BadBody(
        'threads',
        '{}',
        '{}',
        'The provider rejected this reply'
      );
      mockActivities.postComment.mockRejectedValue(failure);
      await workflow({
        taskQueue: 'threads',
        postId: 'post',
        organizationId: 'org',
      });
      expect(mockActivities.postSocialPending).toHaveBeenCalledTimes(1);
      expect(mockActivities.postComment).toHaveBeenCalledTimes(1);
      expect(mockActivities.updatePost).toHaveBeenCalledWith(
        'post',
        'published-id',
        'https://example.test/post'
      );
      // The shared repository guard now keeps this legacy ERROR request from
      // demoting the confirmed root, while retaining the error record.
      expect(mockActivities.changeState).toHaveBeenCalledWith(
        'post',
        'ERROR',
        failure,
        expect.anything()
      );
    });

    it('keeps read-only status checks retryable and mutation activities at one attempt', async () => {
      mockActivities.postComment.mockResolvedValue([
        { id: 'reply', postId: 'reply-id', status: 'success' },
      ]);
      await workflow({
        taskQueue: 'threads',
        postId: 'post',
        organizationId: 'org',
      });
      expect(mockPolicies).toContainEqual(
        expect.objectContaining({
          startToCloseTimeout: '2 minute',
          retry: {
            maximumAttempts: 3,
            backoffCoefficient: 1,
            initialInterval: '10 seconds',
          },
        })
      );
      const mutations = mockPolicies.filter(
        (policy) => policy.startToCloseTimeout === '30 minute'
      );
      expect(mutations).toHaveLength(2);
      expect(
        mutations.every((policy) => policy.retry.maximumAttempts === 1)
      ).toBe(true);
    });
  }
);
