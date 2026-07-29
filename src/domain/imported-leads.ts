export type ImportedLead = {
  id: string;
  companyName: string;
  websiteUrl: string | null;
  phoneNumber: string;
  instagramUrl: string;
  feedbackStatus: FeedbackStatus;
  feedbackNotes: string;
  importedAt: string;
};

export type FeedbackStatus = "" | "good" | "not_fit" | "already_known";

const COMPANY_HEADERS = ["companyname", "company", "businessname", "name"];
const WEBSITE_HEADERS = ["websiteurl", "websitelink", "website", "url"];
const PHONE_HEADERS = ["phonenumber", "phone", "telephone"];
const INSTAGRAM_HEADERS = ["instagramurl", "instagram", "instagramlink"];
const FEEDBACK_STATUS_HEADERS = ["feedbackstatus", "reviewstatus", "fitstatus"];
const FEEDBACK_NOTES_HEADERS = ["feedbacknotes", "reviewnotes", "gutchecknotes", "notes"];
const FEEDBACK_STATUSES = new Set<FeedbackStatus>(["", "good", "not_fit", "already_known"]);

export function parseImportedLeadsCsv(csv: string): ImportedLead[] {
  const rows = parseCsv(csv);
  const headers = rows.shift()?.map(normalizeHeader) ?? [];
  const companyIndex = findHeader(headers, COMPANY_HEADERS);
  const websiteIndex = findHeader(headers, WEBSITE_HEADERS);
  const phoneIndex = findHeader(headers, PHONE_HEADERS);
  const instagramIndex = findHeader(headers, INSTAGRAM_HEADERS);
  const feedbackStatusIndex = findHeader(headers, FEEDBACK_STATUS_HEADERS);
  const feedbackNotesIndex = findHeader(headers, FEEDBACK_NOTES_HEADERS);

  if (companyIndex === -1 && websiteIndex === -1) {
    throw new Error("CSV needs a company or website column");
  }

  const importedAt = new Date().toISOString();
  const seen = new Set<string>();
  const leads: ImportedLead[] = [];

  for (const row of rows) {
    const companyName = readCell(row, companyIndex);
    const websiteUrl = normalizeWebsite(readCell(row, websiteIndex));
    const feedbackStatus = normalizeFeedbackStatus(readCell(row, feedbackStatusIndex));
    if (!companyName && !websiteUrl) continue;

    const key = websiteUrl ? `website:${websiteUrl}` : `company:${normalizeCompany(companyName)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    leads.push({
      id: websiteUrl ?? `company:${normalizeCompany(companyName)}`,
      companyName: companyName || websiteUrl || "Imported seller",
      websiteUrl,
      phoneNumber: readCell(row, phoneIndex),
      instagramUrl: readCell(row, instagramIndex),
      feedbackStatus,
      feedbackNotes: readCell(row, feedbackNotesIndex),
      importedAt,
    });
  }

  return leads;
}

function normalizeFeedbackStatus(value: string): FeedbackStatus {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (!FEEDBACK_STATUSES.has(normalized as FeedbackStatus)) {
    throw new Error("Feedback Status must be good, not_fit, already_known, or blank");
  }
  return normalized as FeedbackStatus;
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]!;
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function findHeader(headers: string[], choices: string[]): number {
  return headers.findIndex((header) => choices.includes(header));
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readCell(row: string[], index: number): string {
  return index < 0 ? "" : (row[index] ?? "").trim();
}

function normalizeWebsite(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizeCompany(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
