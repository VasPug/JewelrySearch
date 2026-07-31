import { describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES } from "./defaults";
import { scoreCandidate, validatePreferences } from "./scoring";
import type {
  CandidateEvidence,
  CatalogListingSample,
  EvidenceValue,
  SellerType,
} from "./types";

const sourceUrl = "https://northstar-jewelry.ca";

function evidence<T>(value: T): EvidenceValue<T> {
  return { value, sourceUrl, confidence: 1 };
}

function listing(overrides: Partial<CatalogListingSample> = {}): CatalogListingSample {
  return {
    title: "Sterling silver chain",
    productUrl: `${sourceUrl}/products/chain`,
    category: "chains",
    metal: "0.925 sterling silver",
    priceCad: 25,
    available: true,
    madeToOrder: false,
    personalized: false,
    sourceUrl,
    confidence: 1,
    ...overrides,
  };
}

function candidate(overrides: {
  canadaVerified?: boolean;
  officialWebsite?: EvidenceValue<string> | null;
  sellerType?: EvidenceValue<SellerType> | null;
  mainProductSegment?: EvidenceValue<string> | null;
  acceptedMetals?: EvidenceValue<string>[];
  catalogSamples?: CatalogListingSample[];
  personalEmail?: EvidenceValue<string> | null;
  personalEmailStatus?: "published" | "inferred" | null;
  genericEmail?: EvidenceValue<string> | null;
  phoneNumber?: EvidenceValue<string> | null;
} = {}): CandidateEvidence {
  return {
    id: "north-star-jewelry",
    companyName: evidence("North Star Jewelry"),
    officialWebsite: evidence(sourceUrl),
    location: {
      verified: overrides.canadaVerified ?? true,
      address: evidence("123 Queen St W, Toronto, ON M5H 2M9, Canada"),
      verificationMethod: "official_website",
      supportingSources: [evidence(sourceUrl)],
    },
    sellerType: evidence("manufacturer"),
    mainProductSegment: evidence("chains"),
    acceptedMetals: [evidence("0.925 sterling silver")],
    catalogSamples: Array.from({ length: 10 }, () => listing()),
    readyToShip: evidence(true),
    contacts: {
      personName: evidence("Avery Chen"),
      personRole: evidence("Sales Director"),
      phoneNumber: overrides.phoneNumber ?? null,
      genericEmail: overrides.genericEmail ?? null,
      personalEmail:
        overrides.personalEmail === undefined
          ? evidence("avery@northstar-jewelry.ca")
          : overrides.personalEmail,
      personalEmailStatus: overrides.personalEmailStatus ?? "published",
    },
    socials: {
      linkedinUrl: null,
      instagramUrl: evidence("https://instagram.com/northstarjewelry"),
      instagramFollowers: evidence(1000),
      facebookUrl: null,
      etsyUrl: null,
      amazonUrl: null,
      ebayUrl: null,
      poshmarkUrl: null,
      depopUrl: null,
      pinterestUrl: null,
      tiktokUrl: null,
      otherUrls: [],
    },
    tradeShowParticipation: evidence(true),
    discoverySource: "Canadian jewelry directory",
    sourceUrls: [sourceUrl],
    ...overrides,
  };
}

