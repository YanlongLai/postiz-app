// Only confirmed publication identifiers belong in this projection. Upload,
// scheduling and pending container identifiers are not publication receipts.
export interface ConfirmedStoryFrameReceipt {
  frameIndex: number; // Zero-based media order.
  platformId: string;
  confirmedAt: string;
  status: 'confirmed';
}

export interface StoryFrameReceiptDto extends ConfirmedStoryFrameReceipt {
  postId: string;
}

export interface StoryFrameReceiptsDto {
  postId: string;
  receipts: StoryFrameReceiptDto[];
}

export interface StoryFrameCapabilitiesDto {
  contractVersion: 'story-frame-receipts-v1';
  maxFrames: 3;
  perFrameReceipts: true;
}

export interface StoryFrameReceiptContext {
  receipts: ConfirmedStoryFrameReceipt[];
  // Awaited after EACH confirmed mutation, before another frame is published.
  record: (receipt: ConfirmedStoryFrameReceipt) => Promise<void>;
}
