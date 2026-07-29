import type { QualifiedLead, RunRecord, ScoreBreakdown } from "./types";

type CsvColumn = {
  header: string;
  value: (lead: QualifiedLead) => string | number;
};

const COLUMNS: readonly CsvColumn[] = [
  { header: "person_name", value: (lead) => lead.personName },
  { header: "person_role", value: (lead) => lead.personRole },
  { header: "company_name", value: (lead) => lead.companyName },
  { header: "phone_number", value: (lead) => lead.phoneNumber },
  { header: "generic_email", value: (lead) => lead.genericEmail },
  { header: "personal_email", value: (lead) => lead.personalEmail },
  { header: "personal_email_status", value: (lead) => lead.personalEmailStatus },
  { header: "personal_email_confidence", value: (lead) => lead.personalEmailConfidence },
  { header: "country_code", value: (lead) => lead.countryCode },
  { header: "record_type", value: (lead) => lead.recordType },
  { header: "lead_status", value: (lead) => lead.leadStatus },
  { header: "lead_source", value: (lead) => lead.leadSource },
  { header: "seller_type", value: (lead) => lead.sellerType },
  { header: "main_product_segment", value: (lead) => lead.mainProductSegment },
  { header: "pricing_tier", value: (lead) => lead.pricingTier },
  { header: "website_url", value: (lead) => lead.websiteUrl },
  { header: "linkedin_url", value: (lead) => lead.linkedinUrl },
  { header: "instagram_url", value: (lead) => lead.instagramUrl },
  { header: "instagram_followers", value: (lead) => digitsOnly(lead.instagramFollowers) },
  { header: "facebook_url", value: (lead) => lead.facebookUrl },
  { header: "etsy_url", value: (lead) => lead.etsyUrl },
  { header: "amazon_url", value: (lead) => lead.amazonUrl },
  { header: "ebay_url", value: (lead) => lead.ebayUrl },
  { header: "poshmark_url", value: (lead) => lead.poshmarkUrl },
  { header: "depop_url", value: (lead) => lead.depopUrl },
  { header: "pinterest_url", value: (lead) => lead.pinterestUrl },
  { header: "tiktok_url", value: (lead) => lead.tiktokUrl },
  { header: "other_social_urls", value: (lead) => lead.otherSocialUrls },
  { header: "description", value: (lead) => lead.description },
  { header: "confidence_score", value: (lead) => lead.confidenceScore },
  { header: "score_breakdown", value: (lead) => formatScoreBreakdown(lead.scoreBreakdown) },
  { header: "evidence_urls", value: (lead) => lead.evidenceUrls.join(";") },
  { header: "date_researched", value: (lead) => researchDate(lead.dateResearched) },
];

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function researchDate(value: string): string {
  if (!value) return "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function formatScoreBreakdown(breakdown: ScoreBreakdown): string {
  return [
    `product_fit=${breakdown.productFit}`,
    `affordability=${breakdown.affordability}`,
    `inventory=${breakdown.inventory}`,
    `seller_priority=${breakdown.sellerPriority}`,
    `contactability=${breakdown.contactability}`,
    `presence=${breakdown.presence}`,
    `unwanted_penalty=${breakdown.unwantedPenalty}`,
    `confidence=${breakdown.confidence}`,
  ].join(";");
}

function escapeCsv(value: string | number): string {
  let cell = String(value);
  if (/^[=+\-@]/.test(cell)) cell = `'${cell}`;
  if (/[",\r\n]/.test(cell)) cell = `"${cell.replaceAll('"', '""')}"`;
  return cell;
}

export function serializeLeadsCsv(leads: QualifiedLead[]): string {
  const header = COLUMNS.map((column) => column.header).join(",");
  const rows = leads.map((lead) =>
    COLUMNS.map((column) => escapeCsv(column.value(lead))).join(","),
  );

  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}

export function downloadLeadsCsv(run: RunRecord): void {
  const blob = new Blob([serializeLeadsCsv(run.leads)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `qualified-sellers-${run.id}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
