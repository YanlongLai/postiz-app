jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: jest.fn(async () => {}),
}));
import { ThreadsProvider } from './threads.provider';
import { InstagramProvider } from './instagram.provider';
import { FacebookProvider } from './facebook.provider';
import { BadBody } from '../social.abstract';
import {
  isBeforeConnectError,
  isTransientNetworkError,
} from '../network.errors';

const integration = { internalId: 'account', profile: 'example' } as any;
const response = (body: unknown) => ({ json: async () => body } as Response);
const networkError = (code: string, syscall?: string) =>
  Object.assign(new TypeError('fetch failed'), { cause: { code, syscall } });

describe('request-level network retries', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'fetch failed'])(
    'retries a safe GET after %s without changing its dispatcher',
    async (code) => {
      const failure =
        code === 'fetch failed' ? new TypeError(code) : networkError(code);
      const ok = { status: 200 } as Response;
      const fetch = jest
        .fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValue(ok);
      global.fetch = fetch;
      const dispatcher = {};
      await expect(
        new ThreadsProvider().fetch('https://example.test/read', {
          dispatcher,
        } as any)
      ).resolves.toBe(ok);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[1][1].dispatcher).toBe(dispatcher);
    }
  );

  it('caps safe reads at three requests and leaves the error retryable by the status activity', async () => {
    const failure = networkError('ECONNRESET');
    global.fetch = jest.fn().mockRejectedValue(failure);
    await expect(
      new ThreadsProvider().fetch('https://example.test/read')
    ).rejects.toBe(failure);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    networkError('EAI_AGAIN', 'getaddrinfo'),
    Object.assign(new TypeError('fetch failed'), {
      cause: new AggregateError([
        { code: 'ETIMEDOUT', syscall: 'connect' },
        { code: 'ENETUNREACH', syscall: 'connect' },
      ]),
    }),
  ])(
    'retries a mutation only when every connection attempt failed before sending',
    async (failure) => {
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValue({ status: 200 });
      await new ThreadsProvider().fetch('https://example.test/publish', {
        method: 'POST',
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    networkError('ECONNRESET'),
    networkError('ETIMEDOUT'),
    new TypeError('fetch failed'),
  ])(
    'rethrows an ambiguous mutation error unchanged for the activity retry policy',
    async (failure) => {
      global.fetch = jest.fn().mockRejectedValue(failure);
      await expect(
        new ThreadsProvider().fetch('https://example.test/publish', {
          method: 'POST',
        })
      ).rejects.toBe(failure);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('rethrows the original error after exhausting pre-connect retries', async () => {
    const failure = networkError('EAI_AGAIN', 'getaddrinfo');
    global.fetch = jest.fn().mockRejectedValue(failure);
    await expect(
      new ThreadsProvider().fetch('https://example.test/publish', {
        method: 'POST',
      })
    ).rejects.toBe(failure);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry unrelated errors or mixed pre/post-connect aggregates', async () => {
    const error = new Error('invalid request');
    global.fetch = jest.fn().mockRejectedValue(error);
    await expect(
      new ThreadsProvider().fetch('https://example.test/read')
    ).rejects.toBe(error);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(
      isBeforeConnectError(
        new AggregateError([
          { code: 'ETIMEDOUT', syscall: 'connect' },
          { code: 'ECONNRESET' },
        ])
      )
    ).toBe(false);
    expect(
      isTransientNetworkError({ cause: { errors: [{ code: 'EAI_AGAIN' }] } })
    ).toBe(true);
  });

  it.each(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'])(
    'retries an image read after %s without restarting a publish',
    async (code) => {
      const provider = new ThreadsProvider();
      const read = jest
        .fn()
        .mockRejectedValueOnce(networkError(code))
        .mockResolvedValue({ data: Buffer.from('image') });
      jest.spyOn(provider as any, 'getSsrfSafeAxios').mockReturnValue(read);
      await expect(
        (provider as any).readOrFetch('https://example.test/image')
      ).resolves.toEqual(Buffer.from('image'));
      expect(read).toHaveBeenCalledTimes(2);
    }
  );

  it('retries a failed range read once, then reports failure without restarting the mutation activity', async () => {
    global.fetch = jest.fn().mockRejectedValue(networkError('ECONNRESET'));
    await expect(
      (new ThreadsProvider() as any).mediaChunk(
        'https://example.test/video',
        0,
        10
      )
    ).rejects.toMatchObject({ type: 'bad_body', nonRetryable: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('confirmed reply IDs survive permalink failures', () => {
  it('returns a published Threads reply without publishing it again', async () => {
    const provider = new ThreadsProvider();
    const create = jest
      .spyOn(provider as any, 'createThreadContent')
      .mockResolvedValue('container');
    jest.spyOn(provider as any, 'checkLoaded').mockResolvedValue(undefined);
    const fetch = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce(response({ id: 'reply-id' }))
      .mockRejectedValueOnce(networkError('ECONNRESET'));
    const result = await provider.comment(
      'account',
      'root-id',
      undefined,
      'token',
      [{ id: 'comment' }] as any,
      integration
    );
    expect(result).toEqual([
      {
        id: 'comment',
        postId: 'reply-id',
        status: 'success',
        releaseURL: 'https://www.threads.net/@example',
      },
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns a published Instagram comment when its parent permalink read fails', async () => {
    const provider = new InstagramProvider();
    const fetch = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce(response({ id: 'comment-id' }))
      .mockRejectedValueOnce(networkError('ETIMEDOUT'));
    const result = await provider.comment(
      'account',
      'root-id',
      undefined,
      'token',
      [{ id: 'comment', message: 'reply' }] as any,
      integration
    );
    expect(result).toEqual([
      {
        id: 'comment',
        postId: 'comment-id',
        status: 'success',
        releaseURL: 'https://www.instagram.com/example',
      },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps real Facebook publish failures visible', async () => {
    const provider = new FacebookProvider();
    jest
      .spyOn(provider, 'fetch')
      .mockRejectedValue(new BadBody('facebook', '{}', '{}', 'Rejected'));
    await expect(
      provider.comment(
        'account',
        'root-id',
        undefined,
        'token',
        [{ id: 'comment' }] as any,
        integration
      )
    ).rejects.toMatchObject({ type: 'bad_body', message: 'Rejected' });
  });
});
