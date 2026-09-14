export type FacebookStoryRecord = {
  post_id?: unknown;
  url?: unknown;
};

const FACEBOOK_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
]);

/**
 * Meta returns the canonical Story viewer URL from the Page Stories edge.
 * Treat that value as data, but only accept an HTTPS Facebook Story URL so a
 * malformed provider response cannot become a user-facing release link.
 */
export function isCanonicalFacebookStoryUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;

  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      FACEBOOK_HOSTS.has(parsed.hostname.toLowerCase()) &&
      /^\/stories(?:\/|$)/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function findFacebookStoryUrl(
  records: unknown,
  storyPostId: string
): string | null {
  if (!Array.isArray(records) || !storyPostId) return null;

  const match = records.find((record: FacebookStoryRecord) => {
    return (
      String(record?.post_id ?? '') === storyPostId &&
      isCanonicalFacebookStoryUrl(record?.url)
    );
  }) as FacebookStoryRecord | undefined;

  return typeof match?.url === 'string' ? match.url : null;
}

export function facebookPageUrl(
  profile: string | null | undefined,
  pageId: string
): string {
  const pagePath = (profile || pageId).trim();
  return `https://www.facebook.com/${encodeURIComponent(pagePath)}`;
}
