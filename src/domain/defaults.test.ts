import { describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES } from "./defaults";

describe("DEFAULT_PREFERENCES", () => {
  it("provides the recommended qualification and unwanted-inventory settings", () => {
    expect(DEFAULT_PREFERENCES).toMatchObject({
      threshold: 41,
      targetLeads: 5,
      maxCandidates: 20,
      maxConcurrentResearch: 1,
      weights: {
        productFit: 30,
        affordability: 20,
        inventory: 18,
        sellerPriority: 12,
        contactability: 12,
        presence: 8,
      },
      unwantedMeaningfulPercent: 10,
      unwantedMeaningfulCount: 5,
      unwantedLowMax: 30,
      unwantedMediumMax: 60,
      unwantedGeneralRejectAbove: 70,
      unwantedMoissaniteRejectAbove: 60,
    });
  });

  it("defaults to the confirmed chain-only sourcing brief", () => {
    expect(DEFAULT_PREFERENCES.acceptedMetals).toEqual([
      "0.925 sterling silver",
      "10K gold",
      "14K gold",
    ]);
    expect(DEFAULT_PREFERENCES.acceptedCategories).toEqual([
      "chains",
      "Cuban chains",
      "paperclip chains",
      "regular chains",
    ]);
    expect(DEFAULT_PREFERENCES.avoidTerms).toEqual([
      "diamond",
      "pendant",
      "watch",
      "vintage",
      "raw gemstone",
      "handmade",
      "handcrafted",
      "made to order",
      "personalized",
      "engagement",
    ]);
  });

  it("prevents consumers from changing nested default values", () => {
    expect(Object.isFrozen(DEFAULT_PREFERENCES)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PREFERENCES.weights)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PREFERENCES.acceptedMetals)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PREFERENCES.acceptedCategories)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PREFERENCES.avoidTerms)).toBe(true);
  });
});
