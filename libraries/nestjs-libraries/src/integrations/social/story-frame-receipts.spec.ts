import { FacebookProvider } from './facebook.provider';
import { InstagramProvider } from './instagram.provider';
import { InstagramStandaloneProvider } from './instagram.standalone.provider';
import { StoryFrameReceiptContext } from '../../dtos/posts/story.frame.receipt.dto';

const integration = {
  internalId: 'account',
  organizationId: 'org',
  profile: 'profile',
} as any;
const json = (body: unknown) => ({ json: async () => body } as Response);
const receipt = (
  frameIndex: number,
  platformId = `published-${frameIndex}`
) => ({
  frameIndex,
  platformId,
  confirmedAt: '2026-10-08T06:00:00.000Z',
  status: 'confirmed' as const,
});
function context(): StoryFrameReceiptContext {
  const receipts: StoryFrameReceiptContext['receipts'] = [];
  return {
    receipts,
    record: jest.fn(async (value) => {
      receipts.push(value);
    }),
  };
}
const fbState = () => ({
  postType: 'story' as const,
  items: [0, 1, 2].map((i) => ({
    kind: 'photo' as const,
    mediaId: `upload-${i}`,
  })),
  publishedCount: 0,
  lastPostId: '',
  attempting: 0,
  confirmed: true,
});
const igState = () => ({
  postType: 'stories' as const,
  type: 'graph.facebook.com',
  containers: ['c0', 'c1', 'c2'],
});

