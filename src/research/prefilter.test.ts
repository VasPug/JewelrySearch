import { describe, expect, it } from "vitest";

import type { DiscoveryCandidate } from "@/domain/types";

import { prefilterCandidate } from "./prefilter";

function candidate(companyName: string, websiteUrl: string): DiscoveryCandidate {
  return { id: websiteUrl, companyName, websiteUrl, discoverySource: websiteUrl };
}

describe("prefilterCandidate", () => {
  it.each([
    ["Top 10 Canadian Jewelry Suppliers", "https://example.com/blog/canadian-suppliers"],
    ["Canadian jewelry supplier directory", "https://example.com/directory"],
    ["Jewelry businesses", "https://www.yellowpages.ca/search/jewelry"],
  ])("rejects non-seller result %s", (title, url) => {
    expect(prefilterCandidate(candidate(title, url))).not.toBeNull();
  });

  it.each([
    ["House of Jewellery", "https://houseofjewellery.com"],
    ["Canadian Silver Shop", "https://www.etsy.com/shop/CanadianSilverShop"],
    ["Northern Gold", "https://instagram.com/northerngold"],
  ])("keeps likely seller result %s", (title, url) => {
    expect(prefilterCandidate(candidate(title, url))).toBeNull();
  });
});
