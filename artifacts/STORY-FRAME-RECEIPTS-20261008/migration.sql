-- Generated offline by Prisma 6.5 migrate diff against b701236a.
-- Not applied. Additive only; no historical receipt backfill.
CREATE TYPE "StoryFrameReceiptStatus" AS ENUM ('confirmed');

CREATE TABLE "StoryFrameReceipt" (
    "postId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "frameIndex" INTEGER NOT NULL,
    "platformId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "status" "StoryFrameReceiptStatus" NOT NULL DEFAULT 'confirmed',
    CONSTRAINT "StoryFrameReceipt_pkey" PRIMARY KEY ("postId","publicationId","frameIndex")
);

ALTER TABLE "StoryFrameReceipt" ADD CONSTRAINT "StoryFrameReceipt_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