describe('confirmed Story frame provider checkpoints', () => {
  it('Facebook publishes three ordered frames and records every real post_id', async () => {
    const provider = new FacebookProvider();
    const ctx = context();
    const fetch = jest
      .spyOn(provider, 'fetch')
      .mockImplementation(async (url) => {
        if (String(url).includes('/stories?')) return json({ data: [] });
        const index = Number(String(url).match(/photo_id=upload-(\d)/)![1]);
        return json({ post_id: `published-${index}` });
      });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let state: any = fbState();
    let result: any;
    for (let index = 0; index < 3; index++) {
      if (index) {
        result = await provider.finalizePostWithReceipts(
          'token',
          state,
          integration,
          ctx
        );
        result = await provider.checkPostStatusWithReceipts(
          'token',
          result.pendingData,
          integration,
          ctx
        );
        state = result.pendingData;
      }
      result = await provider.finalizePostWithReceipts(
        'token',
        state,
        integration,
        ctx
      );
      state = result.pendingData;
    }
    expect(result).toMatchObject({
      status: 'completed',
      postId: 'published-2',
    });
    expect(ctx.receipts.map((r) => [r.frameIndex, r.platformId])).toEqual([
      [0, 'published-0'],
      [1, 'published-1'],
      [2, 'published-2'],
    ]);
    expect(
      fetch.mock.calls.filter(([, options]) => options?.method === 'POST')
    ).toHaveLength(3);
    warn.mockRestore();
  });

  it('Facebook holds an ambiguous armed publish without replay', async () => {
    const provider = new FacebookProvider();
    const fetch = jest.spyOn(provider, 'fetch');
    await expect(
      provider.checkPostStatusWithReceipts(
        'token',
        fbState(),
        integration,
        context()
      )
    ).rejects.toThrow('may have already published');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('Facebook recovers a receipt committed before the activity result was lost', async () => {
    const provider = new FacebookProvider();
    const fetch = jest.spyOn(provider, 'fetch');
    const ctx = context();
    ctx.receipts.push(receipt(0));
    const result = await provider.checkPostStatusWithReceipts(
      'token',
      fbState(),
      integration,
      ctx
    );
    expect(result).toMatchObject({
      status: 'ready',
      pendingData: {
        publishedCount: 1,
        attempting: null,
        confirmed: false,
        lastPostId: 'published-0',
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('Facebook never records an upload identifier as a confirmed post', async () => {
    const provider = new FacebookProvider();
    const ctx = context();
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue(json({ post_id: 'upload-0' }));
    await expect(
      provider.finalizePostWithReceipts('token', fbState(), integration, ctx)
    ).rejects.toThrow('outcome unknown');
    expect(ctx.record).not.toHaveBeenCalled();
  });

  it('Instagram stops before the next publish when durable receipt persistence fails', async () => {
    const provider = new InstagramProvider();
    const ctx = context();
    ctx.record = jest
      .fn()
      .mockRejectedValue(new Error('receipt storage unavailable'));
    const fetch = jest
      .spyOn(provider, 'fetch')
      .mockImplementation(async (_url, options) =>
        json(
          options?.method === 'POST'
            ? { id: 'real-id' }
            : { status_code: 'FINISHED' }
        )
      );
    await expect(
      provider.finalizePostWithReceipts('token', igState(), integration, ctx)
    ).rejects.toThrow('storage unavailable');
    expect(
      fetch.mock.calls.filter(([, options]) => options?.method === 'POST')
    ).toHaveLength(1);
  });

  it('Instagram resumes an entirely confirmed run without publishing any frame', async () => {
    const provider = new InstagramProvider();
    const ctx = context();
    ctx.receipts.push(receipt(0), receipt(1), receipt(2));
    const fetch = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue(json({ permalink: 'https://instagram.com/story' }));
    const result = await provider.finalizePostWithReceipts(
      'token',
      igState(),
      integration,
      ctx
    );
    expect(result).toMatchObject({
      status: 'completed',
      postId: 'published-2',
    });
    expect(
      fetch.mock.calls.some(([, options]) => options?.method === 'POST')
    ).toBe(false);
    expect(ctx.record).not.toHaveBeenCalled();
  });

  it('Instagram awaits durable receipt before starting the next frame', async () => {
    const provider = new InstagramProvider();
    const events: string[] = [];
    const ctx = context();
    ctx.record = jest.fn(async (value) => {
      events.push(`receipt-${value.frameIndex}`);
      ctx.receipts.push(value);
    });
    jest.spyOn(provider, 'fetch').mockImplementation(async (url, options) => {
      if (options?.method === 'POST') {
        const index = Number(String(url).match(/creation_id=c(\d)/)![1]);
        events.push(`publish-${index}`);
        return json({ id: `published-${index}` });
      }
      return json(
        String(url).includes('fields=permalink')
          ? { permalink: 'https://instagram.com/story' }
          : { status_code: 'FINISHED' }
      );
    });
    const result = await provider.finalizePostWithReceipts(
      'token',
      igState(),
      integration,
      ctx
    );
    expect(result).toMatchObject({
      status: 'completed',
      postId: 'published-2',
    });
    expect(events).toEqual([
      'publish-0',
      'receipt-0',
      'publish-1',
      'receipt-1',
      'publish-2',
      'receipt-2',
    ]);
  });

  it('Instagram preserves earlier confirmations on partial failure and resumes only remaining frames', async () => {
    const provider = new InstagramProvider();
    const ctx = context();
    const fetch = jest
      .spyOn(provider, 'fetch')
      .mockImplementation(async (url, options) => {
        if (options?.method === 'POST') {
          if (String(url).includes('creation_id=c1'))
            throw new Error('provider failed');
          return json({ id: 'published-0' });
        }
        return json({ status_code: 'FINISHED' });
      });
    await expect(
      provider.finalizePostWithReceipts('token', igState(), integration, ctx)
    ).rejects.toThrow('provider failed');
    expect(ctx.receipts).toHaveLength(1);
    fetch.mockClear().mockImplementation(async (url, options) => {
      if (options?.method === 'POST')
        return json({
          id: `published-${String(url).includes('creation_id=c1') ? 1 : 2}`,
        });
      return json({
        status_code: 'FINISHED',
        permalink: 'https://instagram.com/story',
      });
    });
    await provider.finalizePostWithReceipts(
      'token',
      igState(),
      integration,
      ctx
    );
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes('creation_id=c0'))
    ).toBe(false);
    expect(ctx.receipts.map((r) => r.platformId)).toEqual([
      'published-0',
      'published-1',
      'published-2',
    ]);
  });

  it('Instagram holds PUBLISHED containers without inventing confirmed IDs', async () => {
    const provider = new InstagramProvider();
    const ctx = context();
    const fetch = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue(json({ status_code: 'PUBLISHED' }));
    await expect(
      provider.checkPostStatusWithReceipts('token', igState(), integration, ctx)
    ).rejects.toThrow('media ID is unavailable');
    await expect(
      provider.finalizePostWithReceipts('token', igState(), integration, ctx)
    ).rejects.toThrow('media ID is unavailable');
    expect(ctx.record).not.toHaveBeenCalled();
    expect(
      fetch.mock.calls.some(([, options]) => options?.method === 'POST')
    ).toBe(false);
  });

  it('Instagram rejects container IDs returned as publication IDs', async () => {
    const provider = new InstagramProvider();
    const ctx = context();
    jest
      .spyOn(provider, 'fetch')
      .mockImplementation(async (_url, options) =>
        json(
          options?.method === 'POST'
            ? { id: 'c0' }
            : { status_code: 'FINISHED' }
        )
      );
    await expect(
      provider.finalizePostWithReceipts('token', igState(), integration, ctx)
    ).rejects.toThrow('outcome unknown');
    expect(ctx.record).not.toHaveBeenCalled();
  });

  it('single-frame Story opts in while ordinary Feed remains legacy', async () => {
    const provider = new InstagramProvider();
    const legacy = jest.spyOn(provider, 'finalizePost').mockResolvedValue({
      status: 'completed',
      postId: 'feed-id',
      releaseURL: '',
    });
    await provider.finalizePostWithReceipts(
      'token',
      { ...igState(), postType: 'single', isStory: false },
      integration,
      context()
    );
    expect(legacy).toHaveBeenCalledTimes(1);
    jest
      .spyOn(provider, 'fetch')
      .mockImplementation(async (_url, options) =>
        json(
          options?.method === 'POST'
            ? { id: 'story-id' }
            : { status_code: 'FINISHED' }
        )
      );
    const ctx = context();
    await provider.finalizePostWithReceipts(
      'token',
      { ...igState(), containers: ['c0'], postType: 'single', isStory: true },
      integration,
      ctx
    );
    expect(ctx.receipts[0]).toMatchObject({
      frameIndex: 0,
      platformId: 'story-id',
    });
    expect(legacy).toHaveBeenCalledTimes(1);
  });

  it('standalone Instagram delegates the new receipt path with its graph domain', async () => {
    const provider = new InstagramStandaloneProvider();
    const delegate = jest
      .spyOn(InstagramProvider.prototype, 'finalizePostWithReceipts')
      .mockResolvedValue({
        status: 'completed',
        postId: 'actual-id',
        releaseURL: '',
      });
    const state = { ...igState(), type: 'graph.instagram.com' };
    const ctx = context();
    await provider.finalizePostWithReceipts('token', state, integration, ctx);
    expect(delegate).toHaveBeenCalledWith('token', state, integration, ctx);
    delegate.mockRestore();
  });
});
