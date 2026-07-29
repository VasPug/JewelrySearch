import { isDuplicate, type DedupCandidate } from "@/domain/deduplicate";
import { scoreCandidate } from "@/domain/scoring";
import type { CandidateEvidence, DiscoveryCandidate, QualifiedLead, RunPreferences, RunRecord, RunStage } from "@/domain/types";
import { dashboardDb } from "@/storage/db";

import { discoveryQueries } from "./prompts";
import { prefilterCandidate } from "./prefilter";

export type ResearchGateway = {
  discoverCandidates: (query: string, count: number) => Promise<DiscoveryCandidate[]>;
  researchCandidate: (candidate: DiscoveryCandidate, preferences: RunPreferences) => Promise<CandidateEvidence>;
};

export type RunStorage = {
  saveRun: (run: RunRecord) => Promise<void>;
  listAcceptedLeads: () => Promise<QualifiedLead[]>;
  saveQueuedCandidates: (runId: string, candidates: DiscoveryCandidate[]) => Promise<void>;
  clearQueuedCandidates: (runId: string) => Promise<void>;
  saveAcceptedLeads: (leads: QualifiedLead[]) => Promise<void>;
};

export type RunCallbacks = {
  onProgress?: (run: RunRecord) => void;
  onStage?: (stage: RunStage) => void;
};

export type RunDependencies = { gateway?: ResearchGateway; storage?: RunStorage; id?: () => string };

const DISCOVERY_BATCH_SIZE = 5;

const browserGateway: ResearchGateway = {
  async discoverCandidates(query, count) {
    return requestApi<DiscoveryCandidate[]>("/api/discover", { query, count }, "candidates");
  },
  async researchCandidate(candidate, preferences) {
    return requestApi<CandidateEvidence>("/api/research", { candidate, preferences }, "candidate");
  },
};

const browserStorage: RunStorage = {
  saveRun: (run) => dashboardDb.runs.put(structuredClone(run)).then(() => undefined),
  listAcceptedLeads: () => dashboardDb.acceptedLeads.toArray(),
  saveQueuedCandidates: async (runId, candidates) => {
    await dashboardDb.queuedCandidates.bulkPut(candidates.map((candidate) => ({ id: `${runId}:${candidate.id}`, runId, candidate, queuedAt: new Date().toISOString() })));
  },
  clearQueuedCandidates: (runId) => dashboardDb.queuedCandidates.where("runId").equals(runId).delete().then(() => undefined),
  saveAcceptedLeads: (leads) => dashboardDb.acceptedLeads.bulkPut(leads).then(() => undefined),
};

