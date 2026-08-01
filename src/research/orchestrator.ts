import { isDuplicate, type DedupCandidate } from "@/domain/deduplicate";
import { scoreCandidate } from "@/domain/scoring";
import type {
  CandidateEvidence,
  CandidateMemory,
  DiscoveryCandidate,
  QualifiedLead,
  RunActivity,
  RunIssue,
  RunIssueKind,
  RunPreferences,
  RunRecord,
  RunStage,
} from "@/domain/types";
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
  seedRun?: RunRecord;
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
    issues: [], activity: [], activeCandidates: [],
  };
  let persistence = Promise.resolve();
  const persist = () => {
    const snapshot = structuredClone(run);
    persistence = persistence.then(() => storage.saveRun(snapshot));
    return persistence;
  };
  const emit = () => callbacks.onProgress?.(structuredClone(run));
  addActivity(run, "stage", "Search started");
  const stage = async (next: RunStage) => {
    run.stage = next;
    addActivity(run, "stage", stageActivityMessage(next));
    callbacks.onStage?.(next);
    emit();
    await persist();
  };

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
      addActivity(
        run,
        "discovery",
        discovered.length === 1 ? "Discovered 1 seller" : `Discovered ${discovered.length} sellers`,
      );
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
        setCandidateActive(run, item, true);
        addActivity(run, "candidate", `Checking ${item.companyName}`);
        emit();
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
            addActivity(run, "accepted", `Accepted ${item.companyName}`);
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
            addActivity(run, "rejected", `Did not qualify ${item.companyName}`);
            await storage.saveCandidateMemory([
              memory(item, "rejected", run.rejectionReasons[item.id]!.join("; "), run.id),
            ]);
          }
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) throw error;
          run.researchedCount += 1;
          const issue = createRunIssue(error, run.stage, item);
          run.issues = [...(run.issues ?? []), issue];
          addActivity(run, "issue", `Could not check ${item.companyName}: ${issue.message}`);
        } finally {
          setCandidateActive(run, item, false);
        }
        emit();
        await persist();
      });
    }
    run.researchLimitReached = run.researchedCount >= preferences.maxCandidates;
    if (run.qualifiedCount >= preferences.targetLeads) {
      run.outcome = "target_reached";
      addActivity(run, "complete", `Lead target reached with ${run.qualifiedCount} accepted sellers`);
      await stage("export-ready");
    } else if ((run.issues?.length ?? 0) > 0 && hasUsableResearch(run)) {
      run.outcome = "partial";
      addActivity(run, "complete", "Search finished with partial results");
      await stage("exhausted");
    } else if ((run.issues?.length ?? 0) > 0) {
      run.error = primaryIssueMessage(run);
      run.outcome = "failed";
      addActivity(run, "complete", "Search failed before any candidate could be evaluated");
      await stage("failed");
    } else {
      run.outcome = run.researchLimitReached ? "candidate_budget_reached" : "search_exhausted";
      addActivity(run, "complete", run.researchLimitReached ? "Candidate budget reached" : "No new sellers remained");
      await stage("exhausted");
    }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      run.outcome = "cancelled";
      await stage("cancelled");
    } else {
      const issue = createRunIssue(error, run.stage, null);
      run.issues = [...(run.issues ?? []), issue];
      run.error = issue.message;
      run.outcome = "failed";
      addActivity(run, "issue", issue.message);
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
  const seedRun = dependencies.seedRun;
  const retriedIds = new Set(batch.map((candidate) => candidate.id));
  const run: RunRecord = {
    id: dependencies.id?.() ?? crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    stage: "researching",
    outcome: null,
    preferences,
    discoveredCount: seedRun?.discoveredCount ?? candidates.length,
    researchedCount: seedRun?.researchedCount ?? 0,
    qualifiedCount: seedRun?.qualifiedCount ?? 0,
    rejectedCount: seedRun?.rejectedCount ?? 0,
    deduplicatedCount: seedRun?.deduplicatedCount ?? 0,
    researchLimitReached: false,
    leads: structuredClone(seedRun?.leads ?? []),
    rejectionReasons: structuredClone(seedRun?.rejectionReasons ?? {}),
    rejectedEvidence: structuredClone(seedRun?.rejectedEvidence ?? {}),
    error: null,
    issues: (seedRun?.issues ?? []).filter(
      (issue) => !issue.candidate || !retriedIds.has(issue.candidate.id),
    ),
    activity: structuredClone(seedRun?.activity ?? []),
    activeCandidates: [],
  };
  addActivity(
    run,
    "stage",
    seedRun ? `Retrying ${batch.length} failed seller${batch.length === 1 ? "" : "s"}` : "Imported lead review started",
  );

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
      setCandidateActive(run, item, true);
      addActivity(run, "candidate", `Checking ${item.companyName}`);
      emit();
      try {
        const evidence = await gateway.researchCandidate(item, preferences, instructions, signal);
        throwIfAborted(signal);
        const result = scoreCandidate(evidence, preferences);
        run.researchedCount += 1;
        if (result.accepted) {
          const lead = toQualifiedLead(evidence, result.confidence, result.breakdown);
          run.leads.push(lead);
          run.qualifiedCount += 1;
          addActivity(run, "accepted", `Accepted ${item.companyName}`);
          await storage.saveAcceptedLeads([lead]);
          await storage.saveCandidateMemory([memory(item, "accepted", "", run.id)]);
        } else {
          run.rejectedCount += 1;
          run.rejectedEvidence[item.id] = evidence;
          run.rejectionReasons[item.id] = result.reasons;
          addActivity(run, "rejected", `Did not qualify ${item.companyName}`);
          await storage.saveCandidateMemory([
            memory(item, "rejected", result.reasons.join("; "), run.id),
          ]);
        }
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw error;
        run.researchedCount += 1;
        const issue = createRunIssue(error, run.stage, item);
        run.issues = [...(run.issues ?? []), issue];
        addActivity(run, "issue", `Could not check ${item.companyName}: ${issue.message}`);
      } finally {
        setCandidateActive(run, item, false);
      }
      await persist();
    });
    run.researchLimitReached = candidates.length > batch.length;
    if (run.qualifiedCount >= preferences.targetLeads) {
      run.outcome = "target_reached";
      run.stage = "export-ready";
      addActivity(run, "complete", `Lead target reached with ${run.qualifiedCount} accepted sellers`);
    } else if ((run.issues?.length ?? 0) > 0 && hasUsableResearch(run)) {
      run.outcome = "partial";
      run.stage = "exhausted";
      addActivity(run, "complete", "Review finished with partial results");
    } else if ((run.issues?.length ?? 0) > 0) {
      run.error = primaryIssueMessage(run);
      run.outcome = "failed";
      run.stage = "failed";
      addActivity(run, "complete", "Review failed before any seller could be evaluated");
    } else {
      run.outcome = run.researchLimitReached ? "candidate_budget_reached" : "completed";
      run.stage = run.researchLimitReached ? "exhausted" : "export-ready";
      addActivity(run, "complete", run.researchLimitReached ? "Candidate budget reached" : "Imported lead review complete");
    }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      run.outcome = "cancelled";
      run.stage = "cancelled";
    } else {
      const issue = createRunIssue(error, run.stage, null);
      run.issues = [...(run.issues ?? []), issue];
      run.error = issue.message;
      run.outcome = "failed";
      run.stage = "failed";
      addActivity(run, "issue", issue.message);
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
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error;
    throw new ResearchServiceError(
      "The network connection was interrupted. Check your connection, then retry.",
      "network",
      true,
    );
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const providerMessage = payload && typeof payload.error === "string" ? payload.error : "";
    throw researchResponseError(response.status, providerMessage);
  }
  if (!payload || !(key in payload)) {
    throw new ResearchServiceError(
      "The research provider returned an incomplete response. Retry this search.",
      "provider",
      true,
    );
  }
  return payload[key] as T;
}

