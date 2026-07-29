import type { DiscoveryCandidate } from "@/domain/types";

const ARTICLE_TITLE_PATTERNS = [
  /\btop\s+\d+\b/i,
  /\bbest\b.*\b(suppliers?|brands?|stores?|shops?)\b/i,
  /\b(list|guide|directory|roundup|review)\b/i,
  /\bwhere to buy\b/i,
];

const ARTICLE_PATH_PATTERNS = [
  /\/blogs?\//i,
  /\/articles?\//i,
  /\/news\//i,
  /\/guides?\//i,
];

const DISCOVERY_ONLY_HOSTS = [
  "yellowpages.ca",
  "yelp.ca",
  "yelp.com",
  "canada411.ca",
];

export function prefilterCandidate(candidate: DiscoveryCandidate): string | null {
  if (!candidate.websiteUrl) return "No candidate website was discovered";

  let url: URL;
  try {
    url = new URL(candidate.websiteUrl);
  } catch {
    return "Candidate website URL is invalid";
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (DISCOVERY_ONLY_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return "Search result is a directory rather than a seller";
  }

  if (ARTICLE_PATH_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    return "Search result is an article rather than a seller";
  }

  if (ARTICLE_TITLE_PATTERNS.some((pattern) => pattern.test(candidate.companyName))) {
    return "Search result title indicates a list or article";
  }

  return null;
}
