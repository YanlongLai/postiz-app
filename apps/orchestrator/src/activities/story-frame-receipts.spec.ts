jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service',
  () => ({ WebhooksService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
import { PostActivity } from './post.activity';
import { StoryFrameReceiptContext } from '@gitroom/nestjs-libraries/dtos/posts/story.frame.receipt.dto';

describe('receipt activity persistence plumbing', () => {
  const originalVersion = process.env.POSTIZ_WORKFLOW_VERSION;
  beforeEach(() => { delete process.env.POSTIZ_WORKFLOW_VERSION; });
  afterAll(() => {
    if (originalVersion === undefined) delete process.env.POSTIZ_WORKFLOW_VERSION;
    else process.env.POSTIZ_WORKFLOW_VERSION = originalVersion;
  });

  it.each([[undefined, 'postWorkflowV112'], ['V112', 'postWorkflowV112'], ['V113', 'postWorkflowV113']])(
    'missing-post recovery selects %s -> %s without changing existing workflow policy', async (version, expected) => {
      if (version !== undefined) process.env.POSTIZ_WORKFLOW_VERSION = version;
      const signalWithStart = jest.fn().mockResolvedValue(undefined);
      const activity = new PostActivity(
        { searchForMissingThreeHoursPosts: async () => [{ id: 'post', organizationId: 'org', integration: { providerIdentifier: 'instagram' } }] } as any,
        null!, null!, null!, null!, null!,
        { client: { getRawClient: () => ({ workflow: { signalWithStart } }) } } as any,
        null!
      );
      await activity.searchForMissingThreeHoursPosts();
      expect(signalWithStart).toHaveBeenCalledWith(expected, expect.objectContaining({ workflowIdConflictPolicy: 'USE_EXISTING', taskQueue: 'main' }));
    }
  );

  it('invalid activation rejects missing-post recovery before querying or starting', async () => {
    process.env.POSTIZ_WORKFLOW_VERSION = 'V114';
    const searchForMissingThreeHoursPosts = jest.fn();
    const signalWithStart = jest.fn();
    const activity = new PostActivity(
      { searchForMissingThreeHoursPosts } as any,
      null!, null!, null!, null!, null!,
      { client: { getRawClient: () => ({ workflow: { signalWithStart } }) } } as any,
      null!
    );
    await expect(activity.searchForMissingThreeHoursPosts())
      .rejects.toThrow('POSTIZ_WORKFLOW_VERSION must be V112 or V113');
    expect(searchForMissingThreeHoursPosts).not.toHaveBeenCalled();
    expect(signalWithStart).not.toHaveBeenCalled();
  });

  it('loads only the owning run and awaits service persistence for every provider checkpoint', async () => {
    const receipt = {
      frameIndex: 0,
      platformId: 'real-id',
      confirmedAt: '2026-10-08T06:00:00.000Z',
      status: 'confirmed' as const,
    };
    const getStoryFrameReceipts = jest.fn().mockResolvedValue({ receipts: [] });
    const events: string[] = [];
    const recordStoryFrameReceipt = jest.fn(async () => {
      events.push('persisted');
    });
    const provider = {
      finalizePostWithReceipts: jest.fn(
        async (
          _token,
          _state,
          _integration,
          context: StoryFrameReceiptContext
        ) => {
          await context.record(receipt);
          events.push('provider-completed');
          return { status: 'completed', postId: 'real-id', releaseURL: '' };
        }
      ),
    };
    const activity = new PostActivity(
      { getStoryFrameReceipts, recordStoryFrameReceipt } as any,
      null!,
      { getSocialIntegration: () => provider } as any,
      null!,
      null!,
      null!,
      null!,
      null!
    );
    const integration = {
      organizationId: 'authenticated-org',
      providerIdentifier: 'test',
      token: 'not-exported',
    } as any;
    await activity.finalizePostWithReceipts(
      integration,
      { containers: ['not-confirmed'] },
      'post',
      'run'
    );
    expect(getStoryFrameReceipts).toHaveBeenCalledWith(
      'authenticated-org',
      'post',
      'run'
    );
    expect(recordStoryFrameReceipt).toHaveBeenCalledWith(
      'authenticated-org',
      'post',
      'run',
      receipt
    );
    expect(events).toEqual(['persisted', 'provider-completed']);
  });

  it('receipt storage failure propagates and prevents provider completion', async () => {
    const recordStoryFrameReceipt = jest
      .fn()
      .mockRejectedValue(new Error('storage failure'));
    const completed = jest.fn();
    const provider = {
      finalizePostWithReceipts: async (
        _token: string,
        _state: any,
        _integration: any,
        context: StoryFrameReceiptContext
      ) => {
        await context.record({
          frameIndex: 0,
          platformId: 'real',
          confirmedAt: new Date().toISOString(),
          status: 'confirmed',
        });
        completed();
      },
    };
    const activity = new PostActivity(
      {
        getStoryFrameReceipts: async () => ({ receipts: [] }),
        recordStoryFrameReceipt,
      } as any,
      null!,
      { getSocialIntegration: () => provider } as any,
      null!,
      null!,
      null!,
      null!,
      null!
    );
    await expect(
      activity.finalizePostWithReceipts(
        { organizationId: 'org', providerIdentifier: 'test' } as any,
        {},
        'post',
        'run'
      )
    ).rejects.toThrow('storage failure');
    expect(completed).not.toHaveBeenCalled();
  });
});
