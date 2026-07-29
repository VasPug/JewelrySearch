import { isDuplicate, type DedupCandidate } from "@/domain/deduplicate";
import { scoreCandidate } from "@/domain/scoring";
import type { CandidateEvidence, CandidateMemory, DiscoveryCandidate, QualifiedLead, RunPreferences, RunRecord, RunStage } from "@/domain/types";
import { dashboardDb } from "@/storage/db";

import { discoveryQueries } from "./prompts";
import { prefilterCandidate } from "./prefilter";

export type ResearchGateway = {
  discoverCandidates: (query: string, count: number, signal?: AbortSignal) => Promise<DiscoveryCandidate[]>;
  researchCandidate: (candidate: DiscoveryCandidate, preferences: RunPreferences, instructions: string, signal?: AbortSignal) => Promise<CandidateEvidence>;
};

export type RunStorage = {
  saveRun: (run: RunRecord) => Promise<void>;
  listKnownLeads: () => Promise<DedupCandidate[]>;
  saveQueuedCandidates: (runId: string, candidates: DiscoveryCandidate[]) => Promise<void>;
  clearQueuedCandidates: (runId: string) => Promise<void>;
  saveAcceptedLeads: (leads: QualifiedLead[]) => Promise<void>;
  saveCandidateMemory: (candidates: CandidateMemory[]) => Promise<void>;
};

export type RunCallbacks = {
  onProgress?: (run: RunRecord) => void;
  onStage?: (stage: RunStage) => void;
};

export type RunDependencies = {
  gateway?: ResearchGateway;
  storage?: RunStorage;
  id?: () => string;
  instructions?: string;
  signal?: AbortSignal;
};

const DISCOVERY_BATCH_SIZE = 5;

const browserGateway: ResearchGateway = {
  async discoverCandidates(query, count, signal) {
    return requestApi<DiscoveryCandidate[]>("/api/discover", { query, count }, "candidates", signal);
  },
  async researchCandidate(candidate, preferences, instructions, signal) {
    return requestApi<CandidateEvidence>("/api/research", { candidate, preferences, instructions }, "candidate", signal);
  },
};

const browserStorage: RunStorage = {
  saveRun: (run) => dashboardDb.runs.put(structuredClone(run)).then(() => undefined),
  listKnownLeads: async () => [
    ...(await dashboardDb.acceptedLeads.toArray()),
    ...(await dashboardDb.importedLeads.toArray()),
    ...(await dashboardDb.candidateMemory.toArray()),
  ],
  saveQueuedCandidates: async (runId, candidates) => {
    await dashboardDb.queuedCandidates.bulkPut(candidates.map((candidate) => ({ id: `${runId}:${candidate.id}`, runId, candidate, queuedAt: new Date().toISOString() })));
  },
  clearQueuedCandidates: (runId) => dashboardDb.queuedCandidates.where("runId").equals(runId).delete().then(() => undefined),
  saveAcceptedLeads: (leads) => dashboardDb.acceptedLeads.bulkPut(leads).then(() => undefined),
  saveCandidateMemory: (candidates) => dashboardDb.candidateMemory.bulkPut(candidates).then(() => undefined),
};

