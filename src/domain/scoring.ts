import type {
  CandidateEvidence,
  RunPreferences,
  ScoreBreakdown,
} from "./types";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export type QualificationResult = {
  accepted: boolean;
  confidence: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
};

const prohibitedTerms = [
  "handmade",
  "made-to-order",
  "made to order",
  "personalized",
  "permanent jewelry",
  "vintage",
  "costume",
  "raw gemstone",
  "engagement",
  "high-end",
  "high end",
  "diamond",
  "watch",
  "pendant",
  "moissanite",
  "cubic zirconia",
];

const moissaniteTerms = ["moissanite", "cubic zirconia"];

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("jewellery", "jewelry")
    .replace(/[‐‑‒–—-]/g, " ")
    .replace(/\s+/g, " ");
}

function includesTerm(value: string, terms: string[]): boolean {
  const normalized = normalize(value);
  return terms.some((term) => normalized.includes(term));
}

function zeroBreakdown(): ScoreBreakdown {
  return {
    productFit: 0,
    affordability: 0,
    inventory: 0,
    sellerPriority: 0,
    contactability: 0,
    presence: 0,
    unwantedPenalty: 0,
    confidence: 0,
  };
}

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isAcceptedCategory(value: string, preferences: RunPreferences): boolean {
  const normalized = normalize(value);
  return preferences.acceptedCategories.some((category) => {
    const accepted = normalize(category);
    const singular = accepted.endsWith("s") ? accepted.slice(0, -1) : accepted;
    return normalized.includes(accepted) || normalized.includes(singular);
  });
}

function isAcceptedMetal(value: string, preferences: RunPreferences): boolean {
  const normalized = normalize(value);
  const directMatch = preferences.acceptedMetals.some((metal) => {
    const accepted = normalize(metal);
    return normalized.includes(accepted);
  });
  if (directMatch) return true;

  const synonymFamilies = [
    ["0.925 sterling silver", "925 sterling silver", ".925 sterling silver", "925 silver", ".925 silver", "sterling silver"],
    ["10k gold", "10kt gold", "10 karat gold", "10 carat gold"],
    ["14k gold", "14kt gold", "14 karat gold", "14 carat gold"],
    ["gold filled", "goldfill"],
    ["gold plated", "gold plate", "vermeil"],
  ];

  return synonymFamilies.some((family) => {
    const familyEnabled = preferences.acceptedMetals.some((metal) =>
      family.some((term) => normalize(metal).includes(normalize(term)) || normalize(term).includes(normalize(metal))),
    );
    return familyEnabled && family.some((term) => normalized.includes(normalize(term)));
  });
}

