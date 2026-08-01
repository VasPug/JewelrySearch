import { NextResponse } from "next/server";
import { z } from "zod";

import { YouClient, YouApiError } from "@/research/you-client";

export const maxDuration = 300;

const weightsSchema = z.object({ productFit: z.number(), affordability: z.number(), inventory: z.number(), sellerPriority: z.number(), contactability: z.number(), presence: z.number() }).strict();
const preferencesSchema = z.object({
  threshold: z.number(), targetLeads: z.number().int().positive(), maxCandidates: z.number().int().positive(), maxConcurrentResearch: z.number().int().positive(), weights: weightsSchema,
  acceptedMetals: z.array(z.string()), acceptedCategories: z.array(z.string()), avoidTerms: z.array(z.string()).default([]), unwantedMeaningfulPercent: z.number(), unwantedMeaningfulCount: z.number().int().positive(), unwantedLowMax: z.number(), unwantedMediumMax: z.number(), unwantedGeneralRejectAbove: z.number(), unwantedMoissaniteRejectAbove: z.number(),
}).strict();
const requestSchema = z.object({
  candidate: z.object({ id: z.string().min(1), companyName: z.string().min(1), websiteUrl: z.string().url().nullable(), discoverySource: z.string().min(1) }).strict(),
  preferences: preferencesSchema,
  instructions: z.string().trim().max(240).optional().default(""),
}).strict();

export async function POST(request: Request) {
  const body = await request.json().catch(() => undefined);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return failure(400, "Invalid request payload");
  if (!process.env.YDC_API_KEY) return failure(503, "Research provider is not configured");

  try {
    const candidate = await new YouClient().researchCandidate(
      parsed.data.candidate,
      parsed.data.preferences,
      parsed.data.instructions,
      request.signal,
    );
    return NextResponse.json({ candidate });
  } catch (error) {
    if (error instanceof YouApiError || (typeof error === "object" && error !== null && "status" in error)) {
      const status = Number((error as { status: unknown }).status);
      return providerFailure(status);
    }
    if (error instanceof Error && /did not match schema/i.test(error.message)) {
      return failure(502, "You.com returned evidence in an unexpected format. Retry this seller.", "invalid_provider_response", true);
    }
    return failure(502, "You.com research could not be completed. Retry this seller.", "provider_unavailable", true);
  }
}

function providerFailure(status: number) {
  if (status === 400 || status === 422) {
    return failure(status, "You.com rejected the research request. The request parameters or evidence schema need attention.", "invalid_provider_request", false);
  }
  if (status === 401) {
    return failure(401, "You.com rejected the API key. Verify YDC_API_KEY, then retry.", "provider_authentication", false);
  }
  if (status === 402) {
    return failure(402, "The You.com account has insufficient credits. Add credits, then retry.", "provider_quota", false);
  }
  if (status === 403) {
    return failure(403, "The You.com API key does not have permission to use Research API.", "provider_permission", false);
  }
  if (status === 429) {
    return failure(429, "You.com is rate-limiting research requests. Wait a moment, then retry.", "provider_rate_limit", true);
  }
  if (status === 504) {
    return failure(504, "You.com research timed out after three attempts. Retry this seller.", "provider_timeout", true);
  }
  return failure(502, "You.com research is temporarily unavailable after three attempts. Retry this seller.", "provider_unavailable", true);
}

function failure(status: number, error: string, code = "request_failed", retryable = false) {
  return NextResponse.json({ error, code, retryable }, { status });
}
