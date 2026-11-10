import { LinkedinPageProvider } from './linkedin.page.provider';
import { LinkedinProvider } from './linkedin.provider';

const response = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body } as Response);

describe('LinkedIn Community Management Page authorization', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  const provider = new LinkedinPageProvider();
  beforeEach(() => {
    process.env.LINKEDIN_CLIENT_ID = 'test-client';
    process.env.LINKEDIN_CLIENT_SECRET = 'test-secret';
    process.env.FRONTEND_URL = 'https://postiz.example.test';
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });
  it('requests approved Page scopes while personal LinkedIn retains OpenID', async () => {
    const { url } = await provider.generateAuthUrl();
    const params = new URL(url).searchParams;
    expect(params.get('scope')?.split(' ')).not.toEqual(
      expect.arrayContaining(['openid'])
    );
    expect(provider.scopes).not.toContain('profile');
    expect(provider.scopes).toContain('r_basicprofile');
    expect(new LinkedinProvider().scopes).toEqual(
      expect.arrayContaining(['openid', 'profile'])
    );
    expect(params.get('redirect_uri')).toBe(
      'https://postiz.example.test/integrations/social/linkedin-page'
    );
  });
  it.each(['authenticate', 'refreshToken'] as const)(
    '%s succeeds without userinfo/OIDC',
    async (method) => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(
          response({
            access_token: 'token',
            refresh_token: 'refresh',
            expires_in: 3600,
            scope: provider.scopes.join(','),
          })
        )
        .mockResolvedValueOnce(
          response({
            id: 'member',
            localizedFirstName: 'Yan',
            localizedLastName: 'Lai',
            vanityName: 'yan',
          })
        );
      global.fetch = fetchMock;
      const result =
        method === 'authenticate'
          ? await provider.authenticate({
              code: 'code',
              codeVerifier: 'verifier',
            })
          : await provider.refreshToken('old-refresh');
      expect(result).toMatchObject({
        id: method === 'authenticate' ? 'linkedin-page_member' : 'member',
        name: 'Yan Lai',
        accessToken: 'token',
        refreshToken: 'refresh',
      });
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
        'https://www.linkedin.com/oauth/v2/accessToken',
        'https://api.linkedin.com/v2/me',
      ]);
    }
  );
  it('keeps original and traditional Chinese Pages selectable with separate IDs', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response({
        elements: [
          {
            role: 'ADMINISTRATOR',
            organizationalTarget: 'urn:li:organization:143126106',
            'organizationalTarget~': {
              localizedName: 'DappGo',
              vanityName: 'dappgo',
            },
          },
          {
            role: 'CONTENT_ADMINISTRATOR',
            organizationalTarget: 'urn:li:organization:144102554',
            'organizationalTarget~': {
              localizedName: 'DappGo 繁中',
              vanityName: 'dappgo-tw',
            },
          },
        ],
      })
    );
    expect(
      (await provider.companies('token')).map((page) => [page.id, page.name])
    ).toEqual([
      ['143126106', 'DappGo'],
      ['144102554', 'DappGo 繁中'],
    ]);
  });
  it('fails closed when member identity cannot be loaded', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        response({ access_token: 'token', scope: provider.scopes.join(',') })
      )
      .mockResolvedValueOnce(
        response({ message: 'secret upstream detail' }, false, 403)
      );
    await expect(
      provider.authenticate({ code: 'code', codeVerifier: 'verifier' })
    ).rejects.toThrow('LinkedIn Page profile request failed (403)');
  });
});
