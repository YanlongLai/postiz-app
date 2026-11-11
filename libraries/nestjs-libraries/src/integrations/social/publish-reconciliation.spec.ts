jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: jest.fn(async () => {}),
}));
import { ThreadsProvider } from './threads.provider';
import { FacebookProvider, META_GRAPH_API_VERSION } from './facebook.provider';
import { InstagramProvider } from './instagram.provider';
import { InstagramStandaloneProvider } from './instagram.standalone.provider';
import { LinkedinPageProvider } from './linkedin.page.provider';
import { publicationText, matchingPublication } from './recent.publication';

const integration = { internalId: 'account', profile: 'example' } as any;
const since = new Date('2026-11-10T11:55:00Z');
const timestamp = '2026-11-10T12:00:00Z';
const post = { id: 'post', message: 'Hello world', settings: {}, media: [] };
const response = (body: unknown) =>
  ({ status: 200, json: async () => body } as Response);
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('publication text matching', () => {
  it.each([
    ['<p>Hello&nbsp; <b>world</b></p>', 'Hello world'],
    ['<div>Hello</div><div>world</div>', 'Hello world'],
    ['Hello\n\t world', 'Hello world'],
    ['<p>A &amp; B &#39;C&#39;</p>', "A & B 'C'"],
    ['<script>bad</script>Hello<style>bad</style>', 'Hello'],
  ])('strips HTML and collapses whitespace: %s', (value, expected) => {
    expect(publicationText(value)).toBe(expected);
  });

  it('compares the first 280 Unicode characters exactly', () => {
    const prefix = '😀'.repeat(280);
    expect(publicationText(prefix + 'first')).toBe(
      publicationText(prefix + 'second')
    );
    expect(publicationText(prefix.slice(0, -2) + 'x')).not.toBe(
      publicationText(prefix)
    );
  });

  it.each([
    ['Read https://original.test/long/path', 'Read https://t.example/short'],
    ['Read https://original.test/long/path', 'Read https://original.test/lo…'],
    ['Read https://original.test/long/path', 'Read'],
  ])(
    'ignores changed/truncated/omitted links only for Threads/Instagram',
    (original, platform) => {
      expect(publicationText(original, true)).toBe(
        publicationText(platform, true)
      );
      expect(publicationText(original)).not.toBe(publicationText(platform));
    }
  );

  it('does not accept arbitrary text truncation or changed case', () => {
    const candidate = {
      id: 'id',
      text: 'Hello',
      url: '',
      publishedAt: timestamp,
    };
    expect(matchingPublication(candidate, post, since, true)).toBeUndefined();
    expect(
      matchingPublication({ ...candidate, text: 'hello world' }, post, since)
    ).toBeUndefined();
  });

  it('requires a recent timestamp and matching media count when present', () => {
    const candidate = {
      id: 'id',
      text: post.message,
      url: '',
      publishedAt: timestamp,
      mediaCount: 1,
    };
    expect(matchingPublication(candidate, post, since)).toBeUndefined();
    expect(
      matchingPublication(
        { ...candidate, mediaCount: 0, publishedAt: '2026-11-09' },
        post,
        since
      )
    ).toBeUndefined();
    expect(
      matchingPublication({ ...candidate, mediaCount: undefined }, post, since)
        ?.postId
    ).toBe('id');
  });

  it.each([
    { id: '', publishedAt: timestamp },
    { id: 'id', publishedAt: 'invalid' },
  ])('rejects incomplete candidates: %j', (fields) => {
    expect(() =>
      matchingPublication({ ...fields, text: '', url: '' }, post, since)
    ).toThrow('Incomplete');
  });
});

const metaProviders = [
  [ThreadsProvider, 'graph.threads.net', '/v1.0/account/threads', 'text'],
  [
    FacebookProvider,
    'graph.facebook.com',
    `/${META_GRAPH_API_VERSION}/account/published_posts`,
    'message',
  ],
  [
    InstagramProvider,
    'graph.facebook.com',
    `/${META_GRAPH_API_VERSION}/account/media`,
    'caption',
  ],
  [
    InstagramStandaloneProvider,
    'graph.instagram.com',
    `/${META_GRAPH_API_VERSION}/account/media`,
    'caption',
  ],
] as const;