export async function runResearch(preferences: RunPreferences, callbacks: RunCallbacks = {}, dependencies: RunDependencies = {}): Promise<RunRecord> {
  const gateway = dependencies.gateway ?? browserGateway;
  const storage = dependencies.storage ?? browserStorage;
  const instructions = dependencies.instructions?.trim().slice(0, 240) ?? "";
  const signal = dependencies.signal;
  const run: RunRecord = {
    id: dependencies.id?.() ?? crypto.randomUUID(), startedAt: new Date().toISOString(), completedAt: null, stage: "discovering", preferences,
    outcome: null, discoveredCount: 0, researchedCount: 0, qualifiedCount: 0, rejectedCount: 0, deduplicatedCount: 0, researchLimitReached: false, leads: [], rejectionReasons: {}, rejectedEvidence: {}, error: null,
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
    throwIfAborted(signal);
    const priorLeads = await storage.listKnownLeads();
    const known: DedupCandidate[] = [...priorLeads];
    await persist();
    emit();
    const avoidQuery = preferences.avoidTerms
      .map((term) => `-"${term.replaceAll('"', "")}"`)
      .join(" ");
    const queries = discoveryQueries().map((query) =>
      [query, instructions, avoidQuery].filter(Boolean).join(" ").slice(0, 500),
    );
    let queryIndex = 0;
    let emptyDiscoveries = 0;

    while (run.qualifiedCount < preferences.targetLeads && run.researchedCount < preferences.maxCandidates && emptyDiscoveries < queries.length) {
      await stage("discovering");
      throwIfAborted(signal);
      const remaining = preferences.maxCandidates - run.researchedCount;
      const discovered = await gateway.discoverCandidates(queries[queryIndex % queries.length]!, Math.min(DISCOVERY_BATCH_SIZE, remaining), signal);
      queryIndex += 1;
      const prefilterMemories: CandidateMemory[] = [];
      const fresh = discovered.filter((item) => {
        if (isDuplicate(item, known)) { run.deduplicatedCount += 1; return false; }
        const prefilterReason = prefilterCandidate(item);
        if (prefilterReason) {
          run.rejectedCount += 1;
          run.rejectionReasons[item.id] = [prefilterReason];
          prefilterMemories.push(memory(item, "rejected", prefilterReason, run.id));
          return false;
        }
        known.push(item);
        return true;
      });
      if (prefilterMemories.length) await storage.saveCandidateMemory(prefilterMemories);
      run.discoveredCount += discovered.length;
      emptyDiscoveries = fresh.length === 0 ? emptyDiscoveries + 1 : 0;
      if (fresh.length === 0) { emit(); await persist(); continue; }

      const batch = fresh.slice(0, remaining);
      await storage.saveQueuedCandidates(run.id, batch);
      await stage("verifying");
      await stage("researching");
      await concurrentForEach(batch, preferences.maxConcurrentResearch, async (item) => {
        throwIfAborted(signal);
        try {
          const evidence = await gateway.researchCandidate(item, preferences, instructions, signal);
          throwIfAborted(signal);
          run.researchedCount += 1;
          await stage("scoring");
          const result = scoreCandidate(evidence, preferences);
          known.push(evidence);
          if (result.accepted && run.qualifiedCount < preferences.targetLeads && !isDuplicate(evidence, [...priorLeads, ...run.leads])) {
            const lead = toQualifiedLead(evidence, result.confidence, result.breakdown);
            run.leads.push(lead);
            run.qualifiedCount += 1;
            await storage.saveAcceptedLeads([lead]);
            await storage.saveCandidateMemory([memory(item, "accepted", "", run.id)]);
          } else {
            run.rejectedCount += 1;
            run.rejectedEvidence[item.id] = evidence;
            run.rejectionReasons[item.id] = result.reasons.length
              ? result.reasons
              : run.qualifiedCount >= preferences.targetLeads
                ? ["Lead target reached"]
                : ["Duplicate candidate"];
            await storage.saveCandidateMemory([
              memory(item, "rejected", run.rejectionReasons[item.id]!.join("; "), run.id),
            ]);
          }
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) throw error;
          run.researchedCount += 1;
          run.rejectedCount += 1;
          run.rejectionReasons[item.id] = [error instanceof Error ? error.message : "Candidate research failed"];
          await storage.saveCandidateMemory([
            memory(item, "rejected", run.rejectionReasons[item.id]!.join("; "), run.id),
          ]);
        }
        emit();
        await persist();
      });
    }
    run.researchLimitReached = run.researchedCount >= preferences.maxCandidates;
    if (run.qualifiedCount >= preferences.targetLeads) {
      run.outcome = "target_reached";
      await stage("export-ready");
    } else {
      run.outcome = run.researchLimitReached ? "candidate_budget_reached" : "search_exhausted";
      await stage("exhausted");
    }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      run.outcome = "cancelled";
      await stage("cancelled");
    } else {
      run.error = error instanceof Error ? error.message : "Run failed";
      run.outcome = "failed";
      await stage("failed");
    }
  } finally {
    await storage.clearQueuedCandidates(run.id);
  }
  run.completedAt = new Date().toISOString();
  await persist();
  emit();
  return run;
}

