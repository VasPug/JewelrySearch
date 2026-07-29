import type { CandidateEvidence, DiscoveryCandidate, RunPreferences } from "@/domain/types";

import { candidateResearchPrompt } from "./prompts";
import { RESEARCH_OUTPUT_SCHEMA, researchOutputSchema, toCandidateEvidence } from "./schema";

const SEARCH_URL = "https://api.you.com/v1/search";
const RESEARCH_URL = "https://api.you.com/v1/research";
const MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export class YouApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "YouApiError";
  }
}

export type YouClientOptions = {
  apiKey?: string;
  fetch?: FetchFn;
  timeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class YouClient {
  private readonly apiKey: string | undefined;
  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: YouClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.YDC_API_KEY;
    this.fetchFn = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async discoverCandidates(
    query: string,
    count: number,
    options: { livecrawl?: boolean } = {},
  ): Promise<DiscoveryCandidate[]> {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("query", query);
    url.searchParams.set("count", String(Math.min(Math.max(Math.floor(count), 1), 100)));
    url.searchParams.set("country", "CA");
    if (options.livecrawl) url.searchParams.set("livecrawl", "web");

    const payload = await this.request(url.toString());
    const webResults = readWebResults(payload);
    return webResults.flatMap((result) => {
      if (!isUrl(result.url) || typeof result.title !== "string" || !result.title.trim()) return [];
      return [{
        id: result.url,
        companyName: result.title.trim(),
        websiteUrl: result.url,
        discoverySource: result.url,
      }];
    });
  }

  async researchCandidate(
    candidate: DiscoveryCandidate,
    preferences: RunPreferences,
  ): Promise<CandidateEvidence> {
    const payload = await this.request(RESEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: candidateResearchPrompt(candidate, preferences),
        research_effort: "lite",
        source_control: { country: "CA" },
        output_schema: RESEARCH_OUTPUT_SCHEMA,
      }),
    });
    const content = isRecord(payload) && isRecord(payload.output) ? payload.output.content : undefined;
    const parsed = researchOutputSchema.safeParse(content);
    if (!parsed.success) {
      throw new Error(`Research response did not match schema: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
    }
    return toCandidateEvidence(parsed.data, candidate.id, candidate.discoverySource);
  }

  private async request(url: string, init: RequestInit = {}): Promise<unknown> {
    if (!this.apiKey) throw new Error("YDC_API_KEY is required for You.com requests");

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchFn(url, {
          ...init,
          headers: { "X-API-Key": this.apiKey, ...init.headers },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (response.ok) return payload;

        const message = responseMessage(payload, response.status);
        if (!isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS) {
          throw new YouApiError(message, response.status);
        }
      } catch (error) {
        if (controller.signal.aborted) throw new Error("You.com request timed out");
        if (error instanceof YouApiError || attempt === MAX_ATTEMPTS) throw error;
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      await this.sleep(100 * attempt);
    }
    throw new Error("You.com request exhausted retries");
  }
}

function readWebResults(payload: unknown): Array<{ title?: unknown; url?: unknown }> {
  if (!isRecord(payload) || !isRecord(payload.results) || !Array.isArray(payload.results.web)) return [];
  return payload.results.web.filter(isRecord);
}

function responseMessage(payload: unknown, status: number): string {
  if (isRecord(payload) && typeof payload.message === "string") return payload.message;
  return `You.com request failed with HTTP ${status}`;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
