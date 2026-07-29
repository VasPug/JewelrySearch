import { describe, expect, it, vi } from "vitest";

import type { DiscoveryCandidate, RunPreferences } from "@/domain/types";

import { YouClient } from "./you-client";

const candidate: DiscoveryCandidate = {
  id: "https://northern.example.ca",
  companyName: "Northern Jewelry Co.",
  websiteUrl: "https://northern.example.ca",
  discoverySource: "https://northern.example.ca",
};

const preferences = { acceptedCategories: [], acceptedMetals: [] } as unknown as RunPreferences;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const evidence = <T>(value: T) => ({ value, sourceUrl: "https://example.ca/evidence", confidence: 0.9 });
const researchContent = () => ({
  companyName: evidence("Northern Jewelry Co."), officialWebsite: evidence("https://northern.example.ca"),
  location: { verified: true, address: evidence("Toronto, ON, Canada"), verificationMethod: "official_website", supportingSources: [] },
  sellerType: evidence("manufacturer"), mainProductSegment: evidence("chains"), acceptedMetals: [], catalogSamples: [], readyToShip: evidence(true),
  contacts: { personName: null, personRole: null, phoneNumber: null, genericEmail: null, personalEmail: null, personalEmailStatus: null },
  socials: { linkedinUrl: null, instagramUrl: null, instagramFollowers: null, facebookUrl: null, etsyUrl: null, amazonUrl: null, ebayUrl: null, poshmarkUrl: null, depopUrl: null, pinterestUrl: null, tiktokUrl: null, otherUrls: [] },
  tradeShowParticipation: null, sourceUrls: ["https://example.ca/evidence"],
});

describe("YouClient", () => {
  it("discovers Canadian candidates with an authenticated, bounded search request", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ results: { web: [{ title: "Northern Jewelry Co.", url: "https://northern.example.ca" }] } }));
    const client = new YouClient({ apiKey: "test-key", fetch });

    await expect(client.discoverCandidates("Canadian jewelry", 500)).resolves.toEqual([candidate]);

    const [requestUrl, request] = fetch.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toContain("https://api.you.com/v1/search?");
    expect(new URL(requestUrl).searchParams.get("count")).toBe("100");
    expect(new URL(requestUrl).searchParams.get("country")).toBe("CA");
    expect(new URL(requestUrl).searchParams.has("livecrawl")).toBe(false);
    expect(request?.headers).toMatchObject({ "X-API-Key": "test-key" });
  });

  it("only enables live crawling when requested", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ results: { web: [] } }));
    const client = new YouClient({ apiKey: "test-key", fetch });

    await client.discoverCandidates("Canadian jewelry", 10, { livecrawl: true });

    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("livecrawl")).toBe("web");
  });

  it("submits structured research and preserves discovery identity", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ output: { content: researchContent(), content_type: "object", sources: [] } }));
    const client = new YouClient({ apiKey: "test-key", fetch });

    const result = await client.researchCandidate(candidate, preferences);

    const [requestUrl, request] = fetch.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe("https://api.you.com/v1/research");
    expect(request?.headers).toMatchObject({ "X-API-Key": "test-key", "Content-Type": "application/json" });
    expect(JSON.parse(String(request?.body))).toMatchObject({ research_effort: "standard", output_schema: { type: "object" } });
    expect(result).toMatchObject({ id: candidate.id, discoverySource: candidate.discoverySource, companyName: { value: candidate.companyName } });
  });

  it.each([401, 422])("does not retry non-retryable HTTP %s responses", async (status) => {
    const fetch = vi.fn().mockResolvedValue(json({ message: "bad request" }, status));
    const client = new YouClient({ apiKey: "test-key", fetch, sleep: vi.fn() });

    await expect(client.discoverCandidates("Canadian jewelry", 10)).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500])("retries transient HTTP %s responses up to three attempts", async (status) => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ message: "retry" }, status))
      .mockResolvedValueOnce(json({ message: "retry" }, status))
      .mockResolvedValueOnce(json({ results: { web: [] } }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new YouClient({ apiKey: "test-key", fetch, sleep });

    await expect(client.discoverCandidates("Canadian jewelry", 10)).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("aborts an overdue request", async () => {
    const fetch = vi.fn((_url: string, request?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      (request?.signal as AbortSignal).addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
    }));
    const client = new YouClient({ apiKey: "test-key", fetch, timeoutMs: 1 });

    await expect(client.discoverCandidates("Canadian jewelry", 10)).rejects.toThrow("timed out");
  });

  it("rejects Research responses that do not match the evidence schema", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ output: { content: { ...researchContent(), sourceUrls: [] } } }));
    const client = new YouClient({ apiKey: "test-key", fetch });

    await expect(client.researchCandidate(candidate, preferences)).rejects.toThrow("Research response did not match schema");
  });
});
