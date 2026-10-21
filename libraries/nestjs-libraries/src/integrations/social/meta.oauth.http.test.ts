import { NotEnoughScopes } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { FacebookProvider } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';
import { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import {
  fetchMetaJson,
  MetaOAuthError,
} from '@gitroom/nestjs-libraries/integrations/social/meta.oauth.http';

function response(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

const facebookScopes = [
  'pages_show_list',
  'business_management',
  'pages_manage_posts',
  'pages_manage_engagement',
  'pages_read_engagement',
  'read_insights',
];

const instagramScopes = [
  'instagram_basic',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_insights',
];

describe('Meta OAuth HTTP guards', () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    FRONTEND_URL: process.env.FRONTEND_URL,
    FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
    FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
    FACEBOOK_LOGIN_CONFIG_ID: process.env.FACEBOOK_LOGIN_CONFIG_ID,
  };

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://postiz.example.test';
    process.env.FACEBOOK_APP_ID = 'app-id';
    process.env.FACEBOOK_APP_SECRET = 'app-secret';
    delete process.env.FACEBOOK_LOGIN_CONFIG_ID;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.FRONTEND_URL = originalEnv.FRONTEND_URL;
    process.env.FACEBOOK_APP_ID = originalEnv.FACEBOOK_APP_ID;
    process.env.FACEBOOK_APP_SECRET = originalEnv.FACEBOOK_APP_SECRET;
    process.env.FACEBOOK_LOGIN_CONFIG_ID = originalEnv.FACEBOOK_LOGIN_CONFIG_ID;
    jest.restoreAllMocks();
  });

  it('fails at the first upstream error without exposing the response message', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      response(
        {
          error: {
            message: 'token-secret-must-never-appear-in-errors',
            code: 190,
            error_subcode: 123,
          },
        },
        false,
        400
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    let error: unknown;
    try {
      await fetchMetaJson('facebook', 'code-exchange', 'https://meta.test');
      throw new Error('expected MetaOAuthError');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(MetaOAuthError);
    expect((error as Error).message).not.toContain('token-secret');
    expect((error as MetaOAuthError).toLog()).toEqual({
      provider: 'facebook',
      stage: 'code-exchange',
      status: 400,
      reason: 'upstream-error',
      code: '190',
      subcode: '123',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects non-JSON responses with safe stage data', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 502,
      json: jest.fn().mockRejectedValue(new Error('raw upstream body')),
    } as unknown as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      fetchMetaJson('instagram', 'permissions', 'https://meta.test')
    ).rejects.toMatchObject<Partial<MetaOAuthError>>({
      provider: 'instagram',
      stage: 'permissions',
      status: 502,
      reason: 'invalid-json',
    });
  });

  it('does not make a second request when a token field is missing', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response({}));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      new FacebookProvider().authenticate({
        code: 'one-time-code',
        codeVerifier: 'none',
      })
    ).rejects.toMatchObject<Partial<MetaOAuthError>>({
      provider: 'facebook',
      stage: 'code-exchange',
      reason: 'invalid-payload',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['facebook', FacebookProvider, facebookScopes, '/facebook'],
    ['instagram', InstagramProvider, instagramScopes, '/instagram'],
  ])(
    'uses the canonical %s callback even when reconnect metadata is present',
    async (_provider, Provider, scopes, callbackPath) => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      fetchMock
        .mockResolvedValueOnce(response({ access_token: 'short-lived-token' }))
        .mockResolvedValueOnce(response({ access_token: 'long-lived-token' }))
        .mockResolvedValueOnce(
          response({
            data: scopes.map((permission) => ({
              permission,
              status: 'granted',
            })),
          })
        )
        .mockResolvedValueOnce(response({ id: 'account-id', name: 'DappGo' }));

      await new Provider().authenticate({
        code: 'one-time-code',
        codeVerifier: 'none',
        refresh: 'existing-integration-id',
      });

      const firstRequestUrl = String(fetchMock.mock.calls[0][0]);
      expect(firstRequestUrl).toContain(
        encodeURIComponent(
          `https://postiz.example.test/integrations/social${callbackPath}`
        )
      );
      expect(firstRequestUrl).not.toContain('refresh=');
    }
  );

  it.each([
    ['facebook', FacebookProvider, '/facebook'],
    ['instagram', InstagramProvider, '/instagram'],
  ])(
    'includes the Meta Login for Business configuration for %s authorization',
    async (_provider, Provider, callbackPath) => {
      process.env.FACEBOOK_LOGIN_CONFIG_ID = '873512395784947';

      const result = await new Provider().generateAuthUrl();
      const url = new URL(result.url);

      expect(url.searchParams.get('config_id')).toBe('873512395784947');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('override_default_response_type')).toBe(
        'true'
      );
      expect(url.searchParams.get('redirect_uri')).toBe(
        `https://postiz.example.test/integrations/social${callbackPath}`
      );
    }
  );

  it.each([
    ['facebook', FacebookProvider],
    ['instagram', InstagramProvider],
  ])(
    'keeps the legacy authorization shape when no Meta configuration is configured',
    async (_provider, Provider) => {
      delete process.env.FACEBOOK_LOGIN_CONFIG_ID;

      const result = await new Provider().generateAuthUrl();
      const url = new URL(result.url);

      expect(url.searchParams.has('config_id')).toBe(false);
      expect(url.searchParams.has('response_type')).toBe(false);
      expect(url.searchParams.has('override_default_response_type')).toBe(
        false
      );
    }
  );

  it('stops before identity when required scopes are missing', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock
      .mockResolvedValueOnce(response({ access_token: 'short-lived-token' }))
      .mockResolvedValueOnce(response({ access_token: 'long-lived-token' }))
      .mockResolvedValueOnce(response({ data: [] }));

    await expect(
      new InstagramProvider().authenticate({
        code: 'one-time-code',
        codeVerifier: 'none',
      })
    ).rejects.toBeInstanceOf(NotEnoughScopes);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
