import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES } from "@/domain/defaults";
import type { CandidateEvidence, DiscoveryCandidate, RunRecord } from "@/domain/types";
import type { DedupCandidate } from "@/domain/deduplicate";

import {
  reviewImportedLeads,
  runResearch,
  type ResearchGateway,
  type RunStorage,
} from "./orchestrator";

const sourceUrl = "https://example.ca";
const evidence = <T>(value: T) => ({ value, sourceUrl, confidence: 1 });
const candidate = (id: string): DiscoveryCandidate => ({ id, companyName: `Seller ${id}`, websiteUrl: `https://${id}.ca`, discoverySource: sourceUrl });
const researched = (item: DiscoveryCandidate): CandidateEvidence => ({
  id: item.id,
  companyName: evidence(item.companyName),
  officialWebsite: evidence(item.websiteUrl!),
  location: { verified: true, address: evidence("1 Queen St, Toronto, ON, Canada"), verificationMethod: "official_website", supportingSources: [] },
  sellerType: evidence("manufacturer"), mainProductSegment: evidence("chains"), acceptedMetals: [evidence("0.925 sterling silver")],
  catalogSamples: Array.from({ length: 5 }, (_, index) => ({ title: `Chain ${index}`, productUrl: `${item.websiteUrl}/p/${index}`, category: "chains", metal: "0.925 sterling silver", priceCad: 25, available: true, madeToOrder: false, personalized: false, sourceUrl, confidence: 1 })),
  readyToShip: evidence(true),
  contacts: { personName: null, personRole: null, phoneNumber: evidence(`+1 416 555 ${[...item.id].reduce((sum, character) => sum + character.charCodeAt(0), 0).toString().slice(-4).padStart(4, "0")}`), genericEmail: null, personalEmail: null, personalEmailStatus: null },
  socials: { linkedinUrl: null, instagramUrl: null, instagramFollowers: null, facebookUrl: null, etsyUrl: null, amazonUrl: null, ebayUrl: null, poshmarkUrl: null, depopUrl: null, pinterestUrl: null, tiktokUrl: null, otherUrls: [] },
  tradeShowParticipation: evidence(true), discoverySource: sourceUrl, sourceUrls: [sourceUrl],
});

function memoryStorage(priorLeads: DedupCandidate[] = []): RunStorage & { runs: RunRecord[] } {
  const runs: RunRecord[] = [];
  return {
    runs,
    saveRun: vi.fn(async (run) => { runs.push(structuredClone(run)); }),
    listKnownLeads: vi.fn(async () => priorLeads),
    saveQueuedCandidates: vi.fn(async () => undefined),
    clearQueuedCandidates: vi.fn(async () => undefined),
    saveAcceptedLeads: vi.fn(async () => undefined),
  };
}

function gateway(discover: ResearchGateway["discoverCandidates"], research: ResearchGateway["researchCandidate"] = async (item) => researched(item)): ResearchGateway {
  return { discoverCandidates: discover, researchCandidate: research };
}

