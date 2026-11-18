import { mediaTypeForPath } from './media.type';

describe('mediaTypeForPath', () => {
  it('marks video uploads as video', () => {
    expect(mediaTypeForPath('/uploads/2026/11/18/abc.mp4')).toBe('video');
    expect(mediaTypeForPath('https://postiz.test/uploads/ABC.MP4?sig=1')).toBe('video');
    expect(mediaTypeForPath('/uploads/clip.mov')).toBe('video');
  });

  it('keeps images and unknown paths as image', () => {
    expect(mediaTypeForPath('/uploads/card.png')).toBe('image');
    expect(mediaTypeForPath('/uploads/mp4/card.jpg')).toBe('image');
    expect(mediaTypeForPath('/uploads/no-extension')).toBe('image');
    expect(mediaTypeForPath(undefined)).toBe('image');
  });
});
