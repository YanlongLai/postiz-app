// Serve one instance under more than one public hostname.
//
// FRONTEND_URL stays the canonical origin: OAuth redirect URIs, cookie domain,
// stored media URLs and emails keep using it, so nothing that is already
// registered with a provider changes. FRONTEND_URL_ALIASES (comma separated
// origins, e.g. "https://publish.example.com") lists extra hostnames that
// serve the same UI. A request that arrives on an alias gets an alias-relative
// frontend/backend URL so the browser stays on that hostname end to end
// (same-origin API calls, no cross-site redirect).

const trimOrigin = (value: string) => value.trim().replace(/\/+$/, '');

export const frontendUrlAliases = (): string[] =>
  (process.env.FRONTEND_URL_ALIASES || '')
    .split(',')
    .map(trimOrigin)
    .filter((origin) => {
      try {
        const url = new URL(origin);
        return url.protocol === 'https:' || url.protocol === 'http:';
      } catch {
        return false;
      }
    });

export const resolvePublicUrls = (requestHost?: string | null) => {
  const frontEndUrl = trimOrigin(process.env.FRONTEND_URL || '');
  const backendUrl = trimOrigin(process.env.NEXT_PUBLIC_BACKEND_URL || '');
  const host = (requestHost || '').split(',')[0].trim().toLowerCase();
  if (!host) {
    return { frontEndUrl, backendUrl };
  }

  const alias = frontendUrlAliases().find(
    (origin) => new URL(origin).host.toLowerCase() === host
  );
  if (!alias) {
    return { frontEndUrl, backendUrl };
  }

  // Only re-root the backend when it is served under the canonical frontend
  // origin (the default single-container layout: <FRONTEND_URL>/api).
  return {
    frontEndUrl: alias,
    backendUrl:
      frontEndUrl && backendUrl.startsWith(frontEndUrl + '/')
        ? alias + backendUrl.slice(frontEndUrl.length)
        : backendUrl,
  };
};
