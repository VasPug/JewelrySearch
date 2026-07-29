import { describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES } from "./defaults";

describe("DEFAULT_PREFERENCES", () => {
  it("provides the recommended qualification and unwanted-inventory settings", () => {
    expect(DEFAULT_PREFERENCES).toMatchObject({
      threshold: 75,
      targetLeads: 100,
      maxCandidates: 600,
      maxConcurrentResearch: 3,
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

  it("uses the supported materials and ready-to-ship jewelry categories", () => {
    expect(DEFAULT_PREFERENCES.acceptedMetals).toEqual([
      "0.925 sterling silver",
      "10K gold",
      "14K gold",
      "gold-filled",
      "gold-plated",
    ]);
    expect(DEFAULT_PREFERENCES.acceptedCategories).toEqual([
      "chains",
      "bracelets",
      "earrings",
      "rings",
      "anklets",
    ]);
  });
});
