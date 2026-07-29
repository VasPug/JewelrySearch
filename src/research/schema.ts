import { z } from "zod";

import type { CandidateEvidence } from "@/domain/types";

const url = z.string().url();
const confidence = z.number().min(0).max(1);

function evidenceSchema<T extends z.ZodType>(value: T) {
  return z.object({
    value,
    sourceUrl: url,
    confidence,
  }).strict();
}

const nullableEvidence = <T extends z.ZodType>(value: T) => evidenceSchema(value).nullable();

const sellerType = z.enum([
  "manufacturer",
  "wholesaler",
  "retailer",
  "brand_boutique",
  "marketplace_social",
]);

const instagramFollowers = evidenceSchema(
  z.string().transform((value, context) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      context.addIssue({ code: "custom", message: "Follower count must contain digits" });
      return z.NEVER;
    }
    return Number(digits);
  }),
).nullable();

export const researchOutputSchema = z.object({
  companyName: evidenceSchema(z.string().min(1)),
  officialWebsite: nullableEvidence(url),
  location: z.object({
    verified: z.boolean(),
    address: nullableEvidence(z.string().min(1)),
    verificationMethod: z.enum(["official_website", "independent_sources"]).nullable(),
    supportingSources: z.array(evidenceSchema(z.string().min(1))),
  }).strict(),
  sellerType: nullableEvidence(sellerType),
  mainProductSegment: nullableEvidence(z.string().min(1)),
  acceptedMetals: z.array(evidenceSchema(z.string().min(1))),
  catalogSamples: z.array(z.object({
    title: z.string().min(1),
    productUrl: url,
    category: z.string().min(1).nullable(),
    metal: z.string().min(1).nullable(),
    priceCad: z.number().nonnegative().nullable(),
    available: z.boolean().nullable(),
    madeToOrder: z.boolean().nullable(),
    personalized: z.boolean().nullable(),
    sourceUrl: url,
    confidence,
  }).strict()).max(20),
  readyToShip: nullableEvidence(z.boolean()),
  contacts: z.object({
    personName: nullableEvidence(z.string().min(1)),
    personRole: nullableEvidence(z.string().min(1)),
    phoneNumber: nullableEvidence(z.string().min(1)),
    genericEmail: nullableEvidence(z.string().email()),
    personalEmail: nullableEvidence(z.string().email()),
    personalEmailStatus: z.enum(["published", "inferred"]).nullable(),
  }).strict(),
  socials: z.object({
    linkedinUrl: nullableEvidence(url),
    instagramUrl: nullableEvidence(url),
    instagramFollowers,
    facebookUrl: nullableEvidence(url),
    etsyUrl: nullableEvidence(url),
    amazonUrl: nullableEvidence(url),
    ebayUrl: nullableEvidence(url),
    poshmarkUrl: nullableEvidence(url),
    depopUrl: nullableEvidence(url),
    pinterestUrl: nullableEvidence(url),
    tiktokUrl: nullableEvidence(url),
    otherUrls: z.array(evidenceSchema(url)),
  }).strict(),
  tradeShowParticipation: nullableEvidence(z.boolean()),
  sourceUrls: z.array(url).min(1),
}).strict();

export type ResearchOutput = z.output<typeof researchOutputSchema>;

/**
 * JSON Schema supplied to You.com's Research API. It intentionally uses only
 * its documented structured-output subset: all properties are required and
 * unknown facts are expressed as nullable values.
 */
const nullable = (type: string) => ({ type: [type, "null"] });
const evidence = (value: Record<string, unknown>) => ({
  type: "object",
  properties: { value, sourceUrl: { type: "string" }, confidence: { type: "number" } },
  required: ["value", "sourceUrl", "confidence"],
  additionalProperties: false,
});
const nullableEvidenceJson = (value: Record<string, unknown>) => ({
  anyOf: [evidence(value), { type: "null" }],
});

