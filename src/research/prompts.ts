import type { DiscoveryCandidate, RunPreferences } from "@/domain/types";

export const DISCOVERY_QUERY_FAMILIES = [
  "Canadian jewelry manufacturers wholesale sterling silver gold",
  "Canadian jewelry wholesalers ready to ship inventory",
  "Canadian independent jewelry retailers sterling silver gold",
  "Canadian jewelry trade show exhibitors wholesale",
  "Canadian jewelry Etsy Instagram marketplace sellers",
] as const;

export function discoveryQueries(location = "Canada"): string[] {
  return DISCOVERY_QUERY_FAMILIES.map((query) => query.replace("Canadian", location));
}

export function candidateResearchPrompt(
  candidate: DiscoveryCandidate,
  preferences: RunPreferences,
): string {
  return [
    `Research ${candidate.companyName} as a Canadian jewelry sourcing candidate.`,
    candidate.websiteUrl ? `Its discovered website is ${candidate.websiteUrl}.` : "No official website was found during discovery.",
    "Return only verified facts. Every non-null location, catalog, price, stock, contact, and social follower-count fact must include its direct source URL and confidence.",
    "Use null for any unknown, unavailable, or unverified field; never infer values. Include at least one evidence URL in sourceUrls.",
    "Verify a physical Canadian address where possible, identify seller type, and sample up to 20 listings.",
    `Prioritize these categories: ${preferences.acceptedCategories.join(", ") || "jewelry"}.`,
    `Prioritize these metals: ${preferences.acceptedMetals.join(", ") || "unknown"}.`,
    "Record ready-to-ship evidence, published contacts, social profiles and follower counts, and trade-show participation only when supported by citations.",
  ].join(" ");
}
