import { NextResponse } from "next/server";
import { z } from "zod";

import { YouClient, YouApiError } from "@/research/you-client";

const weightsSchema = z.object({ productFit: z.number(), affordability: z.number(), inventory: z.number(), sellerPriority: z.number(), contactability: z.number(), presence: z.number() }).strict();
const preferencesSchema = z.object({
  threshold: z.number(), targetLeads: z.number().int().positive(), maxCandidates: z.number().int().positive(), maxConcurrentResearch: z.number().int().positive(), weights: weightsSchema,
  acceptedMetals: z.array(z.string()), acceptedCategories: z.array(z.string()), unwantedMeaningfulPercent: z.number(), unwantedMeaningfulCount: z.number().int().positive(), unwantedLowMax: z.number(), unwantedMediumMax: z.number(), unwantedGeneralRejectAbove: z.number(), unwantedMoissaniteRejectAbove: z.number(),
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
    );
    return NextResponse.json({ candidate });
  } catch (error) {
    if (error instanceof YouApiError || (typeof error === "object" && error !== null && "status" in error)) {
      const status = Number((error as { status: unknown }).status);
      return failure(status === 429 ? 429 : 502, status === 429 ? "Research provider rate limit exceeded" : "Research provider request failed");
    }
    return failure(502, "Research provider request failed");
  }
}

function failure(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
