import { applyBrandName, brandConfigServerSide } from './brand';
import { resolvePublicUrls } from './public.origin';

describe('white-label brand', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to the upstream name without BRAND_NAME', () => {
    delete process.env.BRAND_NAME;
    process.env.IS_GENERAL = 'true';
    const brand = brandConfigServerSide();
    expect(brand.name).toBe('Postiz');
    expect(brand.whiteLabel).toBe(false);
    expect(applyBrandName('Welcome to Postiz', '')).toBe('Welcome to Postiz');
  });

  it('replaces only the capitalised product word', () => {
    process.env.BRAND_NAME = 'DappGo Publisher';
    const { name, whiteLabel } = brandConfigServerSide();
    expect(whiteLabel).toBe(true);
    expect(
      applyBrandName(
        'Logout from Postiz; header x-postiz-org; see postiz.com and @postiz/wallets',
        name
      )
    ).toBe(
      'Logout from DappGo Publisher; header x-postiz-org; see postiz.com and @postiz/wallets'
    );
  });
});

describe('public hostname aliases', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://postiz.example.test';
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://postiz.example.test/api';
    process.env.FRONTEND_URL_ALIASES = 'https://publish.example.test/';
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('keeps the canonical origin for the canonical or an unknown host', () => {
    for (const host of ['postiz.example.test', 'evil.example', '', null]) {
      expect(resolvePublicUrls(host)).toEqual({
        frontEndUrl: 'https://postiz.example.test',
        backendUrl: 'https://postiz.example.test/api',
      });
    }
  });

  it('serves an allow-listed alias end to end on that hostname', () => {
    expect(resolvePublicUrls('Publish.Example.Test')).toEqual({
      frontEndUrl: 'https://publish.example.test',
      backendUrl: 'https://publish.example.test/api',
    });
  });

  it('does not re-root a backend that lives on another origin', () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.test';
    expect(resolvePublicUrls('publish.example.test').backendUrl).toBe(
      'https://api.example.test'
    );
  });
});
