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
]) as string[];

const defaultCategories: string[] = Object.freeze([
  "chains",
  "Cuban chains",
  "paperclip chains",
  "regular chains",
]) as string[];

const defaultAvoidTerms: string[] = Object.freeze([
  "diamond",
  "pendant",
  "watch",
  "vintage",
  "raw gemstone",
  "handmade",
  "handcrafted",
  "made to order",
  "personalized",
  "engagement",
]) as string[];

export const DEFAULT_PREFERENCES: Readonly<RunPreferences> = Object.freeze({
  threshold: 41,
  targetLeads: 5,
  maxCandidates: 20,
  maxConcurrentResearch: 1,
  weights: defaultWeights,
  acceptedMetals: defaultMetals,
  acceptedCategories: defaultCategories,
  avoidTerms: defaultAvoidTerms,
  unwantedMeaningfulPercent: 10,
  unwantedMeaningfulCount: 5,
  unwantedLowMax: 30,
  unwantedMediumMax: 60,
  unwantedGeneralRejectAbove: 70,
  unwantedMoissaniteRejectAbove: 60,
});
