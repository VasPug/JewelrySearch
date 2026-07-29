import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES } from "./defaults";
import type { QualifiedLead, RunRecord } from "./types";
import { buildRunWorkbook } from "./workbook";

function lead(): QualifiedLead {
  return {
    personName: "Avery Chen", personRole: "Sales Director", companyName: "North Star Jewelry",
    phoneNumber: "+1 416 555 0100", genericEmail: "hello@northstar.ca", personalEmail: "",
    personalEmailStatus: "", personalEmailConfidence: "", countryCode: "CA",
    recordType: "outbound_seller", leadStatus: "unqualified", leadSource: "You.com",
    sellerType: "manufacturer", mainProductSegment: "chains", pricingTier: "CAD 26-50",
    websiteUrl: "https://northstar.ca", linkedinUrl: "", instagramUrl: "",
    instagramFollowers: "16000", facebookUrl: "", etsyUrl: "", amazonUrl: "", ebayUrl: "",
    poshmarkUrl: "", depopUrl: "", pinterestUrl: "", tiktokUrl: "", otherSocialUrls: "",
    description: "Sterling silver chain", confidenceScore: 88,
    scoreBreakdown: {
      productFit: 30, affordability: 20, inventory: 18, sellerPriority: 12,
      contactability: 4, presence: 4, unwantedPenalty: 0, confidence: 88,
    },
    evidenceUrls: ["https://northstar.ca"], dateResearched: "2026-07-28T19:15:00.000Z",
  };
}

describe("buildRunWorkbook", () => {
  it("creates separate Accepted and Rejected worksheets", async () => {
    const run: RunRecord = {
      id: "run-1", startedAt: "2026-07-28T19:00:00.000Z",
      completedAt: "2026-07-28T19:20:00.000Z", stage: "export-ready",
      preferences: { ...DEFAULT_PREFERENCES, weights: { ...DEFAULT_PREFERENCES.weights } },
      discoveredCount: 2, researchedCount: 1, qualifiedCount: 1, rejectedCount: 1,
      deduplicatedCount: 0, researchLimitReached: false, leads: [lead()],
      rejectionReasons: { "https://example.ca/blog": ["Search result is an article rather than a seller"] },
      rejectedEvidence: {}, error: null,
    };

    const bytes = await buildRunWorkbook(run);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Accepted", "Rejected"]);
    expect(workbook.getWorksheet("Accepted")?.rowCount).toBe(2);
    expect(workbook.getWorksheet("Rejected")?.rowCount).toBe(2);
    expect(workbook.getWorksheet("Accepted")?.getCell("C2").value).toBe("North Star Jewelry");
    expect(workbook.getWorksheet("Rejected")?.getCell("E2").value).toBe(
      "Search result is an article rather than a seller",
    );
  });
});