class ResearchServiceError extends Error {
  constructor(
    message: string,
    readonly kind: RunIssueKind,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ResearchServiceError";
  }
}

function researchResponseError(status: number, providerMessage: string): ResearchServiceError {
  if (status === 429) {
    return new ResearchServiceError(
      "The research provider is rate-limiting requests. Wait a moment, then retry.",
      "rate_limit",
      true,
    );
  }
  if (status === 503 || /not configured/i.test(providerMessage)) {
    return new ResearchServiceError(
      "Web research is not configured. Add YDC_API_KEY, then retry.",
      "configuration",
      false,
    );
  }
  if (status === 400 || status === 422) {
    return new ResearchServiceError(
      "The research request could not be processed. Review the search brief, then retry.",
      "validation",
      true,
    );
  }
  return new ResearchServiceError(
    providerMessage || "The research provider could not complete the request. Retry the search.",
    "provider",
    status >= 500,
  );
}

function createRunIssue(
  error: unknown,
  stage: RunStage,
  candidate: DiscoveryCandidate | null,
): RunIssue {
  const serviceError = error instanceof ResearchServiceError ? error : null;
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    stage,
    scope: candidate ? "candidate" : "run",
    kind: serviceError?.kind ?? "unknown",
    message: serviceError?.message ?? (error instanceof Error ? error.message : "Research failed unexpectedly."),
    retryable: serviceError?.retryable ?? true,
    candidate: candidate ? structuredClone(candidate) : null,
  };
}

function addActivity(run: RunRecord, kind: RunActivity["kind"], message: string): void {
  const current = run.activity ?? [];
  const previous = current.at(-1);
  if (previous?.kind === kind && previous.message === message) return;
  run.activity = [...current, {
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    kind,
    message,
  }].slice(-40);
}

function setCandidateActive(run: RunRecord, candidate: DiscoveryCandidate, active: boolean): void {
  const current = run.activeCandidates ?? [];
  run.activeCandidates = active
    ? [...current.filter((item) => item.id !== candidate.id), {
        id: candidate.id,
        companyName: candidate.companyName,
      }]
    : current.filter((item) => item.id !== candidate.id);
}

function stageActivityMessage(stage: RunStage): string {
  if (stage === "discovering") return "Looking for sellers";
  if (stage === "verifying") return "Verifying seller locations";
  if (stage === "researching") return "Researching seller evidence";
  if (stage === "scoring" || stage === "qualifying") return "Scoring candidate evidence";
  if (stage === "deduplicating") return "Removing duplicate sellers";
  if (stage === "export-ready") return "Results are ready";
  if (stage === "exhausted") return "Search finished below target";
  if (stage === "cancelled") return "Search stopped";
  if (stage === "failed") return "Search failed";
  if (stage === "exporting") return "Preparing export";
  if (stage === "completed") return "Search complete";
  return "Search queued";
}

function hasUsableResearch(run: RunRecord): boolean {
  return run.qualifiedCount > 0 || Object.keys(run.rejectedEvidence).length > 0;
}

function primaryIssueMessage(run: RunRecord): string {
  return run.issues?.[0]?.message ?? "The search failed before any seller could be evaluated.";
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
