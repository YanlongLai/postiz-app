// Optional white-label branding for self-hosted deployments.
//
// BRAND_NAME (and the optional BRAND_* assets below) let an operator present
// this instance under their own product name. When BRAND_NAME is unset every
// helper returns the upstream defaults, so behaviour is unchanged.
//
// The AGPL-3.0 licence and the upstream copyright notices are NOT affected by
// branding: they stay in the repository and remain reachable from the
// "About & licences" page (see apps/frontend/src/app/(app)/(site)/about).

export const UPSTREAM_BRAND_NAME = 'Postiz';

export interface BrandConfig {
  /** Product name shown in the UI, page titles and emails. */
  name: string;
  /** True only when an operator configured BRAND_NAME. */
  whiteLabel: boolean;
  /** Square logo mark (sidebar, preview pages). Empty = upstream logo. */
  logoUrl: string;
  /** Favicon. */
  faviconUrl: string;
  /** Short tagline for the sign-in page. */
  tagline: string;
  /** Public home of the operator (footer / about link). */
  homeUrl: string;
  termsUrl: string;
  privacyUrl: string;
  /** Where the corresponding source code of this instance is published. */
  sourceUrl: string;
}

const clean = (value?: string) => (value || '').trim();

export const brandConfigServerSide = (): BrandConfig => {
  const name = clean(process.env.BRAND_NAME);
  return {
    name: name || (process.env.IS_GENERAL ? UPSTREAM_BRAND_NAME : 'Gitroom'),
    whiteLabel: !!name,
    logoUrl: clean(process.env.BRAND_LOGO_URL),
    faviconUrl: clean(process.env.BRAND_FAVICON_URL) || '/favicon.ico',
    tagline: clean(process.env.BRAND_TAGLINE),
    homeUrl: clean(process.env.BRAND_HOME_URL),
    termsUrl: clean(process.env.BRAND_TERMS_URL) || 'https://postiz.com/terms',
    privacyUrl:
      clean(process.env.BRAND_PRIVACY_URL) || 'https://postiz.com/privacy',
    sourceUrl:
      clean(process.env.BRAND_SOURCE_URL) ||
      'https://github.com/gitroomhq/postiz-app',
  };
};

export const brandNameServerSide = () => brandConfigServerSide().name;

/**
 * Replace the upstream product name inside user-facing copy. Only the exact,
 * capitalised word is replaced so identifiers such as `x-postiz-org`,
 * `@postiz/...` packages or `postiz.com` URLs are left untouched.
 */
export const applyBrandName = (text: string, name?: string) => {
  if (
    typeof text !== 'string' ||
    !name ||
    name === UPSTREAM_BRAND_NAME ||
    text.indexOf(UPSTREAM_BRAND_NAME) === -1
  ) {
    return text;
  }
  return text.replace(/\bPostiz\b/g, name);
};
