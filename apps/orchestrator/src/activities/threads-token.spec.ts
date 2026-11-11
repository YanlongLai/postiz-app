// Keep infrastructure out of these unit tests; HTTP, persistence and Temporal
// are mocked, while the activity, refresh service and Threads provider are real.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service',
  () => ({ WebhooksService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock('nestjs-temporal-core', () => ({
  Activity: () => () => {},
  ActivityMethod: () => () => {},
  TemporalService: class {},
}));
jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: jest.fn(async () => {}),
}));

import { Integration, Post } from '@prisma/client';
import { PostActivity } from './post.activity';
import { ThreadsProvider } from '@gitroom/nestjs-libraries/integrations/social/threads.provider';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-10T21:01:00Z').getTime();
const expired = () =>
  new Response(
    JSON.stringify({
      error: {
        message: 'Error validating access token: Session has expired',
        code: 190,
      },
    }),
    { status: 400 }
  );
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

const posts = [
  { id: 'post', content: 'Test post', settings: '{}', image: '[]' },
] as Post[];
const pending = { step: 'container', containerId: 'container' };

describe('Threads publish token recovery', () => {
  let activity: PostActivity;
  let provider: ThreadsProvider;
  let integration: Integration;
  let stored: Integration;
  let http: jest.SpyInstance;
  let database: {
    getIntegrationById: jest.Mock;
    createOrUpdateIntegration: jest.Mock;
    refreshNeeded: jest.Mock;
    informAboutRefreshError: jest.Mock;
  };
  let refreshService: RefreshIntegrationService;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    http = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('Unexpected HTTP call in Threads test');
    });
    integration = {
      id: 'integration',
      organizationId: 'org',
      internalId: 'user',
      providerIdentifier: 'threads',
      token: 'old-token',
      refreshToken: 'old-token',
      tokenExpiration: new Date(NOW + 30 * DAY),
      profile: 'profile',
      name: 'Threads',
    } as Integration;
    stored = { ...integration };
    database = {
      getIntegrationById: jest.fn(async () => ({ ...stored })),
      createOrUpdateIntegration: jest.fn(async (...args: any[]) => {
        stored = {
          ...stored,
          token: args[8],
          refreshToken: args[9],
          tokenExpiration: new Date(NOW + args[10] * 1000),
        };
      }),
      refreshNeeded: jest.fn(async () => {}),
      informAboutRefreshError: jest.fn(async () => {}),
    };
    provider = new ThreadsProvider();
    const manager = { getSocialIntegration: jest.fn(() => provider) };
    const temporal = {
      client: { getRawClient: () => ({ workflow: { start: jest.fn() } }) },
    };
    refreshService = new RefreshIntegrationService(
      manager as any,
      database as any,
      temporal as any
    );
    activity = new PostActivity(
      {
        updateTags: jest.fn(async (_org: string, value: Post[]) => value),
        // No publication evidence yet, so the publish path runs.
        getPostById: jest.fn(async () => null),
        updateMedia: jest.fn(async () => []),
        getStoryFrameReceipts: jest.fn(async () => ({ receipts: [] })),
      } as any,
      {} as any,
      manager as any,
      database as any,
      refreshService,
      {} as any,
      temporal as any,
      { getSubscription: jest.fn(async () => ({})) } as any
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function refreshedToken() {
    http.mockResolvedValueOnce(
      json({ access_token: 'new-token', expires_in: (60 * DAY) / 1000 })
    );
    http.mockResolvedValueOnce(json({ id: 'user', username: 'profile' }));
  }

  function published() {
    http.mockResolvedValueOnce(json({ id: 'published' }));
    http.mockResolvedValueOnce(
      json({ permalink: 'https://www.threads.net/@profile/post/published' })
    );
  }

  const urls = () => http.mock.calls.map(([url]) => String(url));
  const refreshCalls = () =>
    urls().filter((url) => url.includes('/refresh_access_token?'));
  const publishCalls = () =>
    urls().filter((url) => url.includes('/threads_publish?'));

  it.each([DAY, 0, -DAY])(
    'refreshes before publishing when stored expiry is %i ms away',
    async (remaining) => {
      stored.tokenExpiration = new Date(NOW + remaining);
      refreshedToken();
      http.mockResolvedValueOnce(json({ id: 'container' }));

      const result = await activity.postSocialPending(integration, posts);

      expect(result[0].pendingData).toEqual(pending);
      expect(urls()[0]).toContain(
        'grant_type=th_refresh_token&access_token=old-token'
      );
      expect((http.mock.calls[2][1].body as FormData).get('access_token')).toBe(
        'new-token'
      );
      expect(refreshCalls()).toHaveLength(1);
      expect(database.createOrUpdateIntegration).toHaveBeenCalledWith(
        undefined,
        false,
        'org',
        'Threads',
        undefined,
        'social',
        'user',
        'threads',
        'new-token',
        'new-token',
        (58 * DAY) / 1000
      );
      expect(stored.tokenExpiration.getTime()).toBe(NOW + 58 * DAY);
      expect(integration.token).toBe('old-token');
    }
  );

  it.each([58 * DAY, DAY + 1])(
    'does not refresh a token with %i ms remaining',
    async (remaining) => {
      stored.tokenExpiration = new Date(NOW + remaining);
      http.mockResolvedValueOnce(json({ id: 'container' }));

      await activity.postSocialPending(integration, posts);

      expect(refreshCalls()).toHaveLength(0);
      expect(http).toHaveBeenCalledTimes(1);
    }
  );

  it('uses credentials refreshed by another activity instead of the workflow snapshot', async () => {
    stored.token = stored.refreshToken = 'already-refreshed';
    http.mockResolvedValueOnce(json({ id: 'container' }));

    await activity.postSocialPending(integration, posts);

    expect((http.mock.calls[0][1].body as FormData).get('access_token')).toBe(
      'already-refreshed'
    );
    expect(refreshCalls()).toHaveLength(0);
  });

  it('refreshes once and retries container creation after an expired-token rejection', async () => {
    http.mockResolvedValueOnce(expired());
    refreshedToken();
    http.mockResolvedValueOnce(json({ id: 'container' }));

    const result = await activity.postSocialPending(integration, posts);

    expect(result[0].status).toBe('pending');
    expect(urls().filter((url) => url.includes('/user/threads'))).toHaveLength(
      2
    );
    expect((http.mock.calls[3][1].body as FormData).get('access_token')).toBe(
      'new-token'
    );
    expect(refreshCalls()).toHaveLength(1);
    expect(publishCalls()).toHaveLength(0);
  });

  it.each(['legacy', 'receipts'])(
    'retries an explicitly rejected publish once (%s)',
    async (path) => {
      http.mockResolvedValueOnce(expired());
      refreshedToken();
      published();

      const result =
        path === 'legacy'
          ? await activity.finalizePost(integration, pending)
          : await activity.finalizePostWithReceipts(
              integration,
              pending,
              'post',
              'run'
            );

      expect(result).toMatchObject({
        status: 'completed',
        postId: 'published',
      });
      expect(publishCalls()).toHaveLength(2);
      expect(publishCalls()[1]).toContain(
        'creation_id=container&access_token=new-token'
      );
      expect(refreshCalls()).toHaveLength(1);
    }
  );

  it.each(['legacy', 'receipts'])(
    'recovers a read-only container status check (%s)',
    async (path) => {
      http.mockResolvedValueOnce(expired());
      refreshedToken();
      http.mockResolvedValueOnce(json({ status: 'FINISHED' }));

      const result =
        path === 'legacy'
          ? await activity.checkPostStatus(integration, pending)
          : await activity.checkPostStatusWithReceipts(
              integration,
              pending,
              'post',
              'run'
            );

      expect(result.status).toBe('ready');
      expect(refreshCalls()).toHaveLength(1);
      expect(publishCalls()).toHaveLength(0);
    }
  );

  it('recovers the old blocking publish path', async () => {
    http.mockResolvedValueOnce(json({ id: 'container' }));
    http.mockResolvedValueOnce(json({ status: 'FINISHED' }));
    http.mockResolvedValueOnce(expired());
    refreshedToken();
    http.mockResolvedValueOnce(json({ id: 'retry-container' }));
    http.mockResolvedValueOnce(json({ status: 'FINISHED' }));
    published();

    const result = await activity.postSocial(integration, posts);

    expect(result[0]).toMatchObject({ status: 'success', postId: 'published' });
    expect(refreshCalls()).toHaveLength(1);
    expect(publishCalls()).toHaveLength(2);
  });

  it('fails clearly when refresh fails, without retrying the publish', async () => {
    http.mockResolvedValueOnce(expired());
    http.mockResolvedValueOnce(expired());

    await expect(
      activity.finalizePost(integration, pending)
    ).rejects.toMatchObject({
      type: 'bad_body',
      nonRetryable: true,
      message:
        'Threads token refresh failed. Please reconnect your Threads channel.',
    });
    expect(refreshCalls()).toHaveLength(1);
    expect(publishCalls()).toHaveLength(1);
    expect(database.refreshNeeded).toHaveBeenCalledWith('org', 'integration');
    expect(database.createOrUpdateIntegration).not.toHaveBeenCalled();
  });

  it('does not publish if the proactive refresh fails', async () => {
    stored.tokenExpiration = new Date(NOW + DAY);
    http.mockResolvedValueOnce(expired());

    await expect(
      activity.postSocialPending(integration, posts)
    ).rejects.toMatchObject({
      type: 'bad_body',
      message: expect.stringContaining('Threads token refresh failed'),
    });
    expect(http).toHaveBeenCalledTimes(1);
    expect(publishCalls()).toHaveLength(0);
  });

  it('does not enter the workflow refresh loop if the retry also rejects the token', async () => {
    http.mockResolvedValueOnce(expired());
    refreshedToken();
    http.mockResolvedValueOnce(expired());

    await expect(
      activity.finalizePost(integration, pending)
    ).rejects.toMatchObject({
      type: 'bad_body',
      nonRetryable: true,
      message:
        'Threads access token expired after refresh. Please reconnect your Threads channel.',
    });
    expect(refreshCalls()).toHaveLength(1);
    expect(publishCalls()).toHaveLength(2);
  });

  it('does not refresh again if the proactively refreshed token is rejected', async () => {
    stored.tokenExpiration = new Date(NOW + DAY);
    refreshedToken();
    http.mockResolvedValueOnce(expired());

    await expect(
      activity.finalizePost(integration, pending)
    ).rejects.toMatchObject({ type: 'bad_body' });
    expect(refreshCalls()).toHaveLength(1);
    expect(publishCalls()).toHaveLength(1);
  });

  it.each(['transport', 'timeout', 'rejection'])(
    'does not retry a publish after a %s error',
    async (kind) => {
      const error =
        kind === 'timeout'
          ? new DOMException('Timed out', 'TimeoutError')
          : new Error('Connection lost');
      if (kind === 'rejection') {
        http.mockResolvedValueOnce(
          new Response('{"error":{"message":"invalid media"}}', { status: 400 })
        );
      } else {
        http.mockRejectedValueOnce(error);
      }

      await expect(
        activity.finalizePost(integration, pending)
      ).rejects.toBeDefined();
      expect(refreshCalls()).toHaveLength(0);
      expect(publishCalls()).toHaveLength(1);
    }
  );

  it('does not retry after a post was created and its permalink lookup rejects the token', async () => {
    http.mockResolvedValueOnce(json({ id: 'published' }));
    http.mockResolvedValueOnce(expired());

    const result = await activity.finalizePost(integration, pending);

    expect(result).toMatchObject({
      status: 'completed',
      postId: 'published',
      releaseURL: 'https://www.threads.net/@profile',
    });
    expect(publishCalls()).toHaveLength(1);
    expect(refreshCalls()).toHaveLength(0);
  });

  it('does not republish a comment when its permalink lookup rejects the token', async () => {
    http.mockResolvedValueOnce(json({ id: 'comment-container' }));
    http.mockResolvedValueOnce(json({ status: 'FINISHED' }));
    http.mockResolvedValueOnce(json({ id: 'published-comment' }));
    http.mockResolvedValueOnce(expired());

    const result = await activity.postComment(
      'parent',
      undefined,
      integration,
      posts
    );

    expect(result[0]).toMatchObject({
      status: 'success',
      postId: 'published-comment',
      releaseURL: 'https://www.threads.net/@profile',
    });
    expect(publishCalls()).toHaveLength(1);
    expect(refreshCalls()).toHaveLength(0);
  });

  it('does not publish again when a status check confirms an already published container', async () => {
    http.mockResolvedValueOnce(json({ status: 'PUBLISHED' }));

    expect(await activity.checkPostStatus(integration, pending)).toMatchObject({
      status: 'completed',
    });
    expect(publishCalls()).toHaveLength(0);
  });

  it('does not publish when the integration no longer exists', async () => {
    database.getIntegrationById.mockResolvedValueOnce(null);

    await expect(
      activity.postSocialPending(integration, posts)
    ).rejects.toMatchObject({
      type: 'bad_body',
      message: 'Threads channel is unavailable',
    });
    expect(http).not.toHaveBeenCalled();
  });

  it.each([58 * DAY, 57 * DAY + 1])(
    'reuses a token younger than 24 hours when the cron wakes at its old deadline (%i ms remaining)',
    async (remaining) => {
      stored.tokenExpiration = new Date(NOW + remaining);

      const result = await refreshService.refresh(stored);

      expect(result).toMatchObject({
        accessToken: 'old-token',
        refreshToken: 'old-token',
        expiresIn: Math.floor(remaining / 1000),
      });
      expect(http).not.toHaveBeenCalled();
      expect(database.createOrUpdateIntegration).not.toHaveBeenCalled();
      expect(database.refreshNeeded).not.toHaveBeenCalled();
    }
  );

  it('allows background refresh once the long-lived token is at least 24 hours old', async () => {
    stored.tokenExpiration = new Date(NOW + 57 * DAY);
    refreshedToken();

    const result = await refreshService.refresh(stored);

    expect(result).toMatchObject({ accessToken: 'new-token' });
    expect(refreshCalls()).toHaveLength(1);
    expect(database.createOrUpdateIntegration).toHaveBeenCalledTimes(1);
  });

  it('attempts explicit expiry recovery even when a stored expiry suggests a recent token', async () => {
    stored.tokenExpiration = new Date(NOW + 58 * DAY);
    http.mockResolvedValueOnce(expired());
    refreshedToken();
    published();

    expect(await activity.finalizePost(integration, pending)).toMatchObject({
      status: 'completed',
      postId: 'published',
    });
    expect(refreshCalls()).toHaveLength(1);
    expect(publishCalls()).toHaveLength(2);
  });

  it('does not apply the Threads age guard to other providers', async () => {
    stored.providerIdentifier = 'other';
    stored.tokenExpiration = new Date(NOW + 58 * DAY);
    refreshedToken();

    expect(await refreshService.refresh(stored)).toMatchObject({
      accessToken: 'new-token',
    });
    expect(refreshCalls()).toHaveLength(1);
  });

  it('leaves other providers on their existing path', async () => {
    const postPending = jest
      .spyOn(provider, 'postPending')
      .mockResolvedValueOnce([]);

    await activity.postSocialPending(
      { ...integration, providerIdentifier: 'other' },
      posts
    );

    expect(postPending).toHaveBeenCalledTimes(1);
    expect(database.getIntegrationById).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  });
});
