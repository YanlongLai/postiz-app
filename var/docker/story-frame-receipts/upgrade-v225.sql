-- DropForeignKey
ALTER TABLE "Comments" DROP CONSTRAINT "Comments_userId_fkey";

-- DropIndex
DROP INDEX "idx_experiment_results_exp_item";

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "processingError" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ready';

-- AlterTable
ALTER TABLE "Comments" ADD COLUMN     "anchorEnd" INTEGER,
ADD COLUMN     "anchorQuote" TEXT,
ADD COLUMN     "anchorStart" INTEGER,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "mastra_ai_spans" ADD COLUMN     "entityVersionId" TEXT,
ADD COLUMN     "parentEntityVersionId" TEXT,
ADD COLUMN     "rootEntityVersionId" TEXT;

-- AlterTable
ALTER TABLE "mastra_scorers" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "datasetId" TEXT,
ADD COLUMN     "datasetItemId" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "mastra_agent_versions" ADD COLUMN     "browser" JSONB,
ADD COLUMN     "durable" JSONB,
ADD COLUMN     "toolProviders" JSONB;

-- AlterTable
ALTER TABLE "mastra_agents" ADD COLUMN     "favoriteCount" INTEGER,
ADD COLUMN     "visibility" TEXT;

-- AlterTable
ALTER TABLE "mastra_dataset_items" ADD COLUMN     "expectedTrajectory" JSONB,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "scorerIds" JSONB,
ADD COLUMN     "toolMocks" JSONB,
ADD COLUMN     "unmockedToolPolicy" TEXT;

-- AlterTable
ALTER TABLE "mastra_datasets" ADD COLUMN     "candidateId" TEXT,
ADD COLUMN     "candidateKey" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "mastra_experiment_results" ADD COLUMN     "attempt" INTEGER,
ADD COLUMN     "comment" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "toolMockReport" JSONB;

-- AlterTable
ALTER TABLE "mastra_experiments" ADD COLUMN     "comparisonId" TEXT,
ADD COLUMN     "experimentSetId" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "provenance" JSONB,
ADD COLUMN     "runnerAttestation" JSONB,
ADD COLUMN     "scorerIds" JSONB,
ADD COLUMN     "trialIndex" INTEGER,
ADD COLUMN     "variantId" TEXT;

-- AlterTable
ALTER TABLE "mastra_scorer_definitions" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "mastra_skill_versions" ADD COLUMN     "files" JSONB;

-- AlterTable
ALTER TABLE "mastra_skills" ADD COLUMN     "favoriteCount" INTEGER,
ADD COLUMN     "visibility" TEXT;