export async function reviewImportedLeads(
  preferences: RunPreferences,
  candidates: DiscoveryCandidate[],
  callbacks: RunCallbacks = {},
  dependencies: RunDependencies = {},
): Promise<RunRecord> {
  const gateway = dependencies.gateway ?? browserGateway;
  const storage = dependencies.storage ?? browserStorage;
  const instructions = dependencies.instructions?.trim().slice(0, 240) ?? "";
  const signal = dependencies.signal;
  const batch = candidates.slice(0, preferences.maxCandidates);
  const run: RunRecord = {
    id: dependencies.id?.() ?? crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    stage: "researching",
    outcome: null,
    preferences,
    discoveredCount: candidates.length,
    researchedCount: 0,
    qualifiedCount: 0,
    rejectedCount: 0,
    deduplicatedCount: 0,
    researchLimitReached: false,
    leads: [],
    rejectionReasons: {},
    rejectedEvidence: {},
    error: null,
  };

  const emit = () => callbacks.onProgress?.(structuredClone(run));
  const persist = async () => {
    emit();
    await storage.saveRun(structuredClone(run));
  };

  try {
    throwIfAborted(signal);
    await storage.saveQueuedCandidates(run.id, batch);
    await persist();
    await concurrentForEach(batch, preferences.maxConcurrentResearch, async (item) => {
      throwIfAborted(signal);
      try {
        const evidence = await gateway.researchCandidate(item, preferences, instructions, signal);
        throwIfAborted(signal);
        const result = scoreCandidate(evidence, preferences);
        run.researchedCount += 1;
        if (result.accepted) {
          const lead = toQualifiedLead(evidence, result.confidence, result.breakdown);
          run.leads.push(lead);
          run.qualifiedCount += 1;
          await storage.saveAcceptedLeads([lead]);
          await storage.saveCandidateMemory([memory(item, "accepted", "", run.id)]);
        } else {
          run.rejectedCount += 1;
          run.rejectedEvidence[item.id] = evidence;
          run.rejectionReasons[item.id] = result.reasons;
          await storage.saveCandidateMemory([
            memory(item, "rejected", result.reasons.join("; "), run.id),
          ]);
        }
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw error;
        run.researchedCount += 1;
        run.rejectedCount += 1;
        run.rejectionReasons[item.id] = [
          error instanceof Error ? error.message : "Candidate research failed",
        ];
        await storage.saveCandidateMemory([
          memory(item, "rejected", run.rejectionReasons[item.id]!.join("; "), run.id),
        ]);
      }
      await persist();
    });
    run.researchLimitReached = candidates.length > batch.length;
    run.outcome = run.researchLimitReached ? "candidate_budget_reached" : "completed";
    run.stage = run.researchLimitReached ? "exhausted" : "export-ready";
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      run.outcome = "cancelled";
      run.stage = "cancelled";
    } else {
      run.error = error instanceof Error ? error.message : "Run failed";
      run.outcome = "failed";
      run.stage = "failed";
    }
  } finally {
    await storage.clearQueuedCandidates(run.id);
  }

  run.completedAt = new Date().toISOString();
  await persist();
  return run;
}

async function concurrentForEach<T>(items: T[], requestedConcurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const concurrency = Math.max(1, Math.min(Math.floor(requestedConcurrency) || 1, items.length));
  const results = await Promise.allSettled(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item) await worker(item);
    }
  }));
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
}

async function requestApi<T>(url: string, body: unknown, key: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok) throw new Error("Research service request failed");
  const payload = await response.json() as Record<string, unknown>;
  return payload[key] as T;
}

function memory(
  candidate: DiscoveryCandidate,
  outcome: CandidateMemory["outcome"],
  reason: string,
  runId: string | null,
): CandidateMemory {
  return {
    id: candidate.id,
    companyName: candidate.companyName,
    websiteUrl: candidate.websiteUrl,
    outcome,
    reason,
    runId,
    updatedAt: new Date().toISOString(),
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Run cancelled", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
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
