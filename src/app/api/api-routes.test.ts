import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES } from "@/domain/defaults";

const discoverCandidates = vi.fn();
const researchCandidate = vi.fn();

vi.mock("@/research/you-client", () => ({
  YouClient: class { discoverCandidates = discoverCandidates; researchCandidate = researchCandidate; },
  YouApiError: class YouApiError extends Error { constructor(message: string, public status: number) { super(message); } },
}));

import { GET as health } from "./health/route";
import { POST as discover } from "./discover/route";
import { POST as research } from "./research/route";

const request = (path: string, body: unknown) => new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const candidate = { id: "north", companyName: "North Star", websiteUrl: "https://north.ca", discoverySource: "https://north.ca" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("research API routes", () => {
  it("reports configuration without revealing the API key", async () => {
    vi.stubEnv("YDC_API_KEY", "YDC_API_KEY-should-never-leak");
    const response = await health();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toBe('{"configured":true}');
    expect(body).not.toContain("YDC_API_KEY-should-never-leak");
  });

  it("validates discovery input and returns provider candidates", async () => {
    vi.stubEnv("YDC_API_KEY", "test-key");
    discoverCandidates.mockResolvedValue([candidate]);

    const valid = await discover(request("/api/discover", { query: "Canadian chains", count: 10 }));
    const invalid = await discover(request("/api/discover", { query: "", count: -1 }));

    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ candidates: [candidate] });
    expect(invalid.status).toBe(400);
  });

  it("maps missing configuration and provider failures without returning secrets", async () => {
    const missing = await discover(request("/api/discover", { query: "Canadian chains", count: 1 }));
    vi.stubEnv("YDC_API_KEY", "private-key");
    discoverCandidates.mockRejectedValue({ status: 429, message: "private-key" });
    const limited = await discover(request("/api/discover", { query: "Canadian chains", count: 1 }));

    expect(missing.status).toBe(503);
    expect(limited.status).toBe(429);
    expect(await limited.text()).not.toContain("private-key");
  });

  it("returns researched evidence and maps permanent provider errors to 502", async () => {
    vi.stubEnv("YDC_API_KEY", "test-key");
    researchCandidate.mockResolvedValue({ id: "north", companyName: { value: "North Star" } });
    const successful = await research(request("/api/research", {
      candidate,
      preferences: DEFAULT_PREFERENCES,
      instructions: "Review this uploaded lead",
    }));
    researchCandidate.mockRejectedValue({ status: 422, message: "bad request" });
    const failed = await research(request("/api/research", { candidate, preferences: DEFAULT_PREFERENCES }));

    expect(successful.status).toBe(200);
    expect(await successful.json()).toEqual({ candidate: { id: "north", companyName: { value: "North Star" } } });
    expect(researchCandidate).toHaveBeenCalledWith(
      candidate,
      DEFAULT_PREFERENCES,
      "Review this uploaded lead",
      expect.any(AbortSignal),
    );
    expect(failed.status).toBe(502);
  });
});