describe.each(metaProviders)('%p lookup', (Provider, host, path, textField) => {
  const item = (extra: any = {}) => ({
    id: 'found',
    [textField]: post.message,
    timestamp,
    created_time: timestamp,
    permalink: 'https://example.test/post',
    permalink_url: 'https://example.test/post',
    ...extra,
  });

  it('uses the existing provider host/version, fields and access_token; filters old/mismatched posts', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response({
        data: [
          item({
            id: 'old',
            timestamp: '2026-11-09',
            created_time: '2026-11-09',
          }),
          item({ id: 'other', [textField]: 'Other post' }),
          item(),
        ],
      })
    );
    const found = await new Provider().findRecentPublication(
      integration,
      'test-token',
      post,
      since
    );
    expect(found).toEqual({
      id: 'post',
      postId: 'found',
      releaseURL: 'https://example.test/post',
      status: 'success',
    });
    const url = new URL((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(url.hostname).toBe(host);
    expect(url.pathname).toBe(path);
    expect(url.searchParams.get('access_token')).toBe('test-token');
    expect(url.searchParams.get('fields')).toContain(textField);
    if (textField !== 'caption')
      expect(url.searchParams.get('since')).toBe(
        String(since.getTime() / 1000)
      );
  });

  it('follows pagination before declaring no match', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        response({
          data: [item({ [textField]: 'Other' })],
          paging: {
            next: 'https://untrusted.test',
            cursors: { after: 'page2' },
          },
        })
      )
      .mockResolvedValueOnce(response({ data: [item()] }));
    expect(
      (
        await new Provider().findRecentPublication(
          integration,
          'test-token',
          post,
          since
        )
      )?.postId
    ).toBe('found');
    const url = new URL((global.fetch as jest.Mock).mock.calls[1][0]);
    expect(url.hostname).toBe(host);
    expect(url.searchParams.get('after')).toBe('page2');
  });

  it('rejects invalid responses rather than treating them as no match', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(response({ error: { message: 'denied' }, data: [] }));
    await expect(
      new Provider().findRecentPublication(
        integration,
        'test-token',
        post,
        since
      )
    ).rejects.toThrow('Invalid');
  });

  it('rejects incomplete pagination', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response({
        data: [item({ [textField]: 'Other' })],
        paging: { next: 'more' },
      })
    );
    await expect(
      new Provider().findRecentPublication(
        integration,
        'test-token',
        post,
        since
      )
    ).rejects.toThrow('pagination');
  });
});