describe("scoreCandidate hard gates", () => {
  it("enforces user-defined avoid rules as hard rejections", () => {
    const result = scoreCandidate(candidate(), {
      ...DEFAULT_PREFERENCES,
      avoidTerms: ["manufacturer"],
    });

    expect(result).toMatchObject({ accepted: false, confidence: 0 });
    expect(result.reasons).toContain('Avoid rule matched: "manufacturer"');
  });

  it("returns zero when Canadian location is unverified", () => {
    const result = scoreCandidate(candidate({ canadaVerified: false }), DEFAULT_PREFERENCES);

    expect(result).toMatchObject({ accepted: false, confidence: 0 });
    expect(result.reasons).toContain("Canadian physical location is not verified");
  });

  it("rejects a candidate without an official website", () => {
    const result = scoreCandidate(candidate({ officialWebsite: null }), DEFAULT_PREFERENCES);

    expect(result).toMatchObject({ accepted: false, confidence: 0 });
    expect(result.reasons).toContain("Official website is missing");
  });

  it("rejects a seller whose main segment is not qualifying jewelry", () => {
    const result = scoreCandidate(
      candidate({ mainProductSegment: evidence("handbags") }),
      DEFAULT_PREFERENCES,
    );

    expect(result).toMatchObject({ accepted: false, confidence: 0 });
    expect(result.reasons).toContain("Main product segment is not a qualifying jewelry category");
  });

  it("rejects a candidate without an accepted jewelry material", () => {
    const result = scoreCandidate(
      candidate({ acceptedMetals: [evidence("stainless steel")] }),
      DEFAULT_PREFERENCES,
    );

    expect(result).toMatchObject({ accepted: false, confidence: 0 });
    expect(result.reasons).toContain("No accepted jewelry material is verified");
  });

  it.each([
    "sterling silver",
    "925 silver",
    ".925 sterling silver",
    "10kt gold",
    "10 karat gold",
    "14kt gold",
    "14 karat gold",
  ])("recognizes the material synonym %s", (metal) => {
    const result = scoreCandidate(
      candidate({
        acceptedMetals: [evidence(metal)],
        catalogSamples: Array.from({ length: 10 }, () => listing({ metal })),
      }),
      DEFAULT_PREFERENCES,
    );

    expect(result.reasons).not.toContain("No accepted jewelry material is verified");
    expect(result.breakdown.productFit).toBeGreaterThan(0);
  });

  it.each(["gold filled", "gold plated", "vermeil"])(
    "does not treat %s as solid gold by default",
    (metal) => {
      const result = scoreCandidate(
        candidate({
          acceptedMetals: [evidence(metal)],
          catalogSamples: Array.from({ length: 10 }, () => listing({ metal })),
        }),
        DEFAULT_PREFERENCES,
      );

      expect(result.reasons).toContain("No accepted jewelry material is verified");
      expect(result.breakdown.productFit).toBe(0);
    },
  );

  it("recognizes Canadian jewellery spelling and singular product categories", () => {
    const result = scoreCandidate(
      candidate({
        mainProductSegment: evidence("Wholesale silver jewellery and chain"),
        catalogSamples: Array.from({ length: 10 }, () => listing({ category: "chain" })),
      }),
      DEFAULT_PREFERENCES,
    );

    expect(result.reasons).not.toContain("Main product segment is not a qualifying jewelry category");
  });

  it("rejects a candidate without public contact details", () => {
    const result = scoreCandidate(
      candidate({ personalEmail: null, genericEmail: null, phoneNumber: null }),
      DEFAULT_PREFERENCES,
    );

    expect(result).toMatchObject({ accepted: false, confidence: 0 });
    expect(result.reasons).toContain("Public email address or phone number is required");
  });

  it("rejects a seller with a prohibited main product category", () => {
    const result = scoreCandidate(
      candidate({ mainProductSegment: evidence("moissanite") }),
      DEFAULT_PREFERENCES,
    );

    expect(result).toMatchObject({ accepted: false, confidence: 0 });
    expect(result.reasons).toContain("Main product segment is prohibited");
  });

  it("rejects meaningful expensive unwanted inventory", () => {
    const result = scoreCandidate(
      candidate({
        catalogSamples: Array.from({ length: 5 }, () => listing()).concat(
          Array.from({ length: 5 }, () =>
            listing({
              title: "Diamond pendant",
              category: "diamonds",
              metal: null,
              priceCad: 71,
            }),
          ),
        ),
      }),
      DEFAULT_PREFERENCES,
    );

    expect(result).toMatchObject({ accepted: false, confidence: 0 });
    expect(result.reasons).toContain("Meaningful unwanted inventory exceeds the rejection price");
  });

  it("does not reject one stray unwanted listing", () => {
    const result = scoreCandidate(
      candidate({
        catalogSamples: Array.from({ length: 10 }, () => listing()).concat(
          listing({
            title: "Diamond pendant",
            category: "diamonds",
            metal: null,
            priceCad: 100,
          }),
        ),
      }),
      DEFAULT_PREFERENCES,
    );

    expect(result.reasons).not.toContain("Meaningful unwanted inventory exceeds the rejection price");
  });
});

