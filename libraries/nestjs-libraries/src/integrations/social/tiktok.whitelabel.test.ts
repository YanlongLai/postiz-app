import {
  TIKTOK_DEFAULT_SCOPES,
  TiktokProvider,
  tiktokRedirectUri,
  tiktokScopes,
  tiktokUserInfoFields,
} from './tiktok.provider';

const response = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body } as Response);

describe('TikTok branded redirect host and approved scopes', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.TIKTOK_CLIENT_ID = 'test-client';
    process.env.TIKTOK_CLIENT_SECRET = 'test-secret';
    process.env.FRONTEND_URL = 'https://postiz.example.test';
    delete process.env.TIKTOK_REDIRECT_BASE_URL;
    delete process.env.TIKTOK_SCOPES;
    delete process.env.TIKTOK_DISABLE_AUTO_AUTH;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('keeps the upstream redirect and scopes when nothing is configured', async () => {
    expect(tiktokRedirectUri()).toBe(
      'https://postiz.example.test/integrations/social/tiktok'
    );
    expect(tiktokScopes()).toEqual(TIKTOK_DEFAULT_SCOPES);
    const { url } = await new TiktokProvider().generateAuthUrl();
    expect(new URL(url).searchParams.get('redirect_uri')).toBe(
      'https://postiz.example.test/integrations/social/tiktok'
    );
  });

  it('uses TIKTOK_REDIRECT_BASE_URL for both authorize and token exchange', async () => {
    process.env.TIKTOK_REDIRECT_BASE_URL = 'https://publish.example.test/';
    process.env.TIKTOK_SCOPES = 'user.info.basic, video.publish,video.upload';
    const provider = new TiktokProvider();
    const { url } = await provider.generateAuthUrl();
    const params = new URL(url).searchParams;
    expect(params.get('redirect_uri')).toBe(
      'https://publish.example.test/integrations/social/tiktok'
    );
    expect(params.get('scope')).toBe(
      'user.info.basic,video.publish,video.upload'
    );

    const calls: Array<[string, RequestInit | undefined]> = [];
    global.fetch = jest.fn(async (input: any, init?: RequestInit) => {
      calls.push([String(input), init]);
      if (String(input).includes('/oauth/token/')) {
        return response({
          access_token: 'a',
          refresh_token: 'r',
          scope: 'user.info.basic,video.publish,video.upload',
        });
      }
      return response({
        data: {
          user: {
            open_id: 'open-id',
            display_name: 'DappGo',
            avatar_url: 'https://example.test/a.png',
          },
        },
      });
    }) as any;

    const auth = await provider.authenticate({
      code: 'code',
      codeVerifier: 'verifier',
    });
    const tokenBody = new URLSearchParams(String(calls[0][1]?.body));
    expect(tokenBody.get('redirect_uri')).toBe(
      'https://publish.example.test/integrations/social/tiktok'
    );
    // user.info.profile is not granted, so username is not requested.
    expect(calls[1][0]).not.toContain('username');
    expect(auth.username).toBe('DappGo');
    expect(auth.id).toBe('openid');
  });

  it('skips stats and video-list calls when those scopes are not approved', async () => {
    process.env.TIKTOK_SCOPES = 'user.info.basic,video.publish,video.upload';
    const provider = new TiktokProvider();
    global.fetch = jest.fn() as any;
    expect(await provider.analytics('id', 'token', 7)).toEqual([]);
    expect(await provider.missing('id', 'token')).toEqual([]);
    expect(await provider.postAnalytics('id', 'token', 'post', 0)).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requests username only with user.info.profile', () => {
    expect(tiktokUserInfoFields(['user.info.basic'])).not.toContain('username');
    expect(tiktokUserInfoFields(TIKTOK_DEFAULT_SCOPES)).toContain('username');
  });

  it('adds disable_auto_auth=1 only when TIKTOK_DISABLE_AUTO_AUTH is set', async () => {
    let { url } = await new TiktokProvider().generateAuthUrl();
    expect(new URL(url).searchParams.has('disable_auto_auth')).toBe(false);
    process.env.TIKTOK_DISABLE_AUTO_AUTH = 'true';
    ({ url } = await new TiktokProvider().generateAuthUrl());
    expect(new URL(url).searchParams.get('disable_auto_auth')).toBe('1');
  });
});
