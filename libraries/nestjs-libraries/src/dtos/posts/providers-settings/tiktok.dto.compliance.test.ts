import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TikTokDto } from './tiktok.dto';

const base = {
  privacy_level: 'SELF_ONLY',
  duet: false,
  stitch: false,
  comment: false,
  autoAddMusic: 'no',
  brand_content_toggle: false,
  brand_organic_toggle: false,
  content_posting_method: 'DIRECT_POST',
};
const errors = (o: object) =>
  validateSync(plainToInstance(TikTokDto, o)).flatMap((e) =>
    Object.values(e.constraints || {})
  );

describe('TikTok Content Sharing Guidelines validation', () => {
  it('requires a manual privacy choice (no default)', () => {
    expect(errors({ ...base, privacy_level: '' }).length).toBeGreaterThan(0);
    expect(errors(base)).toEqual([]);
  });

  it('requires a commercial-content choice once disclosure is on', () => {
    expect(errors({ ...base, disclose: true })).toContain(
      'You need to indicate if your content promotes yourself, a third party, or both.'
    );
    expect(
      errors({ ...base, disclose: true, brand_organic_toggle: true })
    ).toEqual([]);
  });

  it('does not allow branded content with private visibility', () => {
    expect(
      errors({ ...base, disclose: true, brand_content_toggle: true })
    ).toContain('Branded content visibility cannot be set to private.');
    expect(
      errors({
        ...base,
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disclose: true,
        brand_content_toggle: true,
      })
    ).toEqual([]);
  });

  it('leaves existing API clients (no disclose field) unaffected', () => {
    expect(errors({ ...base, privacy_level: 'PUBLIC_TO_EVERYONE' })).toEqual(
      []
    );
  });
});
