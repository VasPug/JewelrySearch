import ExcelJS from "exceljs";

import { LEAD_EXPORT_HEADERS, leadExportRow } from "./export-rows";
import { scoreCandidate } from "./scoring";
import type { CandidateEvidence, RunRecord } from "./types";

const REJECTED_HEADERS = [
  "candidate_id",
  "company_name",
  "website_url",
  "confidence_score",
  "rejection_reasons",
  "canadian_location_verified",
  "canadian_address",
  "seller_type",
  "main_product_segment",
  "accepted_metals",
  "sample_product_titles",
  "phone_number",
  "generic_email",
  "personal_email",
  "discovery_source",
  "evidence_urls",
] as const;

export async function buildRunWorkbook(run: RunRecord): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Aurum Sourcing";
  workbook.created = new Date();

  const accepted = workbook.addWorksheet("Accepted", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });
  accepted.addRow([...LEAD_EXPORT_HEADERS]);
  for (const lead of run.leads) accepted.addRow(normalizeBlankCells(leadExportRow(lead)));
  styleDataSheet(accepted);

  const rejected = workbook.addWorksheet("Rejected", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });
  rejected.addRow([...REJECTED_HEADERS]);

  const rejectedEvidence = run.rejectedEvidence ?? {};
  for (const [candidateId, reasons] of Object.entries(run.rejectionReasons)) {
    const evidence = rejectedEvidence[candidateId];
    rejected.addRow(normalizeBlankCells(rejectedRow(candidateId, reasons, evidence, run)));
  }
  styleDataSheet(rejected);

  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

function rejectedRow(
  candidateId: string,
  reasons: string[],
  evidence: CandidateEvidence | undefined,
  run: RunRecord,
): Array<string | number | boolean> {
  const score = evidence ? scoreCandidate(evidence, run.preferences) : null;
  return [
    candidateId,
    evidence?.companyName.value ?? "",
    evidence?.officialWebsite?.value ?? "",
    score?.confidence ?? 0,
    reasons.join("; "),
    evidence?.location.verified ?? false,
    evidence?.location.address?.value ?? "",
    evidence?.sellerType?.value ?? "",
    evidence?.mainProductSegment?.value ?? "",
    evidence?.acceptedMetals.map((metal) => metal.value).join("; ") ?? "",
    evidence?.catalogSamples.map((sample) => sample.title).join("; ") ?? "",
    evidence?.contacts.phoneNumber?.value ?? "",
    evidence?.contacts.genericEmail?.value ?? "",
    evidence?.contacts.personalEmail?.value ?? "",
    evidence?.discoverySource ?? "",
    evidence?.sourceUrls.join("; ") ?? "",
  ];
}

function normalizeBlankCells(
  values: Array<string | number | boolean>,
): Array<string | number | boolean | null> {
  return values.map((value) => value === "" ? null : value);
}

function styleDataSheet(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.height = 24;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173F34" } };
  header.alignment = { vertical: "middle" };
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: sheet.columnCount },
  };

  sheet.columns.forEach((column, index) => {
    const headerText = String(sheet.getCell(1, index + 1).value ?? "");
    const longText = /description|evidence|reason|product|social|source/.test(headerText);
    column.width = longText ? 34 : Math.min(24, Math.max(12, headerText.length + 2));
    column.alignment = { vertical: "top", wrapText: longText };
  });

  for (let row = 2; row <= sheet.rowCount; row += 1) {
    sheet.getRow(row).height = sheet.name === "Rejected" ? 42 : 24;
    sheet.getRow(row).alignment = { vertical: "top", wrapText: sheet.name === "Rejected" };
    if (row % 2 === 0) {
      sheet.getRow(row).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF4F6F4" },
      };
    }
  }
}
