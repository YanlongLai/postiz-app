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
jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: jest.fn(async () => {}),
}));
import { PostActivity } from './post.activity';
import { ThreadsProvider } from '@gitroom/nestjs-libraries/integrations/social/threads.provider';
import { FacebookProvider } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';
import { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import { InstagramStandaloneProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.standalone.provider';
import { LinkedinPageProvider } from '@gitroom/nestjs-libraries/integrations/social/linkedin.page.provider';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';

const acceptedAt = '2026-11-10T12:00:00.000Z';
const transportError = () =>
  Object.assign(new TypeError('fetch failed'), {
    cause: { code: 'ECONNRESET' },
  });
const response = (body: unknown) =>
  ({ status: 200, json: async () => body } as Response);
const providers = [
  ThreadsProvider,
  FacebookProvider,
  InstagramProvider,
  InstagramStandaloneProvider,
  LinkedinPageProvider,
];

function setup(Provider: any = ThreadsProvider, settings: any = {}) {
  const provider = new Provider();
  const integration = {
    id: 'channel',
    organizationId: 'org',
    internalId: 'account',
    profile: 'example',
    token: 'test-token',
    providerIdentifier: provider.identifier,
  } as any;
  const row = {
    id: 'post',
    content: '<p>Hello world</p>',
    image: '[]',
    state: 'QUEUE',
    settings: JSON.stringify(settings),
    releaseId: null,
    releaseURL: null,
  } as any;
  const input = { ...row }; // Temporal keeps its original serialized input.
  const service = {
    getPostById: jest.fn(async () => ({ ...row })),
    updateTags: jest.fn(async () => [{ ...row }]),
    updateMedia: jest.fn(async (_id, media) => media),
    setPublishAttemptUncertain: jest.fn(async (_id, _org, at) => {
      const settings = JSON.parse(row.settings);
      if (at)
        settings.publishAttemptUncertainAt =
          settings.publishAttemptUncertainAt || at;
      else delete settings.publishAttemptUncertainAt;
      row.settings = JSON.stringify(settings);
    }),
    updatePost: jest.fn(async (_id, postId, releaseURL) =>
      Object.assign(row, { releaseId: postId, releaseURL, state: 'PUBLISHED' })
    ),
    getStoryFrameReceipts: jest.fn(async () => ({ receipts: [] })),
  };
  const activity = new PostActivity(
    service as any,
    null!,
    { getSocialIntegration: () => provider } as any,
    { getIntegrationById: async () => integration } as any,
    null!,
    null!,
    null!,
    { getSubscription: async () => ({}) } as any
  );
  const publish = jest.fn(async () => {
    const body = await (
      await provider.fetch('https://example.test/create', { method: 'POST' })
    ).json();
    return [
      {
        id: row.id,
        postId: body.id,
        releaseURL: 'https://example.test/post',
        status: 'success',
      },
    ];
  });
  provider.post = publish;
  provider.postPending = publish;
  return { activity, provider, integration, row, input, service, publish };
}

function recent(provider: any, extra: any = {}) {
  if (provider.identifier === 'linkedin-page')
    return {
      elements: [
        {
          id: 'recovered',
          author: 'urn:li:organization:account',
          lifecycleState: 'PUBLISHED',
          commentary: 'Hello world',
          createdAt: Date.parse(acceptedAt),
          ...extra,
        },
      ],
    };
  return {
    data: [
      {
        id: 'recovered',
        text: 'Hello world',
        caption: 'Hello world',
        message: 'Hello world',
        timestamp: acceptedAt,
        created_time: acceptedAt,
        permalink: 'https://example.test/recovered',
        permalink_url: 'https://example.test/recovered',
        ...extra,
      },
    ],
  };
}

const originalFetch = global.fetch;
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(new Date(acceptedAt));
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe.each(providers)('%p publish reconciliation', (Provider) => {
  it.each(['postSocial', 'postSocialPending'])(
    'lost response → %s retry finds receipt without a second create',
    async (method) => {
      const { activity, provider, integration, input, row, service, publish } =
        setup(Provider);
      const lookup = jest.spyOn(provider, 'findRecentPublication');
      const lost = transportError();
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(lost)
        .mockResolvedValueOnce(response(recent(provider)));
      await expect(
        (activity as any)[method](integration, [input])
      ).rejects.toBe(lost);
      expect(JSON.parse(row.settings).publishAttemptUncertainAt).toBe(
        acceptedAt
      );
      await expect(
        (activity as any)[method](integration, [input])
      ).resolves.toEqual([
        expect.objectContaining({ postId: 'recovered', status: 'success' }),
      ]);
      expect(lookup).toHaveBeenCalledWith(
        integration,
        'test-token',
        expect.objectContaining({ id: 'post' }),
        new Date(Date.parse(acceptedAt) - 5 * 60 * 1000)
      );
      expect(publish).toHaveBeenCalledTimes(1);
      expect(service.updatePost).toHaveBeenCalledWith(
        'post',
        'recovered',
        expect.any(String)
      );
      expect(
        JSON.parse(row.settings).publishAttemptUncertainAt
      ).toBeUndefined();
      // A further retry uses the persisted receipt even if all HTTP is unavailable.
      await (activity as any)[method](integration, [input]);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    }
  );

  it('lookup failure remains retryable and keeps the marker without creating', async () => {
    const { activity, integration, input, row, publish } = setup(Provider, {
      publishAttemptUncertainAt: acceptedAt,
    });
    global.fetch = jest.fn().mockResolvedValue({
      status: 403,
      text: async () => '{"error":"forbidden"}',
    });
    await expect(
      activity.postSocial(integration, [input])
    ).rejects.toMatchObject({
      type: 'publication_lookup',
      nonRetryable: false,
    });
    expect(publish).not.toHaveBeenCalled();
    expect(JSON.parse(row.settings).publishAttemptUncertainAt).toBe(acceptedAt);
  });

  it('successful empty lookup clears the marker and creates once', async () => {
    const { activity, provider, integration, input, row, publish } = setup(
      Provider,
      { publishAttemptUncertainAt: acceptedAt, keep: 'value' }
    );
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        response(
          provider.identifier === 'linkedin-page'
            ? { elements: [] }
            : { data: [] }
        )
      )
      .mockResolvedValueOnce(response({ id: 'new' }));
    await expect(activity.postSocial(integration, [input])).resolves.toEqual([
      expect.objectContaining({ postId: 'new' }),
    ]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(JSON.parse(row.settings)).toEqual({ keep: 'value' });
  });
});

describe('uncertainty classification and compatibility', () => {
  it.each([
    new BadBody('threads', '{}', '{}', 'rejected'),
    Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ETIMEDOUT', syscall: 'connect' },
    }),
    new Error('validation failed'),
  ])('does not mark a non-ambiguous failure: %p', async (error) => {
    const { activity, integration, input, publish, service } = setup();
    publish.mockRejectedValue(error);
    await expect(activity.postSocial(integration, [input])).rejects.toBe(error);
    expect(service.setPublishAttemptUncertain).not.toHaveBeenCalled();
  });

  it('retains existing publishing behavior for a provider without lookup', async () => {
    const { activity, provider, integration, input, publish } = setup();
    provider.findRecentPublication = undefined;
    const lost = transportError();
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(lost)
      .mockResolvedValueOnce(response({ id: 'new' }));
    await expect(activity.postSocial(integration, [input])).rejects.toBe(lost);
    await expect(activity.postSocial(integration, [input])).resolves.toEqual([
      expect.objectContaining({ postId: 'new' }),
    ]);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([FacebookProvider, InstagramProvider, InstagramStandaloneProvider])(
    'skips reconciliation for %p stories',
    async (Provider) => {
      const { activity, provider, integration, input } = setup(Provider, {
        post_type: 'story',
        publishAttemptUncertainAt: acceptedAt,
      });
      const lookup = jest.spyOn(provider, 'findRecentPublication');
      global.fetch = jest.fn().mockResolvedValue(response({ id: 'story' }));
      await activity.postSocialPending(integration, [input]);
      expect(lookup).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('cleans a stale marker after a recovered receipt was persisted but clearing failed', async () => {
    const { activity, provider, integration, input, row, service, publish } =
      setup(ThreadsProvider, { publishAttemptUncertainAt: acceptedAt });
    global.fetch = jest.fn().mockResolvedValue(response(recent(provider)));
    service.setPublishAttemptUncertain.mockRejectedValueOnce(
      new Error('database unavailable')
    );
    await expect(activity.postSocial(integration, [input])).rejects.toThrow(
      'database unavailable'
    );
    expect(row.releaseId).toBe('recovered');
    expect(JSON.parse(row.settings).publishAttemptUncertainAt).toBe(acceptedAt);
    await expect(activity.postSocial(integration, [input])).resolves.toEqual([
      expect.objectContaining({ postId: 'recovered' }),
    ]);
    expect(JSON.parse(row.settings).publishAttemptUncertainAt).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not clear uncertainty when a lookup has malformed JSON', async () => {
    const { activity, integration, input, row, publish } = setup(
      ThreadsProvider,
      { publishAttemptUncertainAt: acceptedAt }
    );
    global.fetch = jest.fn().mockResolvedValue(response({ unexpected: true }));
    await expect(
      activity.postSocial(integration, [input])
    ).rejects.toMatchObject({
      type: 'publication_lookup',
      nonRetryable: false,
    });
    expect(publish).not.toHaveBeenCalled();
    expect(JSON.parse(row.settings).publishAttemptUncertainAt).toBe(acceptedAt);
  });
});

describe('Threads first-reply chain', () => {
  it.each([undefined, 'previous-reply'])(
    'recovers each reply under its own parent (%s)',
    async (lastReply) => {
      const { activity, provider, integration, input, row, service } = setup();
      // Exercise the real container creation / threads_publish methods.
      provider.comment = ThreadsProvider.prototype.comment;
      const lost = transportError();
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(response({ id: 'container' }))
        .mockResolvedValueOnce(response({ status: 'FINISHED' }))
        .mockRejectedValueOnce(lost)
        .mockResolvedValueOnce(
          response(
            recent(provider, {
              username: 'example',
              is_reply: true,
              replied_to: { id: lastReply || 'main' },
            })
          )
        );
      await expect(
        activity.postComment('main', lastReply, integration, [input])
      ).rejects.toBe(lost);
      expect(JSON.parse(row.settings).publishAttemptUncertainAt).toBe(
        acceptedAt
      );
      await expect(
        activity.postComment('main', lastReply, integration, [input])
      ).resolves.toEqual([expect.objectContaining({ postId: 'recovered' })]);
      expect(service.updatePost).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(4);
      expect(
        new URL((global.fetch as jest.Mock).mock.calls[3][0]).pathname
      ).toBe(`/v1.0/${lastReply || 'main'}/replies`);
      await activity.postComment('main', lastReply, integration, [input]);
      expect(global.fetch).toHaveBeenCalledTimes(4);
    }
  );

  it('does not create a reply when its reconciliation fails', async () => {
    const { activity, integration, input, provider } = setup(ThreadsProvider, {
      publishAttemptUncertainAt: acceptedAt,
    });
    provider.comment = jest.fn();
    global.fetch = jest.fn().mockRejectedValue(transportError());
    await expect(
      activity.postComment('main', undefined, integration, [input])
    ).rejects.toMatchObject({
      type: 'publication_lookup',
      nonRetryable: false,
    });
    expect(provider.comment).not.toHaveBeenCalled();
  });
});

describe('deferred creates', () => {
  it.each(['finalizePost', 'finalizePostWithReceipts'])(
    '%s reconciles a lost Threads threads_publish response',
    async (method) => {
      const { activity, provider, integration, input, row } = setup();
      provider.postPending = ThreadsProvider.prototype.postPending;
      const lost = transportError();
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(response({ id: 'container' }))
        .mockRejectedValueOnce(lost)
        .mockResolvedValueOnce(response(recent(provider)));
      const [pending] = await activity.postSocialPending(integration, [input]);
      expect(pending.pendingData.__publicationPost.id).toBe('post');
      const args = [integration, pending.pendingData, 'post', 'publication'];
      await expect((activity as any)[method](...args)).rejects.toBe(lost);
      expect(JSON.parse(row.settings).publishAttemptUncertainAt).toBe(
        acceptedAt
      );
      await expect((activity as any)[method](...args)).resolves.toMatchObject({
        status: 'completed',
        postId: 'recovered',
      });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    }
  );

  it.each(['finalizePost', 'finalizePostWithReceipts'])(
    '%s blocks a second create while lookup fails',
    async (method) => {
      const { activity, provider, integration, input } = setup(
        ThreadsProvider,
        { publishAttemptUncertainAt: acceptedAt }
      );
      provider.finalizePost = jest.fn();
      provider.finalizePostWithReceipts = jest.fn();
      global.fetch = jest.fn().mockRejectedValue(transportError());
      await expect(
        (activity as any)[method](
          integration,
          { __publicationPost: input },
          'post',
          'publication'
        )
      ).rejects.toMatchObject({
        type: 'publication_lookup',
        nonRetryable: false,
      });
      expect(provider.finalizePost).not.toHaveBeenCalled();
      expect(provider.finalizePostWithReceipts).not.toHaveBeenCalled();
    }
  );

  it('clears a successful empty lookup before a deferred create', async () => {
    const { activity, provider, integration, input, row } = setup(
      ThreadsProvider,
      { publishAttemptUncertainAt: acceptedAt }
    );
    provider.finalizePost = jest.fn(async () => ({
      status: 'completed',
      postId: 'new',
      releaseURL: 'https://example.test/new',
    }));
    global.fetch = jest.fn().mockResolvedValue(response({ data: [] }));
    await expect(
      activity.finalizePost(integration, { __publicationPost: input })
    ).resolves.toMatchObject({ status: 'completed', postId: 'new' });
    expect(provider.finalizePost).toHaveBeenCalledTimes(1);
    expect(JSON.parse(row.settings).publishAttemptUncertainAt).toBeUndefined();
  });

  it.each(['checkPostStatus', 'checkPostStatusWithReceipts'])(
    '%s preserves the row baseline across provider state changes',
    async (method) => {
      const { activity, provider, integration } = setup();
      provider[method] = jest.fn(async () => ({
        status: 'ready',
        pendingData: { step: 'container' },
      }));
      const baseline = {
        id: 'post',
        state: 'QUEUE',
        releaseId: null as string | null,
      };
      const result = await (activity as any)[method](
        integration,
        { __publicationPost: baseline },
        'post',
        'publication'
      );
      expect(result.pendingData.__publicationPost).toEqual(baseline);
    }
  );

  it('preserves pending phases and repeat occurrence baseline after finalization creates another container', async () => {
    const { activity, provider, integration, input, row } = setup();
    Object.assign(input, {
      intervalInDays: 1,
      state: 'PUBLISHED',
      releaseId: 'previous',
    });
    Object.assign(row, input);
    provider.finalizePost = jest.fn(async () => ({
      status: 'pending',
      pendingData: { step: 'container', containerId: 'next' },
    }));
    await expect(
      activity.finalizePost(integration, {
        step: 'children',
        __publicationPost: input,
      })
    ).resolves.toMatchObject({
      status: 'pending',
      pendingData: {
        step: 'container',
        __publicationPost: { id: 'post', releaseId: 'previous' },
      },
    });
  });
});

describe.each(providers)('%p deferred workflow recovery', (Provider) => {
  it.each(['checkPostStatus', 'checkPostStatusWithReceipts'])(
    'reconciles before %s after an uncertain final create',
    async (method) => {
      const { activity, provider, integration, input, row } = setup(Provider);
      const lost = transportError();
      const finalize = jest.fn(async () => {
        await provider.fetch('https://example.test/deferred-create', {
          method: 'POST',
        });
        return { status: 'completed', postId: 'new', releaseURL: '' };
      });
      provider.finalizePost = finalize;
      const check = jest.spyOn(provider, method);
      const data = {
        __publicationPost: input,
        attempting: true,
        confirmed: true,
      };
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(lost)
        .mockResolvedValueOnce(response(recent(provider)));
      await expect(activity.finalizePost(integration, data)).rejects.toBe(lost);
      await expect(
        (activity as any)[method](integration, data, 'post', 'publication')
      ).resolves.toMatchObject({ status: 'completed', postId: 'recovered' });
      expect(check).not.toHaveBeenCalled();
      expect(finalize).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(row.releaseId).toBe('recovered');
    }
  );
});

describe('LinkedIn interrupted-create handshake', () => {
  const data = (input: any) => ({
    __publicationPost: input,
    attempting: true,
    confirmed: true,
    authorId: 'account',
    postType: 'company',
    message: 'Hello world',
    mediaIds: [] as string[],
    poll: [] as any[],
    graceChecks: 0,
    isPdf: false,
  });

  it('a successful empty lookup permits the real status → arm → witness → create sequence once', async () => {
    const { activity, integration, input, row } = setup(LinkedinPageProvider, {
      publishAttemptUncertainAt: acceptedAt,
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response({ elements: [] }))
      .mockResolvedValueOnce({
        status: 201,
        headers: { get: () => 'urn:li:share:new' },
      });
    const ready = await activity.checkPostStatus(integration, data(input));
    expect(ready).toMatchObject({
      status: 'ready',
      pendingData: { attempting: false, confirmed: false },
    });
    if (ready.status !== 'ready') throw new Error('Expected ready');
    const armed = await activity.finalizePost(integration, ready.pendingData);
    expect(armed).toMatchObject({
      status: 'pending',
      pendingData: { attempting: true, confirmed: false },
    });
    if (armed.status !== 'pending') throw new Error('Expected pending');
    const witnessed = await activity.checkPostStatus(
      integration,
      armed.pendingData
    );
    expect(witnessed).toMatchObject({
      status: 'ready',
      pendingData: { confirmed: true },
    });
    if (witnessed.status !== 'ready') throw new Error('Expected ready');
    await expect(
      activity.finalizePost(integration, witnessed.pendingData)
    ).resolves.toMatchObject({
      status: 'completed',
      postId: 'urn:li:share:new',
    });
    expect(JSON.parse(row.settings).publishAttemptUncertainAt).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(
        ([, options]) => options.method === 'POST'
      )
    ).toHaveLength(1);
  });

  it('lookup failure leaves the interrupted-create handshake untouched and retryable', async () => {
    const { activity, provider, integration, input, row } = setup(
      LinkedinPageProvider,
      { publishAttemptUncertainAt: acceptedAt }
    );
    const check = jest.spyOn(provider, 'checkPostStatus');
    const original = data(input);
    global.fetch = jest.fn().mockRejectedValue(transportError());
    await expect(
      activity.checkPostStatus(integration, original)
    ).rejects.toMatchObject({
      type: 'publication_lookup',
      nonRetryable: false,
    });
    expect(check).not.toHaveBeenCalled();
    expect(original).toMatchObject({ attempting: true, confirmed: true });
    expect(JSON.parse(row.settings).publishAttemptUncertainAt).toBe(acceptedAt);
  });

  it('preserves the existing interrupted-create guard without a persisted uncertainty marker', async () => {
    const { activity, integration, input } = setup(LinkedinPageProvider);
    global.fetch = jest.fn();
    await expect(
      activity.checkPostStatus(integration, data(input))
    ).rejects.toMatchObject({ type: 'bad_body', nonRetryable: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
