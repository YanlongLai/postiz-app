'use client';

// Shared between the TikTok settings panel and the composer footer, so the
// footer can show the declaration TikTok's Content Sharing Guidelines require
// right before the publish button, with the wording that matches the
// commercial-content choices made in the panel.
import { create } from 'zustand';

interface TikTokComplianceState {
  brandedContent: boolean;
  setBrandedContent: (value: boolean) => void;
}

export const useTikTokCompliance = create<TikTokComplianceState>((set) => ({
  brandedContent: false,
  setBrandedContent: (brandedContent) => set({ brandedContent }),
}));