describe("scoreCandidate deterministic components", () => {
  it("does not award product-fit points without matching sampled listings", () => {
    const result = scoreCandidate(
      candidate({ catalogSamples: [] }),
      DEFAULT_PREFERENCES,
    );

    expect(result.breakdown.productFit).toBe(0);
    expect(result.accepted).toBe(false);
  });

  it("awards a perfect 100 when every weighted signal is fully supported", () => {
    const result = scoreCandidate(
      candidate({
        catalogSamples: [
          ...Array.from({ length: 10 }, () => listing({ priceCad: 10 })),
          ...Array.from({ length: 6 }, () => listing({ priceCad: 26 })),
          ...Array.from({ length: 3 }, () => listing({ priceCad: 51 })),
          listing({ priceCad: 71 }),
        ],
      }),
      DEFAULT_PREFERENCES,
    );

    expect(result).toMatchObject({
      accepted: true,
      confidence: 100,
      breakdown: {
        productFit: 30,
        affordability: 20,
        inventory: 18,
        sellerPriority: 12,
        contactability: 12,
        presence: 8,
        unwantedPenalty: 0,
      },
    });
  });

  it("accepts a score equal to the configured threshold", () => {
    const preferences = { ...DEFAULT_PREFERENCES, threshold: 100 };
    const result = scoreCandidate(
      candidate({
        catalogSamples: [
          ...Array.from({ length: 10 }, () => listing({ priceCad: 10 })),
          ...Array.from({ length: 6 }, () => listing({ priceCad: 26 })),
          ...Array.from({ length: 3 }, () => listing({ priceCad: 51 })),
          listing({ priceCad: 71 }),
        ],
      }),
      preferences,
    );

    expect(result).toMatchObject({ accepted: true, confidence: 100 });
  });

  it("rejects invalid preferences when positive weights do not total 100", () => {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      weights: { ...DEFAULT_PREFERENCES.weights, productFit: 29 },
    };

    expect(validatePreferences(preferences)).toEqual({
      valid: false,
      errors: ["Positive scoring weights must total 100"],
    });
    expect(scoreCandidate(candidate(), preferences)).toMatchObject({
      accepted: false,
      confidence: 0,
      reasons: ["Positive scoring weights must total 100"],
    });
  });

  it.each([
    [25, 10],
    [50, 6],
    [70, 3],
    [100, 1],
  ])("scores a CAD $%i qualifying sample at the correct affordability boundary", (priceCad, expected) => {
    const result = scoreCandidate(
      candidate({ catalogSamples: Array.from({ length: 10 }, () => listing({ priceCad })) }),
      DEFAULT_PREFERENCES,
    );

    expect(result.breakdown.affordability).toBe(expected);
  });

  it.each([
    ["manufacturer", 12],
    ["wholesaler", 9],
    ["retailer", 6],
    ["brand_boutique", 3],
    ["marketplace_social", 0],
  ] as const)("orders %s seller priority at %i points", (sellerType, expected) => {
    const result = scoreCandidate(candidate({ sellerType: evidence(sellerType) }), DEFAULT_PREFERENCES);

    expect(result.breakdown.sellerPriority).toBe(expected);
  });

  it.each([
    ["published personal email", { personalEmail: evidence("avery@northstar-jewelry.ca"), personalEmailStatus: "published" as const }, 12],
    ["inferred personal email", { personalEmail: evidence("avery@northstar-jewelry.ca"), personalEmailStatus: "inferred" as const }, 8.4],
    ["generic email", { personalEmail: null, genericEmail: evidence("hello@northstar-jewelry.ca") }, 6],
    ["phone only", { personalEmail: null, phoneNumber: evidence("+1 416 555 0100") }, 4.8],
  ])("scores %s contactability at %i points", (_description, contactOverrides, expected) => {
    const result = scoreCandidate(candidate(contactOverrides), DEFAULT_PREFERENCES);

    expect(result.breakdown.contactability).toBe(expected);
  });

  it.each([
    [30, 0],
    [50, 5],
    [70, 10],
  ])("applies a %i-point penalty for meaningful secondary inventory priced at CAD $%i", (priceCad, expected) => {
    const result = scoreCandidate(
      candidate({
        catalogSamples: Array.from({ length: 5 }, () => listing()).concat(
          Array.from({ length: 5 }, () =>
            listing({
              title: "Diamond pendant",
              category: "diamonds",
              metal: null,
              priceCad,
            }),
          ),
        ),
      }),
      { ...DEFAULT_PREFERENCES, avoidTerms: [] },
    );

    expect(result.breakdown.unwantedPenalty).toBe(expected);
  });
});
