jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  () => ({ UsersService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
  socialIntegrationList: [],
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
jest.mock('@gitroom/helpers/utils/sanitize.post.content', () => ({
  sanitizePostContent: (value: string) => value,
}));
jest.mock('@gitroom/backend/services/auth/super.admin.guard', () => ({
  SuperAdminGuard: class {},
}));
jest.mock('@gitroom/nestjs-libraries/chat/validation.schemas.helper', () => ({
  getValidationSchemas: () => ({}),
}));
jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service',
  () => ({ OAuthService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/sentry/initialize.sentry', () => ({
  setSentryUserContext: jest.fn(),
}));
jest.mock('@gitroom/nestjs-libraries/services/exception.filter', () => ({
  HttpForbiddenException: class extends Error {},
}));

import 'reflect-metadata';
import { PublicIntegrationsController } from './public.integrations.controller';
import { PublicAuthMiddleware } from '@gitroom/backend/services/auth/public.auth.middleware';
import { readFileSync } from 'fs';

describe('authenticated private receipt route', () => {
  it('capability GET passes authenticated org and exposes only readiness metadata', async () => {
    const response = {
      contractVersion: 'story-frame-receipts-v1',
      maxFrames: 3,
      perFrameReceipts: true,
    };
    const getStoryFrameCapabilities = jest.fn().mockResolvedValue(response);
    const controller = new PublicIntegrationsController(
      null!,
      { getStoryFrameCapabilities } as any,
      null!,
      null!,
      null!,
      null!,
      null!
    );
    expect(
      await controller.getStoryFrameCapabilities({ id: 'org' } as any)
    ).toEqual(response);
    expect(getStoryFrameCapabilities).toHaveBeenCalledWith('org');
    expect(
      Reflect.getMetadata('path', controller.getStoryFrameCapabilities)
    ).toBe('/integrations/story-frame-capabilities');
    expect(
      Reflect.getMetadata('method', controller.getStoryFrameCapabilities)
    ).toBe(0);
  });

  it('GET uses authenticated org and returns the narrow service projection', async () => {
    const response = {
      postId: 'post',
      receipts: [
        {
          postId: 'post',
          frameIndex: 0,
          platformId: 'real-id',
          confirmedAt: '2026-10-08T06:00:00.000Z',
          status: 'confirmed',
        },
      ],
    };
    const getStoryFrameReceipts = jest.fn().mockResolvedValue(response);
    const controller = new PublicIntegrationsController(
      null!,
      { getStoryFrameReceipts } as any,
      null!,
      null!,
      null!,
      null!,
      null!
    );
    expect(
      await controller.getStoryFrameReceipts(
        { id: 'authenticated-org' } as any,
        'post'
      )
    ).toEqual(response);
    expect(getStoryFrameReceipts).toHaveBeenCalledWith(
      'authenticated-org',
      'post'
    );
    expect(Reflect.getMetadata('path', controller.getStoryFrameReceipts)).toBe(
      '/posts/:id/story-frame-receipts'
    );
    expect(
      Reflect.getMetadata('method', controller.getStoryFrameReceipts)
    ).toBe(0);
  });

  it('rejects unauthenticated access before querying organization or receipt', async () => {
    const getOrgByApiKey = jest.fn();
    const middleware = new PublicAuthMiddleware(
      { getOrgByApiKey } as any,
      {} as any
    );
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await middleware.use({ headers: {} } as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(getOrgByApiKey).not.toHaveBeenCalled();
  });

  it('rejects invalid API credentials', async () => {
    const middleware = new PublicAuthMiddleware(
      { getOrgByApiKey: jest.fn().mockResolvedValue(null) } as any,
      {} as any
    );
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await middleware.use(
      { headers: { authorization: 'invalid-key' } } as any,
      res as any,
      next
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('controller remains covered by existing authentication middleware', () => {
    const module = readFileSync(
      'apps/backend/src/public-api/public.api.module.ts',
      'utf8'
    );
    expect(module).toContain(
      'const authenticatedController = [PublicIntegrationsController]'
    );
    expect(module).toContain(
      'consumer.apply(PublicAuthMiddleware).forRoutes(...authenticatedController)'
    );
  });
});
