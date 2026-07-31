import { z } from "zod";

import type { RunPreferences } from "@/domain/types";

const weightsSchema = z.object({
  productFit: z.number().int().min(1).max(100),
  affordability: z.number().int().min(1).max(100),
  inventory: z.number().int().min(1).max(100),
  sellerPriority: z.number().int().min(1).max(100),
  contactability: z.number().int().min(1).max(100),
  presence: z.number().int().min(1).max(100),
});

export const runPreferencesSchema: z.ZodType<RunPreferences> = z.object({
  threshold: z.number().int().min(0).max(100),
  targetLeads: z.number().int().min(1).max(500),
  maxCandidates: z.number().int().min(1).max(1000),
  maxConcurrentResearch: z.number().int().min(1).max(8),
  weights: weightsSchema,
  acceptedMetals: z.array(z.string().trim().min(1).max(80)).max(30),
  acceptedCategories: z.array(z.string().trim().min(1).max(80)).max(30),
  avoidTerms: z.array(z.string().trim().min(1).max(80)).max(30),
  unwantedMeaningfulPercent: z.number().int().min(0).max(100),
  unwantedMeaningfulCount: z.number().int().min(1).max(100),
  unwantedLowMax: z.number().int().min(0).max(100),
  unwantedMediumMax: z.number().int().min(0).max(200),
  unwantedGeneralRejectAbove: z.number().int().min(0).max(100),
  unwantedMoissaniteRejectAbove: z.number().int().min(0).max(100),
});

export const criteriaRequestSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  preferences: runPreferencesSchema,
  instructions: z.string().max(240),
  feedback: z.array(z.object({
    companyName: z.string().trim().min(1).max(120),
    status: z.enum(["good", "maybe", "not_fit", "already_known"]),
    notes: z.string().trim().max(240),
  })).max(20).default([]),
});

export const criteriaResponseSchema = z.object({
  assistantReply: z.string().trim().min(1).max(600),
  instructions: z.string().trim().max(240),
  preferences: runPreferencesSchema,
  summary: z.object({
    mustHave: z.array(z.string().trim().min(1).max(100)).max(8),
    prefer: z.array(z.string().trim().min(1).max(100)).max(8),
    avoid: z.array(z.string().trim().min(1).max(100)).max(8),
  }),
});

export type CriteriaResponse = z.output<typeof criteriaResponseSchema>;

export const CRITERIA_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["assistantReply", "instructions", "preferences", "summary"],
  properties: {
    assistantReply: { type: "string", maxLength: 600 },
    instructions: { type: "string", maxLength: 240 },
    preferences: {
      type: "object",
      additionalProperties: false,
      required: [
        "threshold",
        "targetLeads",
        "maxCandidates",
        "maxConcurrentResearch",
        "weights",
        "acceptedMetals",
        "acceptedCategories",
        "avoidTerms",
        "unwantedMeaningfulPercent",
        "unwantedMeaningfulCount",
        "unwantedLowMax",
        "unwantedMediumMax",
        "unwantedGeneralRejectAbove",
        "unwantedMoissaniteRejectAbove",
      ],
      properties: {
        threshold: { type: "integer", minimum: 0, maximum: 100 },
        targetLeads: { type: "integer", minimum: 1, maximum: 500 },
        maxCandidates: { type: "integer", minimum: 1, maximum: 1000 },
        maxConcurrentResearch: { type: "integer", minimum: 1, maximum: 8 },
        weights: {
          type: "object",
          additionalProperties: false,
          required: [
            "productFit",
            "affordability",
            "inventory",
            "sellerPriority",
            "contactability",
            "presence",
          ],
          properties: {
            productFit: { type: "integer", minimum: 1, maximum: 100 },
            affordability: { type: "integer", minimum: 1, maximum: 100 },
            inventory: { type: "integer", minimum: 1, maximum: 100 },
            sellerPriority: { type: "integer", minimum: 1, maximum: 100 },
            contactability: { type: "integer", minimum: 1, maximum: 100 },
            presence: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
        acceptedMetals: {
          type: "array",
          maxItems: 30,
          items: { type: "string", minLength: 1, maxLength: 80 },
        },
        acceptedCategories: {
          type: "array",
          maxItems: 30,
          items: { type: "string", minLength: 1, maxLength: 80 },
        },
        avoidTerms: {
          type: "array",
          maxItems: 30,
          items: { type: "string", minLength: 1, maxLength: 80 },
        },
        unwantedMeaningfulPercent: { type: "integer", minimum: 0, maximum: 100 },
        unwantedMeaningfulCount: { type: "integer", minimum: 1, maximum: 100 },
        unwantedLowMax: { type: "integer", minimum: 0, maximum: 100 },
        unwantedMediumMax: { type: "integer", minimum: 0, maximum: 200 },
        unwantedGeneralRejectAbove: { type: "integer", minimum: 0, maximum: 100 },
        unwantedMoissaniteRejectAbove: { type: "integer", minimum: 0, maximum: 100 },
      },
    },
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["mustHave", "prefer", "avoid"],
      properties: {
        mustHave: {
          type: "array",
          maxItems: 8,
          items: { type: "string", minLength: 1, maxLength: 100 },
        },
        prefer: {
          type: "array",
          maxItems: 8,
          items: { type: "string", minLength: 1, maxLength: 100 },
        },
        avoid: {
          type: "array",
          maxItems: 8,
          items: { type: "string", minLength: 1, maxLength: 100 },
        },
      },
    },
  },
} as const;

export const CRITERIA_SYSTEM_PROMPT = `
You edit settings for a Canadian jewelry lead-sourcing application.
Translate the user's latest plain-language request into the complete validated settings object supplied in the response.

Rules:
- Canada is a permanent must-have and cannot be removed or weakened.
- Preserve every current value unless the user clearly asks to change it.
- Never add a related preference or exclusion that the user did not state. For example, preferring wholesalers does not imply preferring manufacturers or excluding brands.
- acceptedCategories and acceptedMetals are positive product matches.
- avoidTerms are literal hard exclusions. Add an avoid term only when the user clearly says to exclude or reject it.
- Canonicalize seller-type exclusions to these exact singular terms: manufacturer, wholesaler, retailer, brand_boutique, marketplace_social.
- Put useful requirements that do not map to a structured field into instructions.
- instructions is sent directly to the research provider. Write only a concise business preference, ideally one sentence under 160 characters. Never include meta commentary, implementation directions, or permanent rules already represented elsewhere.
- Treat imported feedback as weak context. A single decision is only a hint. Do not create a new hard exclusion from feedback unless the user asks you to learn from it or the same reason repeats.
- Keep the six positive weights as integers totaling exactly 100. Do not change them unless the user explicitly changes priorities or asks the system to improve the weighting.
- Do not change lead target, candidate budget, threshold, concurrency, or penalty prices unless explicitly requested.
- The assistantReply should briefly say what changed and flag any important ambiguity. Do not claim that a research run started.
- The summary must explain the resulting rules in business language, never as an equation.
`.trim();
