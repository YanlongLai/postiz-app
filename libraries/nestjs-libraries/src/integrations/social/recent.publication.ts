import { parseFragment } from 'parse5';
import { PostDetails, PostResponse } from './social.integrations.interface';

// Case-sensitive, decoded plain text; block boundaries count as whitespace.
// Compare exactly the first 280 Unicode characters, never a shorter prefix.
// Threads/Instagram rewrite/truncate URLs, so ignore http(s) URLs on BOTH
// sides there (including a trailing truncated URL). Do not ignore other text
// truncation: a short caption must not match a longer, unrelated publication.
export function publicationText(value: string, ignoreLinks = false): string {
  const text = (node: any): string => {
    if (node.nodeName === '#text') return node.value;
    if (['script', 'style'].includes(node.nodeName)) return '';
    const children = (node.childNodes || []).map(text).join('');
    return ['p', 'div', 'br', 'li'].includes(node.nodeName)
      ? ` ${children} `
      : children;
  };
  let plain = text(parseFragment(value || ''));
  if (ignoreLinks) plain = plain.replace(/https?:\/\/\S*/gi, '');
  return Array.from(plain.replace(/\s+/g, ' ').trim()).slice(0, 280).join('');
}

export type RecentPublication = {
  id: string;
  text: string;
  publishedAt: string | number;
  url: string;
  mediaCount?: number;
};

export function matchingPublication(
  candidate: RecentPublication,
  post: PostDetails,
  since: Date,
  ignoreLinks = false
): PostResponse | undefined {
  const timestamp = new Date(candidate.publishedAt).getTime();
  if (!candidate.id || !Number.isFinite(timestamp)) {
    throw new Error('Incomplete recent publication');
  }
  if (timestamp < since.getTime()) return;
  if (
    candidate.mediaCount !== undefined &&
    candidate.mediaCount !== (post.media?.length || 0)
  )
    return;
  if (
    publicationText(candidate.text, ignoreLinks) !==
    publicationText(post.message, ignoreLinks)
  )
    return;
  return {
    id: post.id,
    postId: candidate.id,
    releaseURL: candidate.url,
    status: 'success',
  };
}

// Follow cursors on the original endpoint, never a server-supplied URL carrying
// credentials. A bounded/incomplete scan fails closed rather than re-publishing.
export async function findRecentMetaPublication(
  fetchPage: (url: string) => Promise<Response>,
  url: URL,
  post: PostDetails,
  since: Date,
  candidate: (item: any) => RecentPublication | undefined,
  ignoreLinks = false,
  newestFirst = true
): Promise<PostResponse | undefined> {
  const cursors = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const body = await (await fetchPage(url.toString())).json();
    if (body.error || !Array.isArray(body.data))
      throw new Error('Invalid recent publications response');
    for (const item of body.data) {
      const publication = candidate(item);
      if (!publication) continue;
      const match = matchingPublication(publication, post, since, ignoreLinks);
      if (match) return match;
    }
    if (!body.paging?.next) return;
    // Instagram does not support a server-side since filter. Only stop an
    // ordered edge after a whole page predates it; replies scan every page.
    if (
      newestFirst &&
      body.data.length &&
      body.data.every((item: any) => {
        const timestamp = new Date(
          item.timestamp || item.created_time
        ).getTime();
        return Number.isFinite(timestamp) && timestamp < since.getTime();
      })
    )
      return;
    const after = body.paging?.cursors?.after;
    if (!after || cursors.has(after))
      throw new Error('Incomplete recent publications pagination');
    cursors.add(after);
    url.searchParams.set('after', after);
  }
  throw new Error('Recent publications scan limit reached');
}

export function metaMediaCount(item: any): number | undefined {
  if (item.children?.paging?.next) return undefined;
  if (Array.isArray(item.children?.data)) return item.children.data.length;
  if (['IMAGE', 'VIDEO', 'REELS'].includes(item.media_type)) return 1;
  if (item.media_type === 'TEXT_POST') return 0;
  return undefined;
}
