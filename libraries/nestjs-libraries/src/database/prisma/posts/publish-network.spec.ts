import { PostsRepository } from './posts.repository';

// Evaluate the Prisma predicates against a row, so these tests exercise the
// conditional writes (including a publication concurrent with the error).
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((item: any) => matches(row, item));
    if (key === 'NOT') return !matches(row, value);
    if (value && typeof value === 'object') {
      return (
        (!('not' in value) || row[key] !== value.not) &&
        (!value.notIn || (row[key] !== null && !value.notIn.includes(row[key])))
      );
    }
    return row[key] === value;
  });
}

function setup(overrides: any = {}, betweenWrites?: (row: any) => void) {
  const row = {
    id: 'post',
    organizationId: 'org',
    state: 'QUEUE',
    releaseId: null,
    releaseURL: null,
    integration: { providerIdentifier: 'threads' },
    ...overrides,
  };
  let writes = 0;
  const post = {
    updateMany: jest.fn(async ({ where, data }) => {
      const match = matches(row, where);
      if (match) Object.assign(row, data);
      if (++writes === 1) betweenWrites?.(row);
      return { count: Number(match) };
    }),
    update: jest.fn(async ({ data }) => Object.assign(row, data)),
    findUniqueOrThrow: jest.fn(async () => row),
  };
  const create = jest.fn().mockResolvedValue({});
  const repository = new PostsRepository(
    { model: { post } } as any,
    null!,
    null!,
    null!,
    null!,
    { model: { errors: { create } } } as any
  );
  return { repository, row, post, create };
}

describe('publication state correctness', () => {
  it.each([
    { state: 'PUBLISHED' },
    { releaseId: 'platform-id' },
    { releaseURL: 'https://example.test/published' },
    {
      state: 'ERROR',
      releaseId: 'platform-id',
      releaseURL: 'https://example.test/published',
    },
  ])(
    'preserves or restores confirmed publication and records secondary failure: %j',
    async (fields) => {
      const { repository, row, create } = setup(fields);
      await repository.changeState('post', 'ERROR', 'fetch failed', [
        { id: 'reply' },
      ]);
      expect(row).toMatchObject({
        ...fields,
        state: 'PUBLISHED',
        error: 'fetch failed',
      });
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          postId: 'post',
          message: 'fetch failed',
        }),
      });
    }
  );

  it.each([{}, { releaseId: '', releaseURL: '' }, { releaseId: 'missing' }])(
    'marks a genuine unconfirmed publish failure ERROR: %j',
    async (fields) => {
      const { repository, row, create } = setup(fields);
      await repository.changeState('post', 'ERROR', 'Rejected', [
        { id: 'post' },
      ]);
      expect(row.state).toBe('ERROR');
      expect(row.error).toBe('Rejected');
      expect(create).toHaveBeenCalledTimes(1);
    }
  );

  it('cannot overwrite a publication that completes between conditional writes', async () => {
    const { repository, row } = setup({}, (current) => {
      Object.assign(current, {
        state: 'PUBLISHED',
        releaseId: 'new-id',
        releaseURL: 'https://example.test/new',
      });
    });
    await repository.changeState('post', 'ERROR', 'late failure', []);
    expect(row).toMatchObject({
      state: 'PUBLISHED',
      releaseId: 'new-id',
      error: 'late failure',
    });
  });

  it('retains ordinary scheduling state changes', async () => {
    const { repository, row, post } = setup({ state: 'DRAFT' });
    await repository.changeState('post', 'QUEUE');
    expect(row.state).toBe('QUEUE');
    expect(post.updateMany).not.toHaveBeenCalled();
  });
});
