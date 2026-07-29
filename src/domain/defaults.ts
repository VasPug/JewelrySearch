import type { RunPreferences } from "./types";

export const DEFAULT_PREFERENCES: Readonly<RunPreferences> = {
  threshold: 75,
  targetLeads: 100,
  maxCandidates: 600,
  maxConcurrentResearch: 3,
  weights: {
    productFit: 30,
    affordability: 20,
    inventory: 18,
    sellerPriority: 12,
    contactability: 12,
    presence: 8,
  },
  acceptedMetals: [
    "0.925 sterling silver",
    "10K gold",
    "14K gold",
    "gold-filled",
    "gold-plated",
  ],
  acceptedCategories: ["chains", "bracelets", "earrings", "rings", "anklets"],
  unwantedMeaningfulPercent: 10,
  unwantedMeaningfulCount: 5,
  unwantedLowMax: 30,
  unwantedMediumMax: 60,
  unwantedGeneralRejectAbove: 70,
  unwantedMoissaniteRejectAbove: 60,
};