describe("runResearch", () => {
  it("rotates query families and reaches the target while reporting progress", async () => {
    const progress = vi.fn();
    const run = await runResearch(
      { ...DEFAULT_PREFERENCES, targetLeads: 2, maxCandidates: 4, maxConcurrentResearch: 2 },
      { onProgress: progress },
      { gateway: gateway(vi.fn(async (_query, count) => [candidate(`one-${count}`), candidate(`two-${count}`)])), storage: memoryStorage(), id: () => "run-1" },
    );

    expect(run).toMatchObject({ stage: "export-ready", qualifiedCount: 2, researchedCount: 2 });
    expect(progress).toHaveBeenCalled();
  });

  it("caps concurrent research and continues after individual candidate failures", async () => {
    let active = 0;
    let maximum = 0;
    const research = vi.fn(async (item: DiscoveryCandidate) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      if (item.id === "bad") throw new Error("provider response malformed");
      return researched(item);
    });
    const run = await runResearch(
      { ...DEFAULT_PREFERENCES, targetLeads: 3, maxCandidates: 4, maxConcurrentResearch: 2 },
      {},
      { gateway: gateway(vi.fn(async () => [candidate("one"), candidate("bad"), candidate("two"), candidate("three")]), research), storage: memoryStorage(), id: () => "run-2" },
    );

    expect(maximum).toBeLessThanOrEqual(2);
    expect(run).toMatchObject({ stage: "export-ready", qualifiedCount: 3, researchedCount: 4, rejectedCount: 1 });
  });

  it("deduplicates candidates from the current and prior runs and stops at the research limit", async () => {
    const prior = [{ websiteUrl: "https://prior.ca", companyName: "Prior", phoneNumber: "", instagramUrl: "" }];
    const run = await runResearch(
      { ...DEFAULT_PREFERENCES, targetLeads: 10, maxCandidates: 2, maxConcurrentResearch: 1 },
      {},
      { gateway: gateway(vi.fn(async () => [candidate("prior"), candidate("one"), candidate("one"), candidate("two"), candidate("three")])), storage: memoryStorage(prior), id: () => "run-3" },
    );

    expect(run).toMatchObject({ stage: "exhausted", researchedCount: 2, researchLimitReached: true });
    expect(run.deduplicatedCount).toBeGreaterThanOrEqual(2);
  });

  it("excludes imported historical leads before paid research", async () => {
    const research = vi.fn(async (item: DiscoveryCandidate) => researched(item));
    const storage = memoryStorage([
      { companyName: "Already Searched", websiteUrl: "https://known.ca" },
    ]);

    const known = candidate("known");
    known.companyName = "Already Searched";
    known.websiteUrl = "https://known.ca/products";

    const run = await runResearch(
      { ...DEFAULT_PREFERENCES, targetLeads: 1, maxCandidates: 1 },
      {},
      {
        gateway: gateway(vi.fn(async () => [known, candidate("new")]), research),
        storage,
        id: () => "run-imported",
      },
    );

    expect(research).toHaveBeenCalledOnce();
    expect(research).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new" }),
      expect.objectContaining({ threshold: DEFAULT_PREFERENCES.threshold }),
      "",
    );
    expect(run.deduplicatedCount).toBe(1);
  });

  it("persists an in-progress run and queued candidates before research begins", async () => {
    const storage = memoryStorage();
    await runResearch(
      { ...DEFAULT_PREFERENCES, targetLeads: 1, maxCandidates: 1 },
      {},
      { gateway: gateway(vi.fn(async () => [candidate("one")])), storage, id: () => "run-4" },
    );

    expect(storage.saveRun).toHaveBeenCalled();
    expect(storage.saveQueuedCandidates).toHaveBeenCalledWith("run-4", expect.any(Array));
  });

  it("filters articles before paid research and preserves rejected seller evidence", async () => {
    const article = candidate("article");
    article.companyName = "Top 10 Canadian Jewelry Suppliers";
    article.websiteUrl = "https://example.ca/blog/suppliers";
    const rejected = candidate("rejected");
    const research = vi.fn(async (item: DiscoveryCandidate) => {
      const evidence = researched(item);
      if (item.id === "rejected") evidence.location.verified = false;
      return evidence;
    });

    const run = await runResearch(
      { ...DEFAULT_PREFERENCES, targetLeads: 2, maxCandidates: 1 },
      {},
      {
        gateway: gateway(vi.fn(async () => [article, rejected]), research),
        storage: memoryStorage(),
        id: () => "run-5",
      },
    );

    expect(research).toHaveBeenCalledTimes(1);
    expect(run.rejectionReasons[article.id]).toContain("Search result is an article rather than a seller");
    expect(run.rejectedEvidence[rejected.id]).toMatchObject({ id: rejected.id });
  });
});

describe("reviewImportedLeads", () => {
  it("researches uploaded sellers without running discovery", async () => {
    const discover = vi.fn();
    const research = vi.fn(async (item: DiscoveryCandidate) => {
      const result = researched(item);
      if (item.id === "bad") result.location.verified = false;
      return result;
    });

    const run = await reviewImportedLeads(
      { ...DEFAULT_PREFERENCES, maxCandidates: 2 },
      [
        { id: "good", companyName: "Good Seller", websiteUrl: "https://good.ca", discoverySource: "csv_upload" },
        { id: "bad", companyName: "Bad Seller", websiteUrl: "https://bad.ca", discoverySource: "csv_upload" },
      ],
      {},
      {
        gateway: gateway(discover, research),
        storage: memoryStorage(),
        id: () => "review-1",
        instructions: "Check my prior leads",
      },
    );

    expect(discover).not.toHaveBeenCalled();
    expect(research).toHaveBeenCalledTimes(2);
    expect(research).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      "Check my prior leads",
    );
    expect(run).toMatchObject({
      stage: "export-ready",
      researchedCount: 2,
      qualifiedCount: 1,
      rejectedCount: 1,
    });
  });
});