function inventoryIsMeaningful(
  matchingListings: CandidateEvidence["catalogSamples"],
  allListings: CandidateEvidence["catalogSamples"],
  preferences: RunPreferences,
): boolean {
  if (allListings.length === 0) return false;

  return (
    (matchingListings.length / allListings.length) * 100 >= preferences.unwantedMeaningfulPercent ||
    matchingListings.length >= preferences.unwantedMeaningfulCount
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function unwantedCategoryGroups(candidate: CandidateEvidence): CandidateEvidence["catalogSamples"][] {
  const groups = new Map<string, CandidateEvidence["catalogSamples"]>();

  for (const sample of candidate.catalogSamples) {
    if (!sample.category || !includesTerm(sample.category, prohibitedTerms)) continue;
    const category = normalize(sample.category);
    groups.set(category, [...(groups.get(category) ?? []), sample]);
  }

  return [...groups.values()];
}

function hardGateReasons(candidate: CandidateEvidence, preferences: RunPreferences): string[] {
  const reasons: string[] = [];

  if (!candidate.location.verified) {
    reasons.push("Canadian physical location is not verified");
  }

  if (!candidate.officialWebsite) {
    reasons.push("Official website is missing");
  }

  const mainSegment = candidate.mainProductSegment?.value;
  if (mainSegment && includesTerm(mainSegment, prohibitedTerms)) {
    reasons.push("Main product segment is prohibited");
  } else if (!mainSegment || !isAcceptedCategory(mainSegment, preferences)) {
    reasons.push("Main product segment is not a qualifying jewelry category");
  }

  if (!candidate.acceptedMetals.some((metal) => isAcceptedMetal(metal.value, preferences))) {
    reasons.push("No accepted jewelry material is verified");
  }

  const contacts = candidate.contacts;
  if (!contacts.personalEmail && !contacts.genericEmail && !contacts.phoneNumber) {
    reasons.push("Public email address or phone number is required");
  }

  for (const unwantedListings of unwantedCategoryGroups(candidate)) {
    if (!inventoryIsMeaningful(unwantedListings, candidate.catalogSamples, preferences)) continue;

    const price = median(
      unwantedListings.flatMap((sample) => (sample.priceCad === null ? [] : [sample.priceCad])),
    );
    const category = unwantedListings[0]?.category ?? "";
    const rejectionPrice = includesTerm(category, moissaniteTerms)
      ? preferences.unwantedMoissaniteRejectAbove
      : preferences.unwantedGeneralRejectAbove;

    if (price !== null && price > rejectionPrice) {
      reasons.push("Meaningful unwanted inventory exceeds the rejection price");
      break;
    }
  }

  return reasons;
}

export function validatePreferences(preferences: RunPreferences): ValidationResult {
  const errors: string[] = [];
  const weights = Object.values(preferences.weights);
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);

  if (!weights.every((weight) => Number.isFinite(weight) && weight > 0) || weightTotal !== 100) {
    errors.push("Positive scoring weights must total 100");
  }

  if (!Number.isFinite(preferences.threshold) || preferences.threshold < 0 || preferences.threshold > 100) {
    errors.push("Qualification threshold must be between 0 and 100");
  }

  if (
    !Number.isInteger(preferences.unwantedMeaningfulCount) ||
    preferences.unwantedMeaningfulCount < 1 ||
    preferences.unwantedMeaningfulPercent < 0 ||
    preferences.unwantedMeaningfulPercent > 100 ||
    preferences.unwantedLowMax > preferences.unwantedMediumMax ||
    preferences.unwantedMediumMax > preferences.unwantedGeneralRejectAbove ||
    preferences.unwantedMediumMax > preferences.unwantedMoissaniteRejectAbove
  ) {
    errors.push("Unwanted inventory preferences are invalid");
  }

  return { valid: errors.length === 0, errors };
}

function qualifyingListings(
  candidate: CandidateEvidence,
  preferences: RunPreferences,
): CandidateEvidence["catalogSamples"] {
  return candidate.catalogSamples.slice(0, 20).filter(
    (sample) =>
      sample.category !== null &&
      sample.metal !== null &&
      isAcceptedCategory(sample.category, preferences) &&
      isAcceptedMetal(sample.metal, preferences),
  );
}

function affordabilityScore(
  listings: CandidateEvidence["catalogSamples"],
  preferences: RunPreferences,
): number {
  const prices = listings.flatMap((sample) => (sample.priceCad === null ? [] : [sample.priceCad]));
  if (prices.length === 0) return 0;

  const tiers = [
    { targetShare: 0.5, matches: (price: number) => price >= 10 && price <= 25 },
    { targetShare: 0.3, matches: (price: number) => price >= 26 && price <= 50 },
    { targetShare: 0.15, matches: (price: number) => price >= 51 && price <= 70 },
    { targetShare: 0.05, matches: (price: number) => price >= 71 && price <= 100 },
  ];
  const multiplier = tiers.reduce((total, tier) => {
    const proportion = prices.filter(tier.matches).length / prices.length;
    return total + tier.targetShare * Math.min(proportion / tier.targetShare, 1);
  }, 0);

  return preferences.weights.affordability * multiplier;
}

function inventoryScore(
  listings: CandidateEvidence["catalogSamples"],
  candidate: CandidateEvidence,
  preferences: RunPreferences,
): number {
  const availableCount = listings.filter((sample) => sample.available !== false).length;
  const depth = Math.min(availableCount / preferences.unwantedMeaningfulCount, 1);
  const readyToShip = candidate.readyToShip?.value === true ? 1 : 0;
  return preferences.weights.inventory * ((depth + readyToShip) / 2);
}

function sellerPriorityScore(candidate: CandidateEvidence, preferences: RunPreferences): number {
  const multipliers = {
    manufacturer: 1,
    wholesaler: 0.75,
    retailer: 0.5,
    brand_boutique: 0.25,
    marketplace_social: 0,
  } as const;

  return candidate.sellerType ? preferences.weights.sellerPriority * multipliers[candidate.sellerType.value] : 0;
}

function contactabilityScore(candidate: CandidateEvidence, preferences: RunPreferences): number {
  const { contacts } = candidate;
  const namedRelevantPerson = Boolean(contacts.personName && contacts.personRole);

  if (contacts.personalEmail && namedRelevantPerson) {
    return preferences.weights.contactability * (contacts.personalEmailStatus === "published" ? 1 : 0.7);
  }
  if (contacts.genericEmail) return preferences.weights.contactability * 0.5;
  if (contacts.phoneNumber) return preferences.weights.contactability * 0.4;
  return 0;
}

function presenceScore(candidate: CandidateEvidence, preferences: RunPreferences): number {
  const { socials } = candidate;
  const socialActivity = Boolean(
    socials.linkedinUrl ||
      socials.instagramUrl ||
      socials.facebookUrl ||
      socials.etsyUrl ||
      socials.amazonUrl ||
      socials.ebayUrl ||
      socials.poshmarkUrl ||
      socials.depopUrl ||
      socials.pinterestUrl ||
      socials.tiktokUrl ||
      socials.otherUrls.length > 0,
  );
  const signals = Number(socialActivity) + Number(candidate.tradeShowParticipation?.value === true);
  return preferences.weights.presence * (signals / 2);
}

function unwantedPenalty(candidate: CandidateEvidence, preferences: RunPreferences): number {
  let penalty = 0;

  for (const unwantedListings of unwantedCategoryGroups(candidate)) {
    if (!inventoryIsMeaningful(unwantedListings, candidate.catalogSamples, preferences)) continue;
    const price = median(
      unwantedListings.flatMap((sample) => (sample.priceCad === null ? [] : [sample.priceCad])),
    );
    if (price === null || price <= preferences.unwantedLowMax) continue;
    if (price <= preferences.unwantedMediumMax) {
      penalty = Math.max(penalty, 5);
    } else {
      penalty = Math.max(penalty, 10);
    }
  }

  return penalty;
}

export function scoreCandidate(
  candidate: CandidateEvidence,
  preferences: RunPreferences,
): QualificationResult {
  const validation = validatePreferences(preferences);
  if (!validation.valid) {
    return {
      accepted: false,
      confidence: 0,
      breakdown: zeroBreakdown(),
      reasons: validation.errors,
    };
  }

  const reasons = hardGateReasons(candidate, preferences);
  if (reasons.length > 0) {
    return {
      accepted: false,
      confidence: 0,
      breakdown: zeroBreakdown(),
      reasons,
    };
  }

  const listings = qualifyingListings(candidate, preferences);
  const breakdown: ScoreBreakdown = {
    productFit: roundToTwo(preferences.weights.productFit),
    affordability: roundToTwo(affordabilityScore(listings, preferences)),
    inventory: roundToTwo(inventoryScore(listings, candidate, preferences)),
    sellerPriority: roundToTwo(sellerPriorityScore(candidate, preferences)),
    contactability: roundToTwo(contactabilityScore(candidate, preferences)),
    presence: roundToTwo(presenceScore(candidate, preferences)),
    unwantedPenalty: roundToTwo(unwantedPenalty(candidate, preferences)),
    confidence: 0,
  };
  const confidence = Math.round(
    Math.max(
      0,
      breakdown.productFit +
        breakdown.affordability +
        breakdown.inventory +
        breakdown.sellerPriority +
        breakdown.contactability +
        breakdown.presence -
        breakdown.unwantedPenalty,
    ),
  );
  breakdown.confidence = confidence;
  const accepted = confidence >= preferences.threshold;

  return {
    accepted,
    confidence,
    breakdown,
    reasons: accepted ? [] : ["Confidence score is below the qualification threshold"],
  };
}
