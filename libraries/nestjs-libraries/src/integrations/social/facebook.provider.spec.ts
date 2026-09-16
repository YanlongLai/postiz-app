import { FacebookProvider } from './facebook.provider';

function jsonResponse(value: unknown): Response {
  return { json: async () => value } as Response;
}

describe('FacebookProvider Story publishing', () => {
  const integration = {
    internalId: 'page-id',
    profile: 'dappgo',
  } as any;

  it('stores the canonical Story URL returned by the Page Stories edge', async () => {
    const provider = new FacebookProvider();
    const fetchMock = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ post_id: 'story-post-id' }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              post_id: 'story-post-id',
              url: 'https://www.facebook.com/stories/page/token/?view_single=1',
            },
          ],
        })
      );

    const result = await provider.finalizePost(
      'page-access-token',
      {
        postType: 'story',
        items: [{ kind: 'photo', mediaId: 'photo-id' }],
        publishedCount: 0,
        lastPostId: '',
        attempting: 0,
        confirmed: true,
      },
      integration
    );

    expect(result).toEqual({
      status: 'completed',
      postId: 'story-post-id',
      releaseURL:
        'https://www.facebook.com/stories/page/token/?view_single=1',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/page-id/stories?fields=post_id,url&access_token='),
      undefined,
      'resolve Facebook Story URL'
    );
  });

  it('does not retry the publish when canonical URL lookup fails', async () => {
    const provider = new FacebookProvider();
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ post_id: 'story-post-id' }))
      .mockRejectedValueOnce(new Error('temporary Graph read failure'));
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await provider.finalizePost(
      'page-access-token',
      {
        postType: 'story',
        items: [{ kind: 'photo', mediaId: 'photo-id' }],
        publishedCount: 0,
        lastPostId: '',
        attempting: 0,
        confirmed: true,
      },
      integration
    );

    expect(result).toEqual({
      status: 'completed',
      postId: 'story-post-id',
      releaseURL: 'https://www.facebook.com/dappgo',
    });
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });
});
