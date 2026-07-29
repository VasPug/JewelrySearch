import { describe, expect, it } from "vitest";

import { serializeLeadsCsv } from "./csv";
import type { QualifiedLead } from "./types";

function lead(overrides: Partial<QualifiedLead> = {}): QualifiedLead {
  return {
    personName: "Avery Chen",
    personRole: "Sales Director",
    companyName: "North Star Jewelry",
    phoneNumber: "+1 416 555 0100",
    genericEmail: "hello@northstar-jewelry.ca",
    personalEmail: "avery@northstar-jewelry.ca",
    personalEmailStatus: "published",
    personalEmailConfidence: 1,
    countryCode: "CA",
    recordType: "outbound_seller",
    leadStatus: "unqualified",
    leadSource: "Canadian jewelry directory",
    sellerType: "manufacturer",
    mainProductSegment: "chains",
    pricingTier: "CAD 26-50",
    websiteUrl: "https://northstar-jewelry.ca",
    linkedinUrl: "https://linkedin.com/company/northstar",
    instagramUrl: "https://instagram.com/northstar",
    instagramFollowers: "16.2K followers",
    facebookUrl: "",
    etsyUrl: "",
    amazonUrl: "",
    ebayUrl: "",
    poshmarkUrl: "",
    depopUrl: "",
    pinterestUrl: "",
    tiktokUrl: "",
    otherSocialUrls: "https://x.com/northstar",
    description: "Sterling silver chain",
    confidenceScore: 88,
    scoreBreakdown: {
      productFit: 30,
      affordability: 20,
      inventory: 18,
      sellerPriority: 12,
      contactability: 8,
      presence: 4,
      unwantedPenalty: 0,
      confidence: 92,
    },
    evidenceUrls: ["https://northstar-jewelry.ca", "https://instagram.com/northstar"],
    dateResearched: "2026-07-28T19:15:00.000Z",
    ...overrides,
  };
}

describe("serializeLeadsCsv", () => {
  it("exports the agreed schema in order with normalized export fields", () => {
    const csv = serializeLeadsCsv([lead()]);

    expect(csv).toBe(
      "\uFEFFperson_name,person_role,company_name,phone_number,generic_email,personal_email,personal_email_status,personal_email_confidence,country_code,record_type,lead_status,lead_source,seller_type,main_product_segment,pricing_tier,website_url,linkedin_url,instagram_url,instagram_followers,facebook_url,etsy_url,amazon_url,ebay_url,poshmark_url,depop_url,pinterest_url,tiktok_url,other_social_urls,description,confidence_score,score_breakdown,evidence_urls,date_researched\r\n" +
        "Avery Chen,Sales Director,North Star Jewelry,'+1 416 555 0100,hello@northstar-jewelry.ca,avery@northstar-jewelry.ca,published,1,CA,outbound_seller,unqualified,Canadian jewelry directory,manufacturer,chains,CAD 26-50,https://northstar-jewelry.ca,https://linkedin.com/company/northstar,https://instagram.com/northstar,162,,,,,,,,,https://x.com/northstar,Sterling silver chain,88,product_fit=30;affordability=20;inventory=18;seller_priority=12;contactability=8;presence=4;unwanted_penalty=0;confidence=92,https://northstar-jewelry.ca;https://instagram.com/northstar,2026-07-28\r\n",
    );
  });

  it("leaves missing values blank and escapes commas, quotes, and line breaks", () => {
    const csv = serializeLeadsCsv([
      lead({
        personName: "",
        personalEmailConfidence: "",
        description: 'Chain, "classic"\nsterling silver',
        evidenceUrls: [],
        dateResearched: "",
      }),
    ]);

    expect(csv).toContain(
      'https://x.com/northstar,"Chain, ""classic""\nsterling silver",88,',
    );
    expect(csv).toMatch(/,\r\n$/);
  });

  it("neutralizes formula-like values in every exported text field", () => {
    const csv = serializeLeadsCsv([
      lead({
        personName: "=HYPERLINK(\"https://malicious.example\")",
        leadSource: "+cmd",
        description: "-1+1",
        otherSocialUrls: "@handle",
        evidenceUrls: ["=https://malicious.example"],
      }),
    ]);

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+cmd");
    expect(csv).toContain("'-1+1");
    expect(csv).toContain("'@handle");
    expect(csv).toContain("'=https://malicious.example");
  });
});
