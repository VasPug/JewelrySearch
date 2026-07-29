import { describe, expect, it } from "vitest";

import { researchOutputSchema } from "./schema";

const evidence = <T>(value: T) => ({
  value,
  sourceUrl: "https://example.ca/evidence",
  confidence: 0.9,
});

const response = (): Record<string, any> => ({
  companyName: evidence("Northern Jewelry Co."),
  officialWebsite: evidence("https://northern.example.ca"),
  location: {
    verified: true,
    address: evidence("123 Queen St W, Toronto, ON M5H 2N2, Canada"),
    verificationMethod: "official_website",
    supportingSources: [evidence("Canadian address")],
  },
  sellerType: evidence("manufacturer"),
  mainProductSegment: evidence("sterling silver chains"),
  acceptedMetals: [evidence("0.925 sterling silver")],
  catalogSamples: [
    {
      title: "Silver chain",
      productUrl: "https://northern.example.ca/products/silver-chain",
      category: "chains",
      metal: "0.925 sterling silver",
      priceCad: 45,
      available: true,
      madeToOrder: false,
      personalized: false,
      sourceUrl: "https://northern.example.ca/products/silver-chain",
      confidence: 0.9,
    },
  ],
  readyToShip: evidence(true),
  contacts: {
    personName: evidence("Avery Smith"),
    personRole: evidence("Sales manager"),
    phoneNumber: evidence("+1 416 555 0100"),
    genericEmail: evidence("hello@northern.example.ca"),
    personalEmail: evidence("avery@northern.example.ca"),
    personalEmailStatus: "published",
  },
  socials: {
    linkedinUrl: evidence("https://www.linkedin.com/company/northern-jewelry"),
    instagramUrl: evidence("https://www.instagram.com/northernjewelry"),
    instagramFollowers: evidence("12,345 followers"),
    facebookUrl: evidence("https://www.facebook.com/northernjewelry"),
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
  sourceUrls: ["https://northern.example.ca", "https://example.ca/evidence"],
});

describe("researchOutputSchema", () => {
  it("parses complete evidence and normalizes follower counts to digits", () => {
    const parsed = researchOutputSchema.parse(response());

    expect(parsed.companyName.value).toBe("Northern Jewelry Co.");
    expect(parsed.socials.instagramFollowers?.value).toBe(12345);
    expect(parsed.catalogSamples).toHaveLength(1);
  });

  it("accepts documented unknown values as null", () => {
    const value = response();
    value.officialWebsite = null;
    value.location.address = null;
    value.sellerType = null;
    value.mainProductSegment = null;
    value.readyToShip = null;
    value.contacts = {
      personName: null,
      personRole: null,
      phoneNumber: null,
      genericEmail: null,
      personalEmail: null,
      personalEmailStatus: null,
    };
    value.socials.instagramFollowers = null;
    value.tradeShowParticipation = null;

    expect(researchOutputSchema.parse(value).contacts.personalEmail).toBeNull();
  });

  it("rejects invalid evidence and catalog URLs", () => {
    const invalidEvidenceUrl = response();
    invalidEvidenceUrl.companyName.sourceUrl = "not-a-url";
    const invalidProductUrl = response();
    invalidProductUrl.catalogSamples[0].productUrl = "not-a-url";

    expect(researchOutputSchema.safeParse(invalidEvidenceUrl).success).toBe(false);
    expect(researchOutputSchema.safeParse(invalidProductUrl).success).toBe(false);
  });

  it("rejects invalid email addresses and missing evidence URLs", () => {
    const invalidEmail = response();
    invalidEmail.contacts.genericEmail = evidence("not-an-email");
    const missingEvidence = response();
    missingEvidence.sourceUrls = [];

    expect(researchOutputSchema.safeParse(invalidEmail).success).toBe(false);
    expect(researchOutputSchema.safeParse(missingEvidence).success).toBe(false);
  });
});
