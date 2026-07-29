import type { CandidateEvidence, DiscoveryCandidate, QualifiedLead } from "./types";

export type DedupCandidate = Partial<{
  companyName: string | { value: string };
  websiteUrl: string | null;
  officialWebsite: { value: string } | null;
  phoneNumber: string | null;
  contacts: { phoneNumber: { value: string } | null };
  instagramUrl: string | null;
  socials: { instagramUrl: { value: string } | null };
  city: string | null;
  location: { address: { value: string } | null };
}>;

/** Stable identifiers for publicly observable company identity. */
export function candidateKeys(candidate: DedupCandidate): string[] {
  const keys: string[] = [];
  const website = candidate.websiteUrl ?? candidate.officialWebsite?.value;
  const phone = candidate.phoneNumber ?? candidate.contacts?.phoneNumber?.value;
  const instagram = candidate.instagramUrl ?? candidate.socials?.instagramUrl?.value;
  const domain = normalizeDomain(website);
  if (domain) keys.push(`domain:${domain}`);
  const digits = phone?.replace(/\D/g, "");
  if (digits) keys.push(`phone:${digits}`);
  const handle = normalizeInstagram(instagram);
  if (handle) keys.push(`instagram:${handle}`);
  return keys;
}

/** Strong identity matches and exact normalized company names prevent repeat research. */
export function isDuplicate(candidate: DedupCandidate, existing: DedupCandidate[]): boolean {
  const candidateStrongKeys = new Set(candidateKeys(candidate));
  const name = normalizeName(readName(candidate));

  return existing.some((item) => {
    if (candidateKeys(item).some((key) => candidateStrongKeys.has(key))) return true;
    return Boolean(name && name === normalizeName(readName(item)));
  });
}

export type DedupeSource = DiscoveryCandidate | CandidateEvidence | QualifiedLead | DedupCandidate;

function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function normalizeInstagram(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
    return url.pathname.split("/").filter(Boolean)[0]?.toLowerCase().replace(/^@/, "") || null;
  } catch {
    return value.trim().toLowerCase().replace(/^@/, "") || null;
  }
}

function normalizeName(value: string | undefined): string | null {
  const normalized = value?.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
  return normalized || null;
}

function readName(candidate: DedupCandidate): string | undefined {
  return typeof candidate.companyName === "string" ? candidate.companyName : candidate.companyName?.value;
}
