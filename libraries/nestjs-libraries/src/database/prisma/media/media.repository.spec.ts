import { MediaRepository } from './media.repository';

// A Reel MP4 uploaded through the public API used to be stored with the
// column default type 'image'.
describe('MediaRepository media type', () => {
  const build = () => {
    const create = jest.fn(async (args: any) => ({ id: 'm1', ...args.data }));
    const update = jest.fn(async (args: any) => ({ id: 'm1', ...args.data }));
    const repository = new MediaRepository({
      model: { media: { create, update } },
    } as any);
    return { repository, create, update };
  };

  it('stores an MP4 upload as video', async () => {
    const { repository, create } = build();
    await repository.saveFile('org', 'reel.mp4', '/uploads/2026/11/18/reel.mp4');
    expect(create.mock.calls[0][0].data.type).toBe('video');
    expect(create.mock.calls[0][0].select.type).toBe(true);
  });

  it('stores a PNG upload as image', async () => {
    const { repository, create } = build();
    await repository.saveFile('org', 'card.png', 'https://cdn.test/uploads/card.png');
    expect(create.mock.calls[0][0].data.type).toBe('image');
  });

  it('follows the normalized path when processing finishes', async () => {
    const { repository, update } = build();
    await repository.finishProcessing('org', 'm1', { path: '/uploads/clip.mp4' });
    expect(update.mock.calls[0][0].data.type).toBe('video');
    await repository.finishProcessing('org', 'm1', { error: 'boom' });
    expect(update.mock.calls[1][0].data.type).toBeUndefined();
  });
});
