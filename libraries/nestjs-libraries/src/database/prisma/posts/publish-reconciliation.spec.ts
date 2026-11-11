import { PostsRepository } from './posts.repository';

const timestamp = '2026-11-10T12:00:00Z';
function setup(settings: string | null = '{}') {
  const row = { id: 'post', organizationId: 'org', settings };
  const post = {
    findFirstOrThrow: jest.fn(async () => ({ settings: row.settings })),
    updateMany: jest.fn(async ({ where, data }) => {
      if (where.settings !== row.settings) return { count: 0 };
      row.settings = data.settings;
      return { count: 1 };
    }),
  };
  const repository = new PostsRepository(
    { model: { post } } as any,
    null!,
    null!,
    null!,
    null!,
    null!
  );
  return { row, post, repository };
}

describe('persisted publication uncertainty', () => {
  it.each([null, '{}', '{"post_type":"post","keep":true}'])(
    'sets and clears only the marker, preserving settings: %s',
    async (settings) => {
      const { repository, row, post } = setup(settings);
      await repository.setPublishAttemptUncertain('post', 'org', timestamp);
      expect(JSON.parse(row.settings!)).toEqual({
        ...JSON.parse(settings || '{}'),
        publishAttemptUncertainAt: timestamp,
      });
      expect(post.updateMany.mock.calls[0][0].where).toMatchObject({
        id: 'post',
        organizationId: 'org',
        settings,
      });
      await repository.setPublishAttemptUncertain('post', 'org');
      expect(JSON.parse(row.settings!)).toEqual(JSON.parse(settings || '{}'));
    }
  );

  it('retains the earliest unresolved attempt timestamp', async () => {
    const { repository, row } = setup();
    await repository.setPublishAttemptUncertain('post', 'org', timestamp);
    await repository.setPublishAttemptUncertain(
      'post',
      'org',
      '2026-11-10T12:01:00Z'
    );
    expect(JSON.parse(row.settings!).publishAttemptUncertainAt).toBe(timestamp);
  });

  it('rereads and preserves a settings edit concurrent with the marker write', async () => {
    const { repository, row, post } = setup();
    post.updateMany.mockImplementationOnce(async () => {
      row.settings = '{"concurrent":"edit"}';
      return { count: 0 };
    });
    await repository.setPublishAttemptUncertain('post', 'org', timestamp);
    expect(JSON.parse(row.settings!)).toEqual({
      concurrent: 'edit',
      publishAttemptUncertainAt: timestamp,
    });
    expect(post.findFirstOrThrow).toHaveBeenCalledTimes(2);
  });

  it('fails retryably rather than clobbering settings when contention persists', async () => {
    const { repository, post } = setup();
    post.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      repository.setPublishAttemptUncertain('post', 'org', timestamp)
    ).rejects.toThrow('concurrently');
    expect(post.updateMany).toHaveBeenCalledTimes(3);
  });
});