export async function runResearch(preferences: RunPreferences, callbacks: RunCallbacks = {}, dependencies: RunDependencies = {}): Promise<RunRecord> {
  const gateway = dependencies.gateway ?? browserGateway;
  const storage = dependencies.storage ?? browserStorage;
  const run: RunRecord = {
    id: dependencies.id?.() ?? crypto.randomUUID(), startedAt: new Date().toISOString(), completedAt: null, stage: "discovering", preferences,
    discoveredCount: 0, researchedCount: 0, qualifiedCount: 0, rejectedCount: 0, deduplicatedCount: 0, researchLimitReached: false, leads: [], rejectionReasons: {}, rejectedEvidence: {}, error: null,
  };
  let persistence = Promise.resolve();
  const persist = () => {
    const snapshot = structuredClone(run);
    persistence = persistence.then(() => storage.saveRun(snapshot));
    return persistence;
  };
  const emit = () => callbacks.onProgress?.(structuredClone(run));
  const stage = async (next: RunStage) => { run.stage = next; callbacks.onStage?.(next); emit(); await persist(); };

  try {
    const priorLeads = await storage.listAcceptedLeads();
    const known: DedupCandidate[] = [...priorLeads];
    await persist();
    emit();
    const queries = discoveryQueries();
    let queryIndex = 0;
    let emptyDiscoveries = 0;

    while (run.qualifiedCount < preferences.targetLeads && run.researchedCount < preferences.maxCandidates && emptyDiscoveries < queries.length) {
      await stage("discovering");
      const remaining = preferences.maxCandidates - run.researchedCount;
      const discovered = await gateway.discoverCandidates(queries[queryIndex % queries.length]!, Math.min(DISCOVERY_BATCH_SIZE, remaining));
      queryIndex += 1;
      const fresh = discovered.filter((item) => {
        if (isDuplicate(item, known)) { run.deduplicatedCount += 1; return false; }
        const prefilterReason = prefilterCandidate(item);
        if (prefilterReason) {
          run.rejectedCount += 1;
          run.rejectionReasons[item.id] = [prefilterReason];
          return false;
        }
        known.push(item);
        return true;
      });
      run.discoveredCount += discovered.length;
      emptyDiscoveries = fresh.length === 0 ? emptyDiscoveries + 1 : 0;
      if (fresh.length === 0) { emit(); await persist(); continue; }

      const batch = fresh.slice(0, remaining);
      await storage.saveQueuedCandidates(run.id, batch);
      await stage("verifying");
      await stage("researching");
      await concurrentForEach(batch, preferences.maxConcurrentResearch, async (item) => {
        try {
          const evidence = await gateway.researchCandidate(item, preferences);
          run.researchedCount += 1;
          await stage("scoring");
          const result = scoreCandidate(evidence, preferences);
          known.push(evidence);
          if (result.accepted && run.qualifiedCount < preferences.targetLeads && !isDuplicate(evidence, [...priorLeads, ...run.leads])) {
            const lead = toQualifiedLead(evidence, result.confidence, result.breakdown);
            run.leads.push(lead);
            run.qualifiedCount += 1;
            await storage.saveAcceptedLeads([lead]);
          } else {
            run.rejectedCount += 1;
            run.rejectedEvidence[item.id] = evidence;
            run.rejectionReasons[item.id] = result.reasons.length
              ? result.reasons
              : run.qualifiedCount >= preferences.targetLeads
                ? ["Lead target reached"]
                : ["Duplicate candidate"];
          }
        } catch (error) {
          run.researchedCount += 1;
          run.rejectedCount += 1;
          run.rejectionReasons[item.id] = [error instanceof Error ? error.message : "Candidate research failed"];
        }
        emit();
        await persist();
      });
      await storage.clearQueuedCandidates(run.id);
    }
    run.researchLimitReached = run.researchedCount >= preferences.maxCandidates;
    await stage(run.qualifiedCount >= preferences.targetLeads ? "export-ready" : "exhausted");
  } catch (error) {
    run.error = error instanceof Error ? error.message : "Run failed";
    await stage("failed");
  }
  run.completedAt = new Date().toISOString();
  await persist();
  emit();
  return run;
}

async function concurrentForEach<T>(items: T[], requestedConcurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const concurrency = Math.max(1, Math.min(Math.floor(requestedConcurrency) || 1, items.length));
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item) await worker(item);
    }
  }));
}

async function requestApi<T>(url: string, body: unknown, key: string): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("Research service request failed");
  const payload = await response.json() as Record<string, unknown>;
  return payload[key] as T;
}

export function toQualifiedLead(candidate: CandidateEvidence, confidenceScore: number, scoreBreakdown: QualifiedLead["scoreBreakdown"]): QualifiedLead {
  const social = (value: { value: string } | null) => value?.value ?? "";
  return {
    personName: candidate.contacts.personName?.value ?? "", personRole: candidate.contacts.personRole?.value ?? "", companyName: candidate.companyName.value,
    phoneNumber: candidate.contacts.phoneNumber?.value ?? "", genericEmail: candidate.contacts.genericEmail?.value ?? "", personalEmail: candidate.contacts.personalEmail?.value ?? "",
    personalEmailStatus: candidate.contacts.personalEmailStatus ?? "", personalEmailConfidence: candidate.contacts.personalEmail?.confidence ?? "", countryCode: "CA", recordType: "outbound_seller", leadStatus: "unqualified", leadSource: candidate.discoverySource,
    sellerType: candidate.sellerType?.value ?? "", mainProductSegment: candidate.mainProductSegment?.value ?? "", pricingTier: "", websiteUrl: candidate.officialWebsite?.value ?? "",
    linkedinUrl: social(candidate.socials.linkedinUrl), instagramUrl: social(candidate.socials.instagramUrl), instagramFollowers: candidate.socials.instagramFollowers?.value.toString() ?? "", facebookUrl: social(candidate.socials.facebookUrl), etsyUrl: social(candidate.socials.etsyUrl), amazonUrl: social(candidate.socials.amazonUrl), ebayUrl: social(candidate.socials.ebayUrl), poshmarkUrl: social(candidate.socials.poshmarkUrl), depopUrl: social(candidate.socials.depopUrl), pinterestUrl: social(candidate.socials.pinterestUrl), tiktokUrl: social(candidate.socials.tiktokUrl), otherSocialUrls: candidate.socials.otherUrls.map((item) => item.value).join(";"),
    description: candidate.mainProductSegment?.value ?? "", confidenceScore, scoreBreakdown, evidenceUrls: candidate.sourceUrls, dateResearched: new Date().toISOString(),
  };
}
