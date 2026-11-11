import { Injectable } from '@nestjs/common';
import {
  Activity,
  ActivityMethod,
  TemporalService,
} from 'nestjs-temporal-core';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { StoryFrameReceiptContext } from '@gitroom/nestjs-libraries/dtos/posts/story.frame.receipt.dto';
import { selectedPostWorkflow } from '@gitroom/nestjs-libraries/temporal/post.workflow.version';
import {
  NotificationService,
  NotificationType,
} from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { Integration, Post, State } from '@prisma/client';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { ApplicationFailure } from '@temporalio/activity';
import {
  isBeforeConnectError,
  isTransientNetworkError,
} from '@gitroom/nestjs-libraries/integrations/network.errors';
import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  PendingCheckResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { timer } from '@gitroom/helpers/utils/timer';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { TypedSearchAttributes } from '@temporalio/common';
import {
  organizationId,
  postId as postIdSearchParam,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import {
  setHeartbeatDetails,
  withHeartbeat,
} from '@gitroom/nestjs-libraries/temporal/temporal.heartbeat';
import {
  BadBody,
  Disconnect,
  RefreshToken,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';

type PublicationPost = Pick<
  Post,
  'id' | 'intervalInDays' | 'state' | 'releaseId' | 'releaseURL'
>;

// Drops fields the workflow and downstream activities never read — biggest wins are `error` (grows per retry) and `childrenPost` (Prisma side-loads it on every recursive row).
function slimPost(post: any) {
  if (!post) return post;
  const {
    error,
    childrenPost,
    tags,
    description,
    title,
    submittedForOrderId,
    submittedForOrganizationId,
    submittedForOrder,
    submittedForOrganization,
    lastMessageId,
    parentPostId,
    approvedSubmitForOrder,
    deletedAt,
    createdAt,
    updatedAt,
    payoutProblems,
    comments,
    errors,
    ...rest
  } = post;
  return rest;
}

// A genuinely missed occurrence (dead workflow) is only recovered by the
// missing-posts sweep, which runs every hour - so anything later than the
// sweep period plus retry margin is a stale anchor, not a missed publish.
const REANCHOR_GRACE_MS = 2 * 60 * 60 * 1000;

// A repeat post keeps its original anchor publishDate forever (updatePost only
// flips the state, the calendar expands occurrences virtually). If the workflow
// gets that raw past date, any (re)start - an accidental edit resetting the
// state to QUEUE, or a missing-posts sweep poke - sleeps 0 and publishes
// instantly, machine-gunning the channel. Roll the returned date forward to the
// next occurrence on the anchor grid instead, so fresh starts wait for the next
// real occurrence. Only for the initial QUEUE run: repeat chain children
// (postNow) run against a PUBLISHED post and must keep publishing immediately.
// Occurrences missed within the grace window still catch up and post.
function reanchorInterval(post: any) {
  if (!post?.intervalInDays || post.state !== State.QUEUE) {
    return post;
  }

  const interval = post.intervalInDays * 24 * 60 * 60 * 1000;
  const late = Date.now() - new Date(post.publishDate).getTime();
  if (late <= REANCHOR_GRACE_MS) {
    return post;
  }

  const next =
    new Date(post.publishDate).getTime() +
    Math.ceil(late / interval) * interval;

  return { ...post, publishDate: new Date(next) };
}

@Injectable()
@Activity()
export class PostActivity {
  constructor(
    private _postService: PostsService,
    private _notificationService: NotificationService,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _webhookService: WebhooksService,
    private _temporalService: TemporalService,
    private _subscriptionService: SubscriptionService
  ) {}

  @ActivityMethod()
  async getIntegrationById(orgId: string, id: string) {
    return this._integrationService.getIntegrationById(orgId, id);
  }

  @ActivityMethod()
  async searchForMissingThreeHoursPosts() {
    const workflowType = selectedPostWorkflow();
    const list = await this._postService.searchForMissingThreeHoursPosts();
    for (const post of list) {
      await this._temporalService.client
        .getRawClient()
        .workflow.signalWithStart(workflowType, {
          workflowId: `post_${post.id}`,
          taskQueue: 'main',
          signal: 'poke',
          workflowIdConflictPolicy: 'USE_EXISTING',
          signalArgs: [],
          args: [
            {
              taskQueue: post.integration.providerIdentifier
                .split('-')[0]
                .toLowerCase(),
              postId: post.id,
              organizationId: post.organizationId,
            },
          ],
          typedSearchAttributes: new TypedSearchAttributes([
            {
              key: postIdSearchParam,
              value: post.id,
            },
            {
              key: organizationId,
              value: post.organizationId,
            },
          ]),
        });
    }
  }

  @ActivityMethod()
  async updatePost(id: string, postId: string, releaseURL: string) {
    await this._postService.updatePost(id, postId, releaseURL);
  }

  @ActivityMethod()
  async getPost(orgId: string, postId: string) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return false;
      }
    }
    const post = await this._postService.getPostById(postId, orgId);
    if (post.deletedAt) {
      return false;
    }

    return reanchorInterval(post);
  }

  @ActivityMethod()
  async getPostsList(orgId: string, postId: string) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return [];
      }
    }

    const getPosts = await this._postService.getPostsRecursively(
      postId,
      true,
      orgId
    );
    if (!getPosts || getPosts.length === 0 || getPosts[0].parentPostId) {
      return [];
    }

    // only the root drives the pre-publish sleep and the repeat schedule,
    // the rest are comments
    const [root, ...comments] = getPosts.map(slimPost);
    return [reanchorInterval(root), ...comments];
  }

  @ActivityMethod()
  async isCommentable(integration: Integration) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    return !!getIntegration.comment;
  }

  @ActivityMethod()
  async postComment(
    postId: string,
    lastPostId: string | undefined,
    integration: Integration,
    posts: Post[]
  ) {
    // kept only for in-flight postWorkflowV108 runs, which set a
    // heartbeatTimeout on this activity - removing the sender would kill
    // them. Under V109+ (no heartbeatTimeout) this is a no-op and can be
    // dropped once all V108 executions have drained
    return withHeartbeat(() =>
      this.handleDisconnect(integration, async (integration) => {
        const getIntegration = this._integrationManager.getSocialIntegration(
          integration.providerIdentifier
        );

        const newPosts = await this._postService.updateTags(
          integration.organizationId,
          posts
        );

        const mappedPosts = await Promise.all(
          (newPosts || []).map(async (p) => ({
            id: p.id,
            message: stripHtmlValidation(
              getIntegration.editor,
              p.content,
              true,
              false,
              !/<\/?[a-z][\s\S]*>/i.test(p.content),
              getIntegration.mentionFormat
            ),
            settings: JSON.parse(p.settings || '{}'),
            media: await this._postService.updateMedia(
              p.id,
              JSON.parse(p.image || '[]'),
              getIntegration?.convertToJPEG || false
            ),
          }))
        );
        const publish = () =>
          getIntegration.comment(
            integration.internalId,
            postId,
            lastPostId,
            integration.token,
            mappedPosts,
            integration
          );
        if (integration.providerIdentifier !== 'threads') return publish();
        const confirmed = await this.confirmedPublication(integration, posts);
        if (confirmed) return confirmed;
        return this.publishWithReconciliation(
          integration,
          posts,
          mappedPosts.map((post) => ({
            ...post,
            replyToId: lastPostId || postId,
          })),
          publish
        );
      })
    );
  }

  @ActivityMethod()
  async postSocial(integration: Integration, posts: Post[]) {
    return this.postSocialInternal(integration, posts, false);
  }

  // Used by postWorkflowV106 and up: providers that implement `postPending`
  // return a `pending` response the workflow resolves via checkPostStatus /
  // finalizePost. Older workflow versions keep calling `postSocial` and get
  // the old blocking behavior.
  @ActivityMethod()
  async postSocialPending(integration: Integration, posts: Post[]) {
    return this.postSocialInternal(integration, posts, true);
  }

  // A Disconnect error means the platform will keep rejecting this channel no
  // matter how many token refreshes (e.g. TikTok's daily active user cap):
  // mark the channel as needing a re-connect and notify the user, then rethrow
  // as BadBody so every workflow version - frozen once on main - treats it as
  // a terminal error without needing a new workflow.
  private async handleDisconnect<T>(
    integration: Integration,
    func: (integration: Integration) => Promise<T>
  ): Promise<T> {
    try {
      return await this.withThreadsToken(integration, func);
    } catch (err) {
      if (err instanceof Disconnect) {
        try {
          await this._integrationService.disconnectChannel(
            integration.organizationId,
            integration,
            err.message
          );
        } catch (e) {
          /**empty**/
        }

        throw new BadBody(
          integration.providerIdentifier,
          JSON.stringify({}),
          Buffer.from('{}'),
          err.message
        );
      }

      throw err;
    }
  }

  private async withThreadsToken<T>(
    integration: Integration,
    publish: (integration: Integration) => Promise<T>
  ): Promise<T> {
    if (integration.providerIdentifier !== 'threads') {
      return publish(integration);
    }

    // Workflows may carry a token captured days ago. Always use the persisted
    // credentials, including refreshes made by the cron or a previous activity.
    let current = await this._integrationService.getIntegrationById(
      integration.organizationId,
      integration.id
    );
    if (!current || current.deletedAt) {
      throw new BadBody(
        'threads',
        '{}',
        '{}',
        'Threads channel is unavailable'
      );
    }

    const failure = (message: string) =>
      new BadBody('threads', '{}', '{}', message);
    let refreshed = false;
    const refresh = async () => {
      const token = await this._refreshIntegrationService
        .refresh(current, 'Threads access token expired or expires soon')
        .catch(() => false as const);
      if (!token || !token.accessToken) {
        throw failure(
          'Threads token refresh failed. Please reconnect your Threads channel.'
        );
      }

      refreshed = true;
      current = {
        ...current,
        token: token.accessToken,
        refreshToken: token.refreshToken,
      };
    };

    // Threads stores a conservative 58-day lifetime. Refresh a day before
    // that deadline, well past the 24-hour minimum token age for refresh.
    if (
      current.tokenExpiration &&
      new Date(current.tokenExpiration).getTime() <=
        Date.now() + 24 * 60 * 60 * 1000
    ) {
      await refresh();
    }

    try {
      return await publish(current);
    } catch (err) {
      if (!(err instanceof RefreshToken)) {
        throw err;
      }
      // Only an explicit token rejection proves the mutation did not happen.
      // Never retry timeouts, transport errors or a successful publish's reads.
      if (!refreshed) {
        await refresh();
        try {
          return await publish(current);
        } catch (retryError) {
          if (!(retryError instanceof RefreshToken)) {
            throw retryError;
          }
        }
      }

      // A terminal failure prevents the workflow's generic refresh loop from
      // refreshing again after our single recovery attempt.
      throw failure(
        'Threads access token expired after refresh. Please reconnect your Threads channel.'
      );
    }
  }

  private async postSocialInternal(
    integration: Integration,
    posts: Post[],
    allowPending: boolean
  ) {
    // kept only for in-flight postWorkflowV108 runs, which set a
    // heartbeatTimeout on this activity - removing the sender would kill
    // them. Under V109+ (no heartbeatTimeout) this is a no-op and can be
    // dropped once all V108 executions have drained
    return withHeartbeat(() =>
      this.handleDisconnect(integration, (integration) =>
        this.postSocialBody(integration, posts, allowPending)
      )
    );
  }

  private async postSocialBody(
    integration: Integration,
    posts: Post[],
    allowPending: boolean
  ) {
    const confirmed = await this.confirmedPublication(integration, posts);
    if (confirmed) return confirmed;
    // Stage markers: whatever ran last is what a timed-out activity reports.
    // Providers that go through this.fetch overwrite these with the exact URL;
    // the ones on their own HTTP client (x, youtube, bluesky) are still
    // narrowed down to the step they hung on.
    setHeartbeatDetails('subscription lookup');
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        integration.organizationId
      );

      if (!subscription) {
        throw new Error('No active subscription found for this organization.');
      }
    }

    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    setHeartbeatDetails('update tags');
    const newPosts = await this._postService.updateTags(
      integration.organizationId,
      posts
    );

    setHeartbeatDetails('resolve media');
    const mappedPosts = await Promise.all(
      (newPosts || []).map(async (p) => ({
        id: p.id,
        message: stripHtmlValidation(
          getIntegration.editor,
          p.content,
          true,
          false,
          !/<\/?[a-z][\s\S]*>/i.test(p.content),
          getIntegration.mentionFormat,
          !!getIntegration.inlineImages?.(JSON.parse(p.settings || '{}'))
        ),
        settings: JSON.parse(p.settings || '{}'),
        media: await this._postService.updateMedia(
          p.id,
          JSON.parse(p.image || '[]'),
          getIntegration?.convertToJPEG || false
        ),
      }))
    );

    setHeartbeatDetails(`${integration.providerIdentifier}: publish`);
    const postNow = await this.publishWithReconciliation(
      integration,
      posts,
      mappedPosts,
      async () =>
        allowPending && getIntegration.postPending
          ? getIntegration.postPending(
              integration.internalId,
              integration.token,
              mappedPosts,
              integration
            )
          : getIntegration.post(
              integration.internalId,
              integration.token,
              mappedPosts,
              integration
            )
    );

    // The post is already published at this point: the streak is best-effort,
    // failing the activity here would retry it and publish again.
    setHeartbeatDetails(`${integration.providerIdentifier}: published, streak`);
    try {
      await this._temporalService.client
        .getRawClient()
        .workflow.start('streakWorkflowV2', {
          args: [{ organizationId: integration.organizationId }],
          workflowId: `streak_${integration.organizationId}`,
          taskQueue: 'main',
          // Keep a running streak, it checks for newer posts before it ends
          workflowIdConflictPolicy: 'USE_EXISTING',
          typedSearchAttributes: new TypedSearchAttributes([
            {
              key: organizationId,
              value: integration.organizationId,
            },
          ]),
        });
    } catch (err) {
      /**empty**/
    }

    return postNow;
  }

  private reconciliationEnabled(provider: SocialProvider, post: PostDetails) {
    return (
      !!provider.findRecentPublication && post.settings?.post_type !== 'story'
    );
  }

  private async reconcilePublications(
    integration: Integration,
    mappedPosts: (PostDetails & { replyToId?: string })[]
  ): Promise<PostResponse[] | undefined> {
    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    const recovered: PostResponse[] = [];
    for (const post of mappedPosts) {
      if (!this.reconciliationEnabled(provider, post)) continue;
      // Always read the persisted marker: workflow inputs predate the failure.
      const current = await this._postService.getPostById(
        post.id,
        integration.organizationId
      );
      const marker = JSON.parse(
        current?.settings || '{}'
      ).publishAttemptUncertainAt;
      if (!marker) continue;
      let found: PostResponse | undefined;
      try {
        const timestamp = new Date(marker).getTime();
        if (!Number.isFinite(timestamp))
          throw new Error('Invalid publication uncertainty timestamp');
        found = await provider.findRecentPublication(
          integration,
          integration.token,
          post,
          new Date(timestamp - 5 * 60 * 1000)
        );
      } catch (err) {
        // Even provider BadBody/auth errors must leave reconciliation retryable.
        // No create is safe until a read has established the previous outcome.
        throw new ApplicationFailure(
          'Recent publication lookup failed',
          'publication_lookup',
          false
        );
      }
      if (found) {
        await this._postService.updatePost(
          post.id,
          found.postId,
          found.releaseURL
        );
        recovered.push(found);
      }
      // Receipt first, marker second: a crash between writes is handled by the
      // persisted receipt guard on the next attempt.
      await this._postService.setPublishAttemptUncertain(
        post.id,
        integration.organizationId
      );
    }
    if (recovered.length) {
      if (recovered.length !== mappedPosts.length) {
        throw new BadBody(
          integration.providerIdentifier,
          '{}',
          '{}',
          'Part of this post is already published. Please check your account before posting again to avoid duplicates.'
        );
      }
      return recovered;
    }
  }

  private async publishAttempt<T>(
    integration: Integration,
    posts: PublicationPost[],
    publish: () => Promise<T>
  ): Promise<T> {
    const startedAt = new Date().toISOString();
    try {
      return await publish();
    } catch (err) {
      if (isTransientNetworkError(err) && !isBeforeConnectError(err)) {
        for (const post of posts) {
          await this._postService.setPublishAttemptUncertain(
            post.id,
            integration.organizationId,
            startedAt
          );
        }
      }
      throw err;
    }
  }

  private async publishWithReconciliation(
    integration: Integration,
    posts: PublicationPost[],
    mappedPosts: (PostDetails & { replyToId?: string })[],
    publish: () => Promise<PostResponse[]>
  ): Promise<PostResponse[]> {
    const recovered = await this.reconcilePublications(
      integration,
      mappedPosts
    );
    if (recovered) return recovered;
    const result = await this.publishAttempt(integration, posts, publish);
    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    return result?.map((response) => {
      const post = posts.find((post) => post.id === response.id);
      const mapped = mappedPosts.find((post) => post.id === response.id);
      // The create may run in a later activity. Preserve the original receipt
      // baseline so intentional repeat occurrences can still publish.
      return response.status === 'pending' &&
        post &&
        mapped &&
        this.reconciliationEnabled(provider, mapped)
        ? {
            ...response,
            pendingData: {
              ...response.pendingData,
              __publicationPost: this.publicationPost(post),
            },
          }
        : response;
    });
  }

  private publicationPost(post: PublicationPost) {
    const { id, intervalInDays, state, releaseId, releaseURL } = post;
    return { id, intervalInDays, state, releaseId, releaseURL };
  }

  private carryPublicationPost(
    result: PendingCheckResponse,
    post?: PublicationPost
  ) {
    return post && 'pendingData' in result
      ? {
          ...result,
          pendingData: { ...result.pendingData, __publicationPost: post },
        }
      : result;
  }

  private async pendingWithReconciliation(
    integration: Integration,
    pendingData: any,
    postId: string | undefined,
    run: (data: any) => Promise<PendingCheckResponse>,
    mutation = false
  ): Promise<PendingCheckResponse> {
    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    const id = pendingData?.__publicationPost?.id || postId;
    // Old in-flight histories may not carry a row identity. Their provider's
    // existing container-status/receipt recovery remains in effect.
    if (!id || !provider.findRecentPublication) return run(pendingData);
    const row = await this._postService.getPostById(
      id,
      integration.organizationId
    );
    if (!row) throw new Error('Publication post is unavailable');
    const settings = JSON.parse(row.settings || '{}');
    if (settings.post_type === 'story') return run(pendingData);
    const original: PublicationPost =
      pendingData.__publicationPost || this.publicationPost(row);
    const confirmed = await this.confirmedPublication(integration, [original]);
    if (confirmed)
      return {
        status: 'completed',
        postId: confirmed[0].postId,
        releaseURL: confirmed[0].releaseURL,
      };
    const post = {
      id,
      message: stripHtmlValidation(
        provider.editor,
        row.content,
        true,
        false,
        !/<\/?[a-z][\s\S]*>/i.test(row.content),
        provider.mentionFormat
      ),
      settings,
      // Reconciliation needs the count, not media uploads/conversion.
      media: JSON.parse(row.image || '[]'),
    };
    const recovered = await this.reconcilePublications(integration, [post]);
    if (recovered)
      return {
        status: 'completed',
        postId: recovered[0].postId,
        releaseURL: recovered[0].releaseURL,
      };
    // The workflow checks status before retrying a deferred create. LinkedIn's
    // interrupted-create guard can only be disarmed after a successful negative
    // lookup; a failed lookup above must leave the handshake untouched.
    const data =
      settings.publishAttemptUncertainAt &&
      integration.providerIdentifier === 'linkedin-page'
        ? { ...pendingData, attempting: false, confirmed: false }
        : pendingData;
    const result = mutation
      ? await this.publishAttempt(integration, [original], () => run(data))
      : await run(data);
    return this.carryPublicationPost(result, original);
  }

  private async confirmedPublication(
    integration: Integration,
    posts: PublicationPost[]
  ): Promise<PostResponse[] | undefined> {
    const results = [];
    let unconfirmed = false;
    for (const post of posts) {
      const current = await this._postService.getPostById(
        post.id,
        integration.organizationId
      );
      const hasId = current?.releaseId && current.releaseId !== 'missing';
      if (!hasId && !current?.releaseURL) {
        unconfirmed = true;
        continue;
      }
      // Repeat occurrences intentionally reuse the row and its previous ID.
      // Once a newer ID is persisted, a retry of that occurrence must stop.
      if (
        post.intervalInDays &&
        post.state === State.PUBLISHED &&
        post.releaseId === current.releaseId &&
        post.releaseURL === current.releaseURL
      ) {
        unconfirmed = true;
        continue;
      }
      if (JSON.parse(current.settings || '{}').publishAttemptUncertainAt) {
        await this._postService.setPublishAttemptUncertain(
          post.id,
          integration.organizationId
        );
      }
      results.push({
        id: post.id,
        postId: hasId ? current.releaseId : '',
        releaseURL: current.releaseURL || '',
        status: 'success' as const,
      });
    }
    if (results.length && unconfirmed) {
      throw new BadBody(
        integration.providerIdentifier,
        '{}',
        '{}',
        'Part of this post is already published. Please check your account before posting again to avoid duplicates.'
      );
    }
    return results.length ? results : undefined;
  }

  @ActivityMethod()
  async checkPostStatus(integration: Integration, pendingData: any) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    return this.handleDisconnect(integration, (integration) =>
      this.pendingWithReconciliation(
        integration,
        pendingData,
        undefined,
        (data) =>
          getIntegration.checkPostStatus(integration.token, data, integration)
      )
    );
  }

  @ActivityMethod()
  async finalizePost(integration: Integration, pendingData: any) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    return withHeartbeat(() =>
      this.handleDisconnect(integration, (integration) =>
        this.pendingWithReconciliation(
          integration,
          pendingData,
          undefined,
          (data) =>
            getIntegration.finalizePost(integration.token, data, integration),
          true
        )
      )
    );
  }

  private async storyFrameReceiptContext(
    integration: Integration,
    postId: string,
    publicationId: string
  ): Promise<StoryFrameReceiptContext> {
    const { receipts } = await this._postService.getStoryFrameReceipts(
      integration.organizationId,
      postId,
      publicationId
    );
    return {
      receipts,
      record: (receipt) =>
        this._postService.recordStoryFrameReceipt(
          integration.organizationId,
          postId,
          publicationId,
          receipt
        ),
    };
  }

  @ActivityMethod()
  async checkPostStatusWithReceipts(
    integration: Integration,
    pendingData: any,
    postId: string,
    publicationId: string
  ) {
    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    const context = await this.storyFrameReceiptContext(
      integration,
      postId,
      publicationId
    );
    return this.handleDisconnect(integration, (integration) =>
      this.pendingWithReconciliation(integration, pendingData, postId, (data) =>
        provider.checkPostStatusWithReceipts(
          integration.token,
          data,
          integration,
          context
        )
      )
    );
  }

  @ActivityMethod()
  async finalizePostWithReceipts(
    integration: Integration,
    pendingData: any,
    postId: string,
    publicationId: string
  ) {
    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    return withHeartbeat(async () => {
      const context = await this.storyFrameReceiptContext(
        integration,
        postId,
        publicationId
      );
      return this.handleDisconnect(integration, (integration) =>
        this.pendingWithReconciliation(
          integration,
          pendingData,
          postId,
          (data) =>
            provider.finalizePostWithReceipts(
              integration.token,
              data,
              integration,
              context
            ),
          true
        )
      );
    });
  }

  @ActivityMethod()
  async inAppNotification(
    orgId: string,
    subject: string,
    message: string,
    sendEmail = false,
    digest = false,
    type: NotificationType = 'success'
  ) {
    await this._notificationService.inAppNotification(
      orgId,
      subject,
      message,
      sendEmail,
      digest,
      type
    );
  }

  @ActivityMethod()
  async globalPlugs(integration: Integration) {
    return this._postService.checkPlugs(
      integration.organizationId,
      integration.providerIdentifier,
      integration.id
    );
  }

  @ActivityMethod()
  async changeState(id: string, state: State, err?: any, body?: any) {
    await this._postService.changeState(id, state, err, body);
  }

  @ActivityMethod()
  async internalPlugs(integration: Integration, settings: any) {
    return this._postService.checkInternalPlug(
      integration,
      integration.organizationId,
      integration.id,
      settings
    );
  }

  @ActivityMethod()
  async sendWebhooks(postId: string, orgId: string, integrationId: string) {
    // Webhooks are best-effort and run after the post already published, so a
    // failure here must not fail the workflow.
    try {
      const webhooks = (await this._webhookService.getWebhooks(orgId)).filter(
        (f) => {
          return (
            f.integrations.length === 0 ||
            f.integrations.some((i) => i.integration.id === integrationId)
          );
        }
      );

      if (webhooks.length === 0) {
        return;
      }

      const post = await this._postService.getPostByForWebhookId(
        postId,
        integrationId
      );
      await Promise.all(
        webhooks.map(async (webhook) => {
          try {
            // webhook.url is validated at save time, but DNS can change
            // between then and now - pin resolution like every other
            // user-influenced outbound request.
            await fetch(webhook.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(post),
              // @ts-ignore — undici option, not in lib.dom fetch types
              dispatcher: getSsrfSafeDispatcher(),
            });
          } catch (e) {
            /**empty**/
          }
        })
      );
    } catch (err) {
      /**empty**/
    }
  }
  @ActivityMethod()
  async processPlug(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
  }) {
    return this._integrationService.processPlugs(data);
  }

  @ActivityMethod()
  async processInternalPlug(data: {
    post: string;
    originalIntegration: string;
    integration: string;
    plugName: string;
    orgId: string;
    delay: number;
    information: any;
  }) {
    await this._integrationService.processInternalPlug(data);
  }

  @ActivityMethod()
  async refreshToken(
    integration: Integration
  ): Promise<false | AuthTokenDetails> {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    try {
      const refresh = await this._refreshIntegrationService.refresh(
        integration
      );
      if (!refresh) {
        return false;
      }

      if (getIntegration.refreshWait) {
        await timer(10000);
      }

      return refresh;
    } catch (err) {
      await this._refreshIntegrationService.setBetweenSteps(integration);
      return false;
    }
  }

  @ActivityMethod()
  async refreshTokenWithCause(
    integration: Integration,
    cause: string
  ): Promise<false | AuthTokenDetails> {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    try {
      const refresh = await this._refreshIntegrationService.refresh(
        integration,
        cause
      );
      if (!refresh) {
        return false;
      }

      if (getIntegration.refreshWait) {
        await timer(10000);
      }

      return refresh;
    } catch (err) {
      await this._refreshIntegrationService.setBetweenSteps(integration, cause);
      return false;
    }
  }
}