-- CreateTable
CREATE TABLE "Clipping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'analysing',
    "error" TEXT,
    "title" TEXT,
    "thumbnail" TEXT,
    "duration" INTEGER,
    "maxClips" INTEGER NOT NULL DEFAULT 5,
    "fit" TEXT NOT NULL DEFAULT 'blur',
    "integrations" TEXT NOT NULL,
    "creditsId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clipping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClippingClip" (
    "id" TEXT NOT NULL,
    "clippingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "start" DOUBLE PRECISION NOT NULL,
    "end" DOUBLE PRECISION NOT NULL,
    "trimStart" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "mediaId" TEXT,
    "path" TEXT,
    "thumbnail" TEXT,
    "draftedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClippingClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastra_background_tasks" (
    "id" TEXT NOT NULL,
    "tool_call_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "resource_id" TEXT,
    "status" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "result" JSONB,
    "error" JSONB,
    "suspend_payload" JSONB,
    "retry_count" INTEGER NOT NULL,
    "max_retries" INTEGER NOT NULL,
    "timeout_ms" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "startedAt" TIMESTAMP(6),
    "suspendedAt" TIMESTAMP(6),
    "completedAt" TIMESTAMP(6),
    "createdAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "startedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "suspendedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "completedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastra_background_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastra_channel_config" (
    "platform" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "updatedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastra_channel_config_pkey" PRIMARY KEY ("platform")
);

-- CreateTable
CREATE TABLE "mastra_channel_installations" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "webhookId" TEXT,
    "data" JSONB NOT NULL,
    "configHash" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "createdAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastra_channel_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastra_favorites" (
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "createdAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastra_favorites_pkey" PRIMARY KEY ("userId","entityType","entityId")
);

-- CreateTable
CREATE TABLE "mastra_knowledge_activity" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "sourceThreadId" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "createdAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastra_knowledge_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastra_knowledge_cursors" (
    "sourceThreadId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "lastKnowledgeId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "updatedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastra_knowledge_cursors_pkey" PRIMARY KEY ("sourceThreadId","agent")
);

-- CreateTable
CREATE TABLE "mastra_knowledge_mentions" (
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,

    CONSTRAINT "mastra_knowledge_mentions_pkey" PRIMARY KEY ("sourceType","sourceId","recordId")
);

-- CreateTable
CREATE TABLE "mastra_knowledge_nodes" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "kind" TEXT,
    "content" TEXT,
    "description" TEXT,
    "scope" JSONB NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "mergedInto" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "createdAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastra_knowledge_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastra_knowledge_records" (
    "id" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "sourceThreadId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(6) NOT NULL,
    "when" TIMESTAMP(6),
    "maxScope" TEXT,
    "metadata" JSONB,
    "deletedAt" TIMESTAMP(6),
    "deletedBy" TEXT,
    "capturedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "whenZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "deletedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastra_knowledge_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastra_knowledge_semantic_outbox" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "availableAt" TIMESTAMP(6) NOT NULL,
    "claimedAt" TIMESTAMP(6),
    "claimedBy" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "completedAt" TIMESTAMP(6),
    "availableAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "claimedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "createdAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "completedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastra_knowledge_semantic_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastra_notifications" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "resourceId" TEXT,
    "agentId" TEXT,
    "sourceId" TEXT,
    "dedupeKey" TEXT,
    "coalesceKey" TEXT,
    "coalescedCount" INTEGER NOT NULL,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "deliveredAt" TIMESTAMP(6),
    "seenAt" TIMESTAMP(6),
    "dismissedAt" TIMESTAMP(6),
    "archivedAt" TIMESTAMP(6),
    "discardedAt" TIMESTAMP(6),
    "deliverAt" TIMESTAMP(6),
    "summaryAt" TIMESTAMP(6),
    "deliveryReason" TEXT,
    "deliveryAttempts" INTEGER NOT NULL,
    "lastDeliveryAttemptAt" TIMESTAMP(6),
    "lastDeliveryError" TEXT,
    "deliveredSignalId" TEXT,
    "summarySignalId" TEXT,
    "metadata" JSONB,
    "createdAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "deliveredAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "seenAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "dismissedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "archivedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "discardedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "deliverAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "summaryAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "lastDeliveryAttemptAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "mastra_schedule_triggers" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "run_id" TEXT,
    "scheduled_fire_at" BIGINT NOT NULL,
    "actual_fire_at" BIGINT NOT NULL,
    "outcome" TEXT NOT NULL,
    "error" TEXT,
    "trigger_kind" TEXT NOT NULL,
    "parent_trigger_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "mastra_schedule_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastra_schedules" (
    "id" TEXT NOT NULL,
    "target" JSONB NOT NULL,
    "cron" TEXT NOT NULL,
    "timezone" TEXT,
    "status" TEXT NOT NULL,
    "next_fire_at" BIGINT NOT NULL,
    "last_fire_at" BIGINT,
    "last_run_id" TEXT,
    "created_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL,
    "metadata" JSONB,
    "owner_type" TEXT,
    "owner_id" TEXT,

    CONSTRAINT "mastra_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastra_thread_state" (
    "threadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "createdAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastra_thread_state_pkey" PRIMARY KEY ("threadId","type")
);

-- CreateTable
CREATE TABLE "mastra_tool_provider_connections" (
    "authorId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "toolkit" TEXT NOT NULL,
    "label" TEXT,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "createdAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastra_tool_provider_connections_pkey" PRIMARY KEY ("authorId","providerId","connectionId")
);

-- CreateTable
CREATE TABLE "mastra_workflow_definitions" (
    "id" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "stateSchema" JSONB,
    "requestContextSchema" JSONB,
    "graph" JSONB NOT NULL,
    "schedule" JSONB,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "createdAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAtZ" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastra_workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthSelfHostedAuthorization" (
    "id" TEXT NOT NULL,
    "oauthAppId" TEXT NOT NULL,
    "mcpUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "email" TEXT,
    "accessToken" TEXT,
    "authorizationCode" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeChallenge" TEXT,
    "codeChallengeMethod" TEXT,
    "redirectUri" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthSelfHostedAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Clipping_organizationId_idx" ON "Clipping"("organizationId");

-- CreateIndex
CREATE INDEX "Clipping_deletedAt_idx" ON "Clipping"("deletedAt");

-- CreateIndex
CREATE INDEX "ClippingClip_clippingId_idx" ON "ClippingClip"("clippingId");

-- CreateIndex
CREATE INDEX "mastra_bg_tasks_agent_status_idx" ON "mastra_background_tasks"("agent_id", "status");

-- CreateIndex
CREATE INDEX "mastra_bg_tasks_status_created_at_idx" ON "mastra_background_tasks"("status", "createdAt");

-- CreateIndex
CREATE INDEX "mastra_bg_tasks_thread_idx" ON "mastra_background_tasks"("thread_id", "createdAt");

-- CreateIndex
CREATE INDEX "mastra_bg_tasks_tool_call_idx" ON "mastra_background_tasks"("tool_call_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_channel_installations_webhook" ON "mastra_channel_installations"("webhookId");

-- CreateIndex
CREATE INDEX "idx_channel_installations_platform_agent" ON "mastra_channel_installations"("platform", "agentId");

-- CreateIndex
CREATE INDEX "idx_favorites_entity" ON "mastra_favorites"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "idx_knowledge_activity_latest" ON "mastra_knowledge_activity"("id" DESC);

-- CreateIndex
CREATE INDEX "idx_knowledge_mentions_record" ON "mastra_knowledge_mentions"("recordId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "idx_knowledge_nodes_scope" ON "mastra_knowledge_nodes"("scopeKey", "type");

-- CreateIndex
CREATE UNIQUE INDEX "idx_knowledge_nodes_identity" ON "mastra_knowledge_nodes"("type", "scopeKey", "canonicalName");

-- CreateIndex
CREATE INDEX "idx_knowledge_records_node_latest" ON "mastra_knowledge_records"("node", "id" DESC);

-- CreateIndex
CREATE INDEX "idx_knowledge_records_thread_latest" ON "mastra_knowledge_records"("sourceThreadId", "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "idx_knowledge_outbox_idempotency" ON "mastra_knowledge_semantic_outbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "idx_knowledge_outbox_claim" ON "mastra_knowledge_semantic_outbox"("status", "availableAt", "createdAt");

-- CreateIndex
CREATE INDEX "idx_notifications_coalescing" ON "mastra_notifications"("threadId", "source", "kind", "status", "agentId", "resourceId", "dedupeKey", "coalesceKey");

-- CreateIndex
CREATE INDEX "idx_notifications_due" ON "mastra_notifications"("status", "deliverAt", "summaryAt");

-- CreateIndex
CREATE INDEX "idx_notifications_thread_status_updated" ON "mastra_notifications"("threadId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "idx_mastra_schedule_triggers_schedule_fire" ON "mastra_schedule_triggers"("schedule_id", "actual_fire_at" DESC);

-- CreateIndex
CREATE INDEX "idx_mastra_schedules_status_next_fire" ON "mastra_schedules"("status", "next_fire_at");

-- CreateIndex
CREATE INDEX "idx_tool_provider_connections_author" ON "mastra_tool_provider_connections"("authorId", "providerId", "toolkit");

-- CreateIndex
CREATE INDEX "idx_workflow_definitions_status" ON "mastra_workflow_definitions"("status");

-- CreateIndex
CREATE INDEX "OAuthSelfHostedAuthorization_accessToken_idx" ON "OAuthSelfHostedAuthorization"("accessToken");

-- CreateIndex
CREATE INDEX "OAuthSelfHostedAuthorization_authorizationCode_idx" ON "OAuthSelfHostedAuthorization"("authorizationCode");

-- CreateIndex
CREATE INDEX "OAuthSelfHostedAuthorization_oauthAppId_idx" ON "OAuthSelfHostedAuthorization"("oauthAppId");

-- CreateIndex
CREATE INDEX "UserOrganization_organizationId_idx" ON "UserOrganization"("organizationId");

-- CreateIndex
CREATE INDEX "Comments_parentId_idx" ON "Comments"("parentId");

-- CreateIndex
CREATE INDEX "Comments_resolvedAt_idx" ON "Comments"("resolvedAt");

-- CreateIndex
CREATE INDEX "mastra_workflow_snapshot_name_createdat_idx" ON "mastra_workflow_snapshot"("workflow_name", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_dataset_items_external_id_history" ON "mastra_dataset_items"("datasetId", "externalId", "datasetVersion");

-- CreateIndex
CREATE INDEX "idx_dataset_items_org_project" ON "mastra_dataset_items"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "idx_datasets_candidate" ON "mastra_datasets"("candidateKey", "candidateId");

-- CreateIndex
CREATE INDEX "idx_datasets_org_project" ON "mastra_datasets"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "idx_experiment_results_org_project" ON "mastra_experiment_results"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "idx_experiment_results_tags_gin" ON "mastra_experiment_results" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "idx_experiment_results_exp_item_attempt" ON "mastra_experiment_results"("experimentId", "itemId", "attempt");

-- CreateIndex
CREATE INDEX "idx_experiments_grouping" ON "mastra_experiments"("experimentSetId", "comparisonId", "variantId", "trialIndex");

-- CreateIndex
CREATE INDEX "idx_experiments_org_project" ON "mastra_experiments"("organizationId", "projectId");

-- AddForeignKey
ALTER TABLE "Clipping" ADD CONSTRAINT "Clipping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClippingClip" ADD CONSTRAINT "ClippingClip_clippingId_fkey" FOREIGN KEY ("clippingId") REFERENCES "Clipping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comments" ADD CONSTRAINT "Comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comments" ADD CONSTRAINT "Comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthSelfHostedAuthorization" ADD CONSTRAINT "OAuthSelfHostedAuthorization_oauthAppId_fkey" FOREIGN KEY ("oauthAppId") REFERENCES "OAuthApp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