export const RESEARCH_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    companyName: evidence({ type: "string" }),
    officialWebsite: nullableEvidenceJson({ type: "string" }),
    location: {
      type: "object",
      properties: {
        verified: { type: "boolean" },
        address: nullableEvidenceJson({ type: "string" }),
        verificationMethod: { anyOf: [{ type: "string", enum: ["official_website", "independent_sources"] }, { type: "null" }] },
        supportingSources: { type: "array", items: evidence({ type: "string" }) },
      },
      required: ["verified", "address", "verificationMethod", "supportingSources"],
      additionalProperties: false,
    },
    sellerType: nullableEvidenceJson({ type: "string", enum: ["manufacturer", "wholesaler", "retailer", "brand_boutique", "marketplace_social"] }),
    mainProductSegment: nullableEvidenceJson({ type: "string" }),
    acceptedMetals: { type: "array", items: evidence({ type: "string" }) },
    catalogSamples: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" }, productUrl: { type: "string" }, category: nullable("string"), metal: nullable("string"),
          priceCad: nullable("number"), available: nullable("boolean"), madeToOrder: nullable("boolean"), personalized: nullable("boolean"),
          sourceUrl: { type: "string" }, confidence: { type: "number" },
        },
        required: ["title", "productUrl", "category", "metal", "priceCad", "available", "madeToOrder", "personalized", "sourceUrl", "confidence"],
        additionalProperties: false,
      },
    },
    readyToShip: nullableEvidenceJson({ type: "boolean" }),
    contacts: {
      type: "object",
      properties: {
        personName: nullableEvidenceJson({ type: "string" }), personRole: nullableEvidenceJson({ type: "string" }),
        phoneNumber: nullableEvidenceJson({ type: "string" }), genericEmail: nullableEvidenceJson({ type: "string" }),
        personalEmail: nullableEvidenceJson({ type: "string" }), personalEmailStatus: { anyOf: [{ type: "string", enum: ["published", "inferred"] }, { type: "null" }] },
      },
      required: ["personName", "personRole", "phoneNumber", "genericEmail", "personalEmail", "personalEmailStatus"],
      additionalProperties: false,
    },
    socials: {
      type: "object",
      properties: {
        linkedinUrl: nullableEvidenceJson({ type: "string" }), instagramUrl: nullableEvidenceJson({ type: "string" }), instagramFollowers: nullableEvidenceJson({ type: "string" }),
        facebookUrl: nullableEvidenceJson({ type: "string" }), etsyUrl: nullableEvidenceJson({ type: "string" }), amazonUrl: nullableEvidenceJson({ type: "string" }),
        ebayUrl: nullableEvidenceJson({ type: "string" }), poshmarkUrl: nullableEvidenceJson({ type: "string" }), depopUrl: nullableEvidenceJson({ type: "string" }),
        pinterestUrl: nullableEvidenceJson({ type: "string" }), tiktokUrl: nullableEvidenceJson({ type: "string" }), otherUrls: { type: "array", items: evidence({ type: "string" }) },
      },
      required: ["linkedinUrl", "instagramUrl", "instagramFollowers", "facebookUrl", "etsyUrl", "amazonUrl", "ebayUrl", "poshmarkUrl", "depopUrl", "pinterestUrl", "tiktokUrl", "otherUrls"],
      additionalProperties: false,
    },
    tradeShowParticipation: nullableEvidenceJson({ type: "boolean" }),
    sourceUrls: { type: "array", items: { type: "string" } },
  },
  required: ["companyName", "officialWebsite", "location", "sellerType", "mainProductSegment", "acceptedMetals", "catalogSamples", "readyToShip", "contacts", "socials", "tradeShowParticipation", "sourceUrls"],
  additionalProperties: false,
} as const;

export function toCandidateEvidence(
  output: ResearchOutput,
  id: string,
  discoverySource: string,
): CandidateEvidence {
  return { ...output, id, discoverySource };
}
