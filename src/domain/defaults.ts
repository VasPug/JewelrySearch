import type { RunPreferences, ScoreWeights } from "./types";

const defaultWeights: ScoreWeights = Object.freeze({
  productFit: 30,
  affordability: 20,
  inventory: 18,
  sellerPriority: 12,
  contactability: 12,
  presence: 8,
}) as ScoreWeights;

const defaultMetals: string[] = Object.freeze([
  "0.925 sterling silver",
  "10K gold",
  "14K gold",
  "gold-filled",
  "gold-plated",
]) as string[];

const defaultCategories: string[] = Object.freeze([
  "jewelry",
  "chains",
  "bracelets",
  "earrings",
  "rings",
  "anklets",
]) as string[];

export const DEFAULT_PREFERENCES: Readonly<RunPreferences> = Object.freeze({
  threshold: 75,
  targetLeads: 100,
  maxCandidates: 600,
  maxConcurrentResearch: 3,
  weights: defaultWeights,
  acceptedMetals: defaultMetals,
  acceptedCategories: defaultCategories,
  unwantedMeaningfulPercent: 10,
  unwantedMeaningfulCount: 5,
  unwantedLowMax: 30,
  unwantedMediumMax: 60,
  unwantedGeneralRejectAbove: 70,
  unwantedMoissaniteRejectAbove: 60,
});
