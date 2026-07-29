import { describe, expect, it } from "vitest";

import { parseImportedLeadsCsv } from "./imported-leads";

describe("parseImportedLeadsCsv", () => {
  it("reads common lead columns and removes duplicate sellers", () => {
    const csv = [
      "Company Name,Website Link,Phone Number,Instagram URL",
      'North Star Jewelry,https://northstar.ca,"+1 416 555 0100",https://instagram.com/northstar',
      "North Star Jewelry,https://www.northstar.ca/,,”",
      "Silver House,https://silverhouse.ca,,",
    ].join("\n");

    expect(parseImportedLeadsCsv(csv)).toEqual([
      {
        id: "https://northstar.ca",
        companyName: "North Star Jewelry",
        websiteUrl: "https://northstar.ca",
        phoneNumber: "+1 416 555 0100",
        instagramUrl: "https://instagram.com/northstar",
        importedAt: expect.any(String),
      },
      {
        id: "https://silverhouse.ca",
        companyName: "Silver House",
        websiteUrl: "https://silverhouse.ca",
        phoneNumber: "",
        instagramUrl: "",
        importedAt: expect.any(String),
      },
    ]);
  });

  it("rejects a file without company or website columns", () => {
    expect(() => parseImportedLeadsCsv("email,notes\na@example.com,test")).toThrow(
      /company or website column/i,
    );
  });
});
