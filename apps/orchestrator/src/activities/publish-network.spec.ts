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

describe('activity publication receipt guard', () => {
  const integration = {
    organizationId: 'org',
    providerIdentifier: 'threads',
  } as any;
  function setup(current: any) {
    const getPostById = jest.fn().mockResolvedValue(current);
    const provider = {
      post: jest.fn(),
      postPending: jest.fn(),
      comment: jest.fn(),
      checkPostStatus: jest.fn(),
      finalizePost: jest.fn(),
      checkPostStatusWithReceipts: jest.fn(),
      finalizePostWithReceipts: jest.fn(),
    };
    const getSocialIntegration = jest.fn(() => provider);
    const activity = new PostActivity(
      {
        getPostById,
        setPublishAttemptUncertain: jest.fn().mockResolvedValue(undefined),
        updateTags: jest.fn().mockResolvedValue([]),
        getStoryFrameReceipts: jest.fn().mockResolvedValue({ receipts: [] }),
      } as any,
      null!,
      { getSocialIntegration } as any,
      // Threads publishes reload persisted credentials first.
      { getIntegrationById: jest.fn(async () => integration) } as any,
      null!,
      null!,
      null!,
      { getSubscription: jest.fn().mockResolvedValue({}) } as any
    );
    return { activity, getPostById, getSocialIntegration, provider };
  }

  it.each(['postSocialPending', 'postSocial'])(
    '%s reuses a persisted platform ID even with stale QUEUE input',
    async (method) => {
      const { activity, getPostById, getSocialIntegration } = setup({
        state: 'ERROR',
        releaseId: 'existing-id',
        releaseURL: 'https://example.test/existing',
      });
      const posts = [{ id: 'post', state: 'QUEUE' }] as any;
      const result = await (activity as any)[method](integration, posts);
      expect(result).toEqual([
        {
          id: 'post',
          postId: 'existing-id',
          releaseURL: 'https://example.test/existing',
          status: 'success',
        },
      ]);
      expect(getPostById).toHaveBeenCalledWith('post', 'org');
      expect(getSocialIntegration).not.toHaveBeenCalled();
    }
  );

  it.each(['postSocialPending', 'postSocial'])(
    '%s keeps a timeout retryable and reuses a persisted ID on the second activity run',
    async (method) => {
      const { activity, getPostById, getSocialIntegration, provider } = setup(null);
      const error = Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ETIMEDOUT', syscall: 'read' },
      });
      provider.post.mockRejectedValue(error);
      provider.postPending.mockRejectedValue(error);
      const posts = [{ id: 'post', state: 'QUEUE' }] as any;
      await expect((activity as any)[method](integration, posts)).rejects.toBe(error);
      const publish = method === 'postSocial' ? provider.post : provider.postPending;
      expect(publish).toHaveBeenCalledTimes(1);

      const providerReads = getSocialIntegration.mock.calls.length;
      // Simulate the publication receipt being persisted before the retry.
      getPostById.mockResolvedValue({ releaseId: 'confirmed-id' });
      await expect((activity as any)[method](integration, posts)).resolves.toEqual([
        {
          id: 'post',
          postId: 'confirmed-id',
          releaseURL: '',
          status: 'success',
        },
      ]);
      expect(getSocialIntegration).toHaveBeenCalledTimes(providerReads);
      expect(publish).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    'checkPostStatus',
    'finalizePost',
    'checkPostStatusWithReceipts',
    'finalizePostWithReceipts',
  ] as const)('%s preserves transient failures for fast retries', async (method) => {
    const { activity, provider } = setup(null);
    const error = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ETIMEDOUT', syscall: 'read' },
    });
    provider[method].mockRejectedValue(error);
    await expect(
      (activity as any)[method](integration, {}, 'post', 'publication')
    ).rejects.toBe(error);
    expect(provider[method]).toHaveBeenCalledTimes(1);
  });

  it('keeps transient comment failures retryable', async () => {
    const { activity, provider } = setup(null);
    const error = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNRESET' },
    });
    provider.comment.mockRejectedValue(error);
    await expect(
      activity.postComment('root', undefined, integration, [])
    ).rejects.toBe(error);
  });

  it('allows intentional repeat occurrences but stops a retry after a new ID is persisted', async () => {
    const post = {
      id: 'post',
      state: 'PUBLISHED',
      intervalInDays: 1,
      releaseId: 'old-id',
      releaseURL: 'https://example.test/old',
    };
    const { activity, getPostById } = setup(post);
    await expect(
      (activity as any).confirmedPublication(integration, [post])
    ).resolves.toBeUndefined();
    getPostById.mockResolvedValue({ ...post, releaseId: 'new-id' });
    await expect(
      (activity as any).confirmedPublication(integration, [post])
    ).resolves.toEqual([expect.objectContaining({ postId: 'new-id' })]);
  });

  it('refuses to rerun a legacy batch when only some entries have confirmed IDs', async () => {
    const { activity, getPostById } = setup(null);
    getPostById
      .mockResolvedValueOnce({ releaseId: 'root-id' })
      .mockResolvedValueOnce(null);
    await expect(
      (activity as any).confirmedPublication(integration, [
        { id: 'root' },
        { id: 'reply' },
      ])
    ).rejects.toMatchObject({ type: 'bad_body', nonRetryable: true });
  });

  it.each([
    null,
    { releaseId: null },
    { releaseId: '' },
    { releaseId: 'missing' },
  ])(
    'does not invent a successful publication without a receipt: %j',
    async (current) => {
      const { activity } = setup(current);
      await expect(
        (activity as any).confirmedPublication(integration, [{ id: 'post' }])
      ).resolves.toBeUndefined();
    }
  );
});