describe('provider-specific matching', () => {
  it.each([ThreadsProvider, InstagramProvider, InstagramStandaloneProvider])(
    '%p tolerates changed links and uses carousel media count',
    async (Provider) => {
      global.fetch = jest.fn().mockResolvedValue(
        response({
          data: [
            {
              id: 'wrong-count',
              text: 'Read https://short.test/a',
              caption: 'Read https://short.test/a',
              timestamp,
              children: { data: [{ id: 'one' }] },
            },
            {
              id: 'right-count',
              text: 'Read https://short.test/b',
              caption: 'Read https://short.test/b',
              timestamp,
              children: { data: [{ id: 'one' }, { id: 'two' }] },
            },
          ],
        })
      );
      const media = [
        { type: 'image' as const, path: 'one' },
        { type: 'image' as const, path: 'two' },
      ];
      expect(
        (
          await new Provider().findRecentPublication(
            integration,
            'test-token',
            { ...post, message: 'Read https://original.test/long', media },
            since
          )
        )?.postId
      ).toBe('right-count');
    }
  );

  it('Facebook uses photo/album attachment counts and retains link identity', async () => {
    const item = {
      id: 'id',
      message: 'Hello world',
      created_time: timestamp,
      attachments: {
        data: [{ media_type: 'album', subattachments: { data: [{}, {}] } }],
      },
    };
    global.fetch = jest.fn().mockResolvedValue(response({ data: [item] }));
    const provider = new FacebookProvider();
    expect(
      await provider.findRecentPublication(
        integration,
        'test-token',
        post,
        since
      )
    ).toBeUndefined();
    expect(
      (
        await provider.findRecentPublication(
          integration,
          'test-token',
          {
            ...post,
            media: [
              { type: 'image', path: 'a' },
              { type: 'image', path: 'b' },
            ],
          },
          since
        )
      )?.postId
    ).toBe('id');
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        response({ data: [{ ...item, message: 'Read https://short.test' }] })
      );
    expect(
      await provider.findRecentPublication(
        integration,
        'test-token',
        { ...post, message: 'Read https://original.test' },
        since
      )
    ).toBeUndefined();
  });

  it('Threads matches replies only under the exact parent and account author', async () => {
    const reply = {
      id: 'id',
      text: 'Hello world',
      timestamp,
      username: 'example',
      replied_to: { id: 'parent' },
      is_reply: true,
    };
    global.fetch = jest.fn().mockResolvedValue(
      response({
        data: [
          { ...reply, id: 'other-author', username: 'someone-else' },
          { ...reply, id: 'other-parent', replied_to: { id: 'wrong' } },
          reply,
        ],
      })
    );
    expect(
      (
        await new ThreadsProvider().findRecentPublication(
          integration,
          'test-token',
          { ...post, replyToId: 'parent' },
          since
        )
      )?.postId
    ).toBe('id');
    expect(new URL((global.fetch as jest.Mock).mock.calls[0][0]).pathname).toBe(
      '/v1.0/parent/replies'
    );
    expect(
      await new ThreadsProvider().findRecentPublication(
        integration,
        'test-token',
        post,
        since
      )
    ).toBeUndefined();
  });

  it.each([FacebookProvider, InstagramProvider, InstagramStandaloneProvider])(
    '%p does not list stories through the feed endpoint',
    async (Provider) => {
      global.fetch = jest.fn();
      expect(
        await new Provider().findRecentPublication(
          integration,
          'test-token',
          { ...post, settings: { post_type: 'story' } },
          since
        )
      ).toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    }
  );

  it('does not assume chronological ordering of Threads replies', async () => {
    const reply = {
      id: 'reply',
      text: 'Hello world',
      timestamp,
      username: 'example',
      replied_to: { id: 'parent' },
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        response({
          data: [{ ...reply, timestamp: '2026-11-09' }],
          paging: { next: 'more', cursors: { after: 'page2' } },
        })
      )
      .mockResolvedValueOnce(response({ data: [reply] }));
    expect(
      (
        await new ThreadsProvider().findRecentPublication(
          integration,
          'test-token',
          { ...post, replyToId: 'parent' },
          since
        )
      )?.postId
    ).toBe('reply');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('stops Instagram pagination once an entire page predates the marker window', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response({
        data: [{ id: 'old', caption: post.message, timestamp: '2026-11-09' }],
        paging: { next: 'more', cursors: { after: 'old' } },
      })
    );
    expect(
      await new InstagramProvider().findRecentPublication(
        integration,
        'test-token',
        post,
        since
      )
    ).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('fails closed on repeated cursors and scan exhaustion', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response({
        data: [],
        paging: { next: 'more', cursors: { after: 'repeat' } },
      })
    );
    await expect(
      new ThreadsProvider().findRecentPublication(
        integration,
        'test-token',
        post,
        since
      )
    ).rejects.toThrow('pagination');
    let cursor = 0;
    global.fetch = jest.fn(async () =>
      response({
        data: [],
        paging: { next: 'more', cursors: { after: String(++cursor) } },
      })
    );
    await expect(
      new ThreadsProvider().findRecentPublication(
        integration,
        'test-token',
        post,
        since
      )
    ).rejects.toThrow('scan limit');
    expect(global.fetch).toHaveBeenCalledTimes(20);
  });
});

