jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
// Receipt projection does not sanitize content; isolate the unrelated ESM
// DOMPurify dependency pulled in by the general post DTO.
jest.mock('@gitroom/helpers/utils/sanitize.post.content', () => ({
  sanitizePostContent: (value: string) => value,
}));

import { PostsRepository } from './posts.repository';
import { PostsService } from './posts.service';
import { ConfirmedStoryFrameReceipt } from '../../../dtos/posts/story.frame.receipt.dto';

const receipt: ConfirmedStoryFrameReceipt = {
  frameIndex: 0,
  platformId: 'real-media',
  confirmedAt: '2026-10-08T06:00:00.000Z',
  status: 'confirmed',
};
function repository(model: any) {
  return new PostsRepository(
    { model } as any,
    null!,
    null!,
    null!,
    null!,
    null!
  );
}
function service(repo: any) {
  return new PostsService(
    repo,
    null!,
    null!,
    null!,
    null!,
    null!,
    null!,
    null!
  );
}

describe('Story frame receipt repository/service boundary', () => {
  it('capability probe directly reads all receipt columns even on an empty database', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await repository({
      storyFrameReceipt: { findFirst },
    }).assertStoryFrameReceiptSchemaReady('org');
    expect(findFirst).toHaveBeenCalledWith({
      where: { post: { organizationId: 'org', deletedAt: null } },
      select: {
        postId: true,
        publicationId: true,
        frameIndex: true,
        platformId: true,
        confirmedAt: true,
        status: true,
      },
    });
  });

  it('capability returns only static approved fields after successful schema probe', async () => {
    const probe = jest.fn().mockResolvedValue(undefined);
    expect(
      await service({
        assertStoryFrameReceiptSchemaReady: probe,
      }).getStoryFrameCapabilities('org')
    ).toEqual({
      contractVersion: 'story-frame-receipts-v1',
      maxFrames: 3,
      perFrameReceipts: true,
    });
    expect(probe).toHaveBeenCalledWith('org');
  });

  it.each(['P2021', 'P2022', 'P1001'])(
    'capability fails closed without DB details on %s',
    async (code) => {
      const probe = jest
        .fn()
        .mockRejectedValue({ code, message: 'private DB detail' });
      await expect(
        service({
          assertStoryFrameReceiptSchemaReady: probe,
        }).getStoryFrameCapabilities('org')
      ).rejects.toMatchObject({
        status: 503,
        message: 'Story frame receipts schema is not ready',
      });
    }
  );

  it('queries the authenticated organization and projects only approved fields', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await repository({ post: { findFirst } }).getStoryFrameReceipts(
      'owner-org',
      'post'
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'post', organizationId: 'owner-org', deletedAt: null },
      select: {
        id: true,
        storyFrameReceipts: {
          where: {},
          orderBy: [{ confirmedAt: 'asc' }, { frameIndex: 'asc' }],
          select: {
            postId: true,
            frameIndex: true,
            platformId: true,
            confirmedAt: true,
            status: true,
          },
        },
      },
    });
  });

  it('isolates repeat occurrences by private run identity', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await repository({ post: { findFirst } }).getStoryFrameReceipts(
      'org',
      'post',
      'run-2'
    );
    expect(findFirst.mock.calls[0][0].select.storyFrameReceipts.where).toEqual({
      publicationId: 'run-2',
    });
  });

  it('immutably upserts the receipt under an organization-scoped parent', async () => {
    const update = jest.fn().mockResolvedValue({
      storyFrameReceipts: [{ platformId: 'real-media' }],
    });
    await repository({ post: { update } }).recordStoryFrameReceipt(
      'org',
      'post',
      'run',
      receipt
    );
    const query = update.mock.calls[0][0];
    expect(query.where).toEqual({
      id: 'post',
      organizationId: 'org',
      deletedAt: null,
    });
    expect(query.data.storyFrameReceipts.upsert).toEqual({
      where: {
        postId_publicationId_frameIndex: {
          postId: 'post',
          publicationId: 'run',
          frameIndex: 0,
        },
      },
      create: {
        publicationId: 'run',
        frameIndex: 0,
        platformId: 'real-media',
        confirmedAt: new Date(receipt.confirmedAt),
        status: 'confirmed',
      },
      update: {},
    });
  });

  it('holds conflicting receipt IDs without overwriting existing confirmation', async () => {
    const update = jest.fn().mockResolvedValue({
      storyFrameReceipts: [{ platformId: 'different-real-media' }],
    });
    await expect(
      repository({ post: { update } }).recordStoryFrameReceipt(
        'org',
        'post',
        'run',
        receipt
      )
    ).rejects.toThrow('Conflicting');
    expect(
      update.mock.calls[0][0].data.storyFrameReceipts.upsert.update
    ).toEqual({});
  });

  it('service strips accidental extra fields and serializes confirmation time', async () => {
    const getStoryFrameReceipts = jest.fn().mockResolvedValue({
      id: 'post',
      content: 'private caption',
      storyFrameReceipts: [
        {
          ...receipt,
          postId: 'post',
          confirmedAt: new Date(receipt.confirmedAt),
          publicationId: 'private-run',
          pendingData: { token: 'not-returned' },
        },
      ],
    });
    expect(
      await service({ getStoryFrameReceipts }).getStoryFrameReceipts(
        'org',
        'post'
      )
    ).toEqual({ postId: 'post', receipts: [{ ...receipt, postId: 'post' }] });
    expect(getStoryFrameReceipts).toHaveBeenCalledWith(
      'org',
      'post',
      undefined
    );
  });

  it('foreign-org/missing posts receive indistinguishable 404s', async () => {
    const getStoryFrameReceipts = jest.fn().mockResolvedValue(null);
    await expect(
      service({ getStoryFrameReceipts }).getStoryFrameReceipts(
        'foreign-org',
        'post'
      )
    ).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    { ...receipt, frameIndex: -1 },
    { ...receipt, frameIndex: 0.5 },
    { ...receipt, platformId: '' },
    { ...receipt, confirmedAt: 'invalid' },
    { ...receipt, status: 'pending' },
  ])('rejects invalid confirmation before Prisma (%j)', async (invalid) => {
    const recordStoryFrameReceipt = jest.fn();
    expect(() =>
      service({ recordStoryFrameReceipt }).recordStoryFrameReceipt(
        'org',
        'post',
        'run',
        invalid as any
      )
    ).toThrow('Invalid confirmed');
    expect(recordStoryFrameReceipt).not.toHaveBeenCalled();
  });
});
