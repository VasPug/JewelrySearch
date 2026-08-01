export type ScoreWeights = {
  productFit: number;
  affordability: number;
  inventory: number;
  sellerPriority: number;
  contactability: number;
  presence: number;
};

export type RunPreferences = {
  threshold: number;
  targetLeads: number;
  maxCandidates: number;
  maxConcurrentResearch: number;
  weights: ScoreWeights;
  acceptedMetals: string[];
  acceptedCategories: string[];
  avoidTerms: string[];
  unwantedMeaningfulPercent: number;
  unwantedMeaningfulCount: number;
  unwantedLowMax: number;
  unwantedMediumMax: number;
  unwantedGeneralRejectAbove: number;
  unwantedMoissaniteRejectAbove: number;
};

/** A research fact tied to the evidence that supports it. */
export type EvidenceValue<T> = {
  value: T;
  sourceUrl: string;
  confidence: number;
};

export type SellerType =
  | "manufacturer"
  | "wholesaler"
  | "retailer"
  | "brand_boutique"
  | "marketplace_social";

/** A search result that is eligible for structured company research. */
export type DiscoveryCandidate = {
  id: string;
  companyName: string;
  websiteUrl: string | null;
  discoverySource: string;
};

export type CanadianLocationEvidence = {
  verified: boolean;
  address: EvidenceValue<string> | null;
  verificationMethod: "official_website" | "independent_sources" | null;
  supportingSources: EvidenceValue<string>[];
};

export type CatalogListingSample = {
  title: string;
  productUrl: string;
  category: string | null;
  metal: string | null;
  priceCad: number | null;
  available: boolean | null;
  madeToOrder: boolean | null;
  personalized: boolean | null;
  sourceUrl: string;
  confidence: number;
};

export type ContactEvidence = {
  personName: EvidenceValue<string> | null;
  personRole: EvidenceValue<string> | null;
  phoneNumber: EvidenceValue<string> | null;
  genericEmail: EvidenceValue<string> | null;
  personalEmail: EvidenceValue<string> | null;
  personalEmailStatus: "published" | "inferred" | null;
};

export type SocialProfiles = {
  linkedinUrl: EvidenceValue<string> | null;
  instagramUrl: EvidenceValue<string> | null;
  instagramFollowers: EvidenceValue<number> | null;
  facebookUrl: EvidenceValue<string> | null;
  etsyUrl: EvidenceValue<string> | null;
  amazonUrl: EvidenceValue<string> | null;
  ebayUrl: EvidenceValue<string> | null;
  poshmarkUrl: EvidenceValue<string> | null;
  depopUrl: EvidenceValue<string> | null;
  pinterestUrl: EvidenceValue<string> | null;
  tiktokUrl: EvidenceValue<string> | null;
  otherUrls: EvidenceValue<string>[];
};

export type CandidateEvidence = {
  id: string;
  companyName: EvidenceValue<string>;
  officialWebsite: EvidenceValue<string> | null;
  location: CanadianLocationEvidence;
  sellerType: EvidenceValue<SellerType> | null;
  mainProductSegment: EvidenceValue<string> | null;
  acceptedMetals: EvidenceValue<string>[];
  catalogSamples: CatalogListingSample[];
  readyToShip: EvidenceValue<boolean> | null;
  contacts: ContactEvidence;
  socials: SocialProfiles;
  tradeShowParticipation: EvidenceValue<boolean> | null;
  discoverySource: string;
  sourceUrls: string[];
};

export type RejectionReason = string;

export type ScoreBreakdown = {
  productFit: number;
  affordability: number;
  inventory: number;
  sellerPriority: number;
  contactability: number;
  presence: number;
  unwantedPenalty: number;
  confidence: number;
};

export type QualifiedLead = {
  personName: string;
  personRole: string;
  companyName: string;
  phoneNumber: string;
  genericEmail: string;
  personalEmail: string;
  personalEmailStatus: "published" | "inferred" | "";
  personalEmailConfidence: number | "";
  countryCode: "CA";
  recordType: "outbound_seller";
  leadStatus: "unqualified";
  leadSource: string;
  sellerType: SellerType | "";
  mainProductSegment: string;
  pricingTier: string;
  websiteUrl: string;
  linkedinUrl: string;
  instagramUrl: string;
  instagramFollowers: string;
  facebookUrl: string;
  etsyUrl: string;
  amazonUrl: string;
  ebayUrl: string;
  poshmarkUrl: string;
  depopUrl: string;
  pinterestUrl: string;
  tiktokUrl: string;
  otherSocialUrls: string;
  description: string;
  confidenceScore: number;
  scoreBreakdown: ScoreBreakdown;
  evidenceUrls: string[];
  dateResearched: string;
};

export type RunStage =
  | "queued"
  | "discovering"
  | "verifying"
  | "researching"
  | "scoring"
  | "export-ready"
  | "exhausted"
  | "qualifying"
  | "deduplicating"
  | "exporting"
  | "completed"
  | "cancelled"
  | "failed";

export type RunOutcome =
  | "target_reached"
  | "candidate_budget_reached"
  | "search_exhausted"
  | "partial"
  | "completed"
  | "cancelled"
  | "failed";

export type RunIssueKind =
  | "rate_limit"
  | "configuration"
  | "authentication"
  | "quota"
  | "timeout"
  | "network"
  | "provider"
  | "validation"
  | "unknown";

export type RunIssue = {
  id: string;
  occurredAt: string;
  stage: RunStage;
  scope: "run" | "candidate";
  kind: RunIssueKind;
  message: string;
  retryable: boolean;
  candidate: DiscoveryCandidate | null;
};

export type RunActivity = {
  id: string;
  occurredAt: string;
  kind: "stage" | "discovery" | "candidate" | "accepted" | "rejected" | "issue" | "complete";
  message: string;
};

export type RunRecord = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  stage: RunStage;
  outcome: RunOutcome | null;
  preferences: RunPreferences;
  discoveredCount: number;
  researchedCount: number;
  qualifiedCount: number;
  rejectedCount: number;
  deduplicatedCount: number;
  researchLimitReached: boolean;
  leads: QualifiedLead[];
  rejectionReasons: Record<string, RejectionReason[]>;
  rejectedEvidence: Record<string, CandidateEvidence>;
  error: string | null;
  /** Optional for compatibility with runs saved before structured observability shipped. */
  issues?: RunIssue[];
  /** Most recent activity is retained as a bounded, human-readable run ledger. */
  activity?: RunActivity[];
  /** Transient candidates currently being researched. */
  activeCandidates?: Pick<DiscoveryCandidate, "id" | "companyName">[];
};

export type CandidateMemory = {
  id: string;
  companyName: string;
  websiteUrl: string | null;
  outcome:
    | "discovered"
    | "accepted"
    | "rejected"
    | "good"
    | "maybe"
    | "not_fit"
    | "already_known";
  reason: string;
  runId: string | null;
  updatedAt: string;
};

export type CriteriaChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