describe('LinkedIn Page lookup', () => {
  const element = (extra: any = {}) => ({
    id: 'urn:li:share:found',
    author: 'urn:li:organization:account',
    lifecycleState: 'PUBLISHED',
    commentary: post.message,
    createdAt: Date.parse(timestamp),
    ...extra,
  });

  it('uses posts-by-author with the existing Rest.li headers/version and commentary transformation', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        response({ elements: [element({ commentary: 'Hello \\#world' })] })
      );
    const found = await new LinkedinPageProvider().findRecentPublication(
      integration,
      'test-token',
      { ...post, message: 'Hello #world' },
      since
    );
    expect(found?.releaseURL).toBe(
      'https://www.linkedin.com/feed/update/urn:li:share:found'
    );
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(new URL(url).pathname).toBe('/rest/posts');
    expect(new URL(url).searchParams.get('author')).toBe(
      'urn:li:organization:account'
    );
    expect(new URL(url).searchParams.get('q')).toBe('author');
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Linkedin-Version': '202601',
      'X-Restli-Protocol-Version': '2.0.0',
    });
  });

  it('filters author, lifecycle, timestamp and media counts', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response({
        elements: [
          element({ author: 'other' }),
          element({ lifecycleState: 'DRAFT' }),
          element({ createdAt: 1 }),
          element({ content: { multiImage: { images: [{}, {}] } } }),
          element(),
        ],
      })
    );
    expect(
      (
        await new LinkedinPageProvider().findRecentPublication(
          integration,
          'test-token',
          post,
          since
        )
      )?.postId
    ).toBe('urn:li:share:found');
  });

  it('counts an image carousel published as a PDF as one attachment', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response({
        elements: [
          element({ content: { media: { id: 'urn:li:document:pdf' } } }),
        ],
      })
    );
    const media = [
      { type: 'image' as const, path: 'one' },
      { type: 'image' as const, path: 'two' },
    ];
    expect(
      (
        await new LinkedinPageProvider().findRecentPublication(
          integration,
          'test-token',
          { ...post, settings: { post_as_images_carousel: true }, media },
          since
        )
      )?.postId
    ).toBe('urn:li:share:found');
  });

  it('paginates by start and fails on malformed responses', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        response({
          elements: Array.from({ length: 100 }, () =>
            element({ commentary: 'Other' })
          ),
        })
      )
      .mockResolvedValueOnce(response({ elements: [element()] }));
    expect(
      (
        await new LinkedinPageProvider().findRecentPublication(
          integration,
          'test-token',
          post,
          since
        )
      )?.postId
    ).toBe('urn:li:share:found');
    expect(
      new URL((global.fetch as jest.Mock).mock.calls[1][0]).searchParams.get(
        'start'
      )
    ).toBe('100');
    global.fetch = jest.fn().mockResolvedValue(response({ error: 'denied' }));
    await expect(
      new LinkedinPageProvider().findRecentPublication(
        integration,
        'test-token',
        post,
        since
      )
    ).rejects.toThrow('Invalid');
  });

  it('follows explicit next-page offsets even on a short page and rejects a stalled offset', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        response({
          elements: [element({ commentary: 'Other' })],
          paging: {
            links: [
              {
                rel: 'next',
                href: 'https://untrusted.test/rest/posts?start=1',
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(response({ elements: [element()] }));
    expect(
      (
        await new LinkedinPageProvider().findRecentPublication(
          integration,
          'test-token',
          post,
          since
        )
      )?.postId
    ).toBe('urn:li:share:found');
    const url = new URL((global.fetch as jest.Mock).mock.calls[1][0]);
    expect(url.hostname).toBe('api.linkedin.com');
    expect(url.searchParams.get('start')).toBe('1');
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        response({
          elements: [],
          paging: { links: [{ rel: 'next', href: '/rest/posts?start=0' }] },
        })
      );
    await expect(
      new LinkedinPageProvider().findRecentPublication(
        integration,
        'test-token',
        post,
        since
      )
    ).rejects.toThrow('pagination');
  });

  it('fails closed when the scan limit is reached', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response({
        elements: Array.from({ length: 100 }, () =>
          element({ commentary: 'Other' })
        ),
      })
    );
    await expect(
      new LinkedinPageProvider().findRecentPublication(
        integration,
        'test-token',
        post,
        since
      )
    ).rejects.toThrow('scan limit');
    expect(global.fetch).toHaveBeenCalledTimes(20);
  });
});
