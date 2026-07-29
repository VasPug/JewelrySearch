import { describe, expect, it } from "vitest";

import { candidateKeys, isDuplicate } from "./deduplicate";

describe("candidateKeys", () => {
  it("normalizes domains, phones, and social handles into namespaced strong keys", () => {
    expect(candidateKeys({
      websiteUrl: "https://www.Example.ca/products/ring",
      phoneNumber: "+1 (416) 555-0123",
      instagramUrl: "https://instagram.com/Example.Shop/",
    })).toEqual(["domain:example.ca", "phone:14165550123", "instagram:example.shop"]);
  });
});

describe("isDuplicate", () => {
  it("matches a strong normalized key", () => {
    expect(isDuplicate(
      { companyName: "North Star", websiteUrl: "https://northstar.ca" },
      [{ companyName: "Different seller", websiteUrl: "https://www.northstar.ca" }],
    )).toBe(true);
  });

  it("matches company punctuation and casing only when the Canadian city agrees", () => {
    const existing = [{ companyName: "Northern Jewelry Co.", city: "Toronto, ON, Canada" }];

    expect(isDuplicate({ companyName: "northern-jewelry co", city: "Toronto" }, existing)).toBe(true);
    expect(isDuplicate({ companyName: "northern-jewelry co", city: "Vancouver, BC, Canada" }, existing)).toBe(false);
  });

  it("does not treat a generic word as a duplicate company", () => {
    expect(isDuplicate(
      { companyName: "North Star Jewelry", city: "Toronto" },
      [{ companyName: "North Jewellery", city: "Toronto" }],
    )).toBe(false);
  });
});
