import {
  facebookPageUrl,
  findFacebookStoryUrl,
  isCanonicalFacebookStoryUrl,
} from './facebook-story-url';

describe('Facebook Story URL resolution', () => {
  it('accepts the canonical two-segment Story URL returned by Meta', () => {
    expect(
      isCanonicalFacebookStoryUrl(
        'https://facebook.com/stories/123/AbCdEf/?view_single=1'
      )
    ).toBe(true);
  });

  it('uses the URL returned by Meta instead of constructing one from post_id', () => {
    const metaUrl = 'https://www.facebook.com/stories/actor/canonical';

    expect(
      findFacebookStoryUrl([{ post_id: '123', url: metaUrl }], '123')
    ).toBe(metaUrl);
  });

  it('matches the published post id and ignores unrelated or unsafe records', () => {
    expect(
      findFacebookStoryUrl(
        [
          {
            post_id: 'other',
            url: 'https://www.facebook.com/stories/actor/other',
          },
          {
            post_id: '123',
            url: 'https://graph.facebook.com/stories/actor/not-public',
          },
          {
            post_id: '123',
            url: 'https://www.facebook.com/stories/actor/canonical/?view_single=1',
          },
        ],
        '123'
      )
    ).toBe('https://www.facebook.com/stories/actor/canonical/?view_single=1');
  });

  it('creates a durable page fallback without exposing credentials', () => {
    expect(facebookPageUrl('dappgo', '123')).toBe(
      'https://www.facebook.com/dappgo'
    );
    expect(facebookPageUrl('', '123')).toBe('https://www.facebook.com/123');
  });
});
