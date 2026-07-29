import { NextResponse } from "next/server";
import { z } from "zod";

import { YouClient, YouApiError } from "@/research/you-client";

const requestSchema = z.object({
  query: z.string().trim().min(2).max(500),
  count: z.number().int().min(1).max(100),
  livecrawl: z.boolean().optional(),
}).strict();

export async function POST(request: Request) {
  const parsed = await parseRequest(request, requestSchema);
  if (!parsed.success) return parsed.response;
  if (!process.env.YDC_API_KEY) return failure(503, "Research provider is not configured");

  try {
    const candidates = await new YouClient().discoverCandidates(
      parsed.data.query,
      parsed.data.count,
      { livecrawl: parsed.data.livecrawl },
      request.signal,
    );
    return NextResponse.json({ candidates });
  } catch (error) {
    return providerFailure(error);
  }
}

async function parseRequest<T extends z.ZodType>(request: Request, schema: T): Promise<{ success: true; data: z.output<T> } | { success: false; response: NextResponse }> {
  const body = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, response: failure(400, "Invalid request payload") };
}

function failure(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function providerFailure(error: unknown) {
  if (error instanceof YouApiError || (typeof error === "object" && error !== null && "status" in error)) {
    const status = Number((error as { status: unknown }).status);
    return failure(status === 429 ? 429 : 502, status === 429 ? "Research provider rate limit exceeded" : "Research provider request failed");
  }
  return failure(502, "Research provider request failed");
}
