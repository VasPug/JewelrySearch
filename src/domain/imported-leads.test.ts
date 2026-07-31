import { describe, expect, it } from "vitest";

import { parseImportedLeadsCsv } from "./imported-leads";

describe("parseImportedLeadsCsv", () => {
  it("reads common lead columns and removes duplicate sellers", () => {
    const csv = [
      "Company Name,Website Link,Phone Number,Instagram URL,Feedback Status,Feedback Notes",
      'North Star Jewelry,https://northstar.ca,"+1 416 555 0100",https://instagram.com/northstar,good,Strong wholesale fit',
      "North Star Jewelry,https://www.northstar.ca/,,,not_fit,duplicate row",
      "Silver House,https://silverhouse.ca,,,already_known,In Salesforce",
    ].join("\n");

    expect(parseImportedLeadsCsv(csv)).toEqual([
      {
        id: "https://northstar.ca",
        companyName: "North Star Jewelry",
        websiteUrl: "https://northstar.ca",
        phoneNumber: "+1 416 555 0100",
        instagramUrl: "https://instagram.com/northstar",
        feedbackStatus: "good",
        feedbackNotes: "Strong wholesale fit",
        importedAt: expect.any(String),
      },
      {
        id: "https://silverhouse.ca",
        companyName: "Silver House",
        websiteUrl: "https://silverhouse.ca",
        phoneNumber: "",
        instagramUrl: "",
        feedbackStatus: "already_known",
        feedbackNotes: "In Salesforce",
        importedAt: expect.any(String),
      },
    ]);
  });

  it("rejects unsupported explicit feedback statuses", () => {
    expect(() =>
      parseImportedLeadsCsv(
        "Company Name,Feedback Status\nNorth Star Jewelry,uncertain",
      ),
    ).toThrow(/good, maybe, not_fit, already_known, or blank/i);
  });

  it("rejects a file without company or website columns", () => {
    expect(() => parseImportedLeadsCsv("email,notes\na@example.com,test")).toThrow(
      /company or website column/i,
    );
  });
});
