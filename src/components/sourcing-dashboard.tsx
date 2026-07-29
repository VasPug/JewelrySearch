"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ImportedLead } from "@/domain/imported-leads";
import type { DiscoveryCandidate, RunPreferences, RunRecord } from "@/domain/types";
import { reviewImportedLeads, runResearch } from "@/research/orchestrator";
import { dashboardDb } from "@/storage/db";

import { DashboardHeader } from "./dashboard-header";
import { DashboardTabs } from "./dashboard-tabs";
import { ExistingLeadsPanel } from "./existing-leads-panel";
import {
  freshDefaultPreferences,
  isValidPreferences,
  RunConfig,
} from "./run-config";
import { RunHistory } from "./run-history";
import { RunProgress } from "./run-progress";

const RECENT_PREFERENCES_ID = "most-recent-valid-v3";
const EXISTING_LEADS_SETTINGS_ID = "existing-leads-v1";

export function SourcingDashboard() {
  const [preferences, setPreferences] = useState<RunPreferences>(freshDefaultPreferences);
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [currentRun, setCurrentRun] = useState<RunRecord | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [importedLeads, setImportedLeads] = useState<ImportedLead[]>([]);
  const [instructions, setInstructions] = useState("");
  const runController = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;

    async function hydrateDashboard() {
      const healthPromise = fetch("/api/health")
        .then(async (response) =>
          response.ok ? ((await response.json()) as { configured: boolean }).configured : false,
        )
        .catch(() => false);

      const [configured, storedPreferences, savedRuns, savedImportedLeads, savedSettings] = await Promise.all([
        healthPromise,
        dashboardDb.preferences.get(RECENT_PREFERENCES_ID).catch(() => undefined),
        dashboardDb.runs.orderBy("startedAt").reverse().toArray().catch(() => []),
        dashboardDb.importedLeads.toArray().catch(() => []),
        dashboardDb.workspaceSettings.get(EXISTING_LEADS_SETTINGS_ID).catch(() => undefined),
      ]);

      if (!active) return;
      setApiConfigured(configured);
      if (storedPreferences) setPreferences(clonePreferences(storedPreferences.preferences));
      setRuns(savedRuns);
      setCurrentRun(savedRuns.find((run) => !run.completedAt) ?? savedRuns[0] ?? null);
      setImportedLeads(savedImportedLeads);
      setInstructions(savedSettings?.instructions ?? "");
      void rememberRejectedCandidates(savedRuns).catch(() => undefined);
    }

    void hydrateDashboard();
    return () => {
      active = false;
    };
  }, []);

  const updatePreferences = useCallback((next: RunPreferences) => {
    setPreferences(next);
    if (isValidPreferences(next)) {
      void dashboardDb.preferences
        .put({
          id: RECENT_PREFERENCES_ID,
          updatedAt: new Date().toISOString(),
          preferences: clonePreferences(next),
        })
        .catch(() => undefined);
    }
  }, []);

  const restoreDefaults = useCallback(() => {
    updatePreferences(freshDefaultPreferences());
  }, [updatePreferences]);

  const startRun = useCallback(async () => {
    if (isRunning || !apiConfigured || !isValidPreferences(preferences)) return;

    setIsRunning(true);
    const controller = new AbortController();
    runController.current = controller;
    try {
      const completed = await runResearch(
        clonePreferences(preferences),
        { onProgress: setCurrentRun },
        {
          instructions: feedbackAwareInstructions(instructions, importedLeads),
          signal: controller.signal,
        },
      );
      await finishRun(completed);
    } finally {
      if (runController.current === controller) runController.current = null;
      setIsRunning(false);
    }
  }, [apiConfigured, importedLeads, instructions, isRunning, preferences]);

  const importLeads = useCallback(async (leads: ImportedLead[]) => {
    await Promise.all([
      dashboardDb.importedLeads.bulkPut(leads),
      dashboardDb.candidateMemory.bulkPut(leads.map((lead) => ({
        id: lead.id,
        companyName: lead.companyName,
        websiteUrl: lead.websiteUrl,
        outcome: lead.feedbackStatus || "already_known",
        reason: lead.feedbackNotes,
        runId: null,
        updatedAt: lead.importedAt,
      }))),
    ]);
    setImportedLeads(await dashboardDb.importedLeads.toArray());
  }, []);

  const clearImportedLeads = useCallback(() => {
    void dashboardDb.importedLeads.toArray().then(async (leads) => {
      await Promise.all([
        dashboardDb.importedLeads.clear(),
        dashboardDb.candidateMemory.bulkDelete(leads.map((lead) => lead.id)),
      ]);
      setImportedLeads([]);
    });
  }, []);

  const updateInstructions = useCallback((value: string) => {
    const next = value.slice(0, 240);
    setInstructions(next);
    void dashboardDb.workspaceSettings.put({
      id: EXISTING_LEADS_SETTINGS_ID,
      instructions: next,
      updatedAt: new Date().toISOString(),
    });
  }, []);

  const reviewLeads = useCallback(async () => {
    if (isRunning || !apiConfigured || !isValidPreferences(preferences) || importedLeads.length === 0) return;
    const candidates: DiscoveryCandidate[] = importedLeads
      .filter((lead) => !lead.feedbackStatus)
      .map((lead) => ({
        id: lead.id,
        companyName: lead.companyName,
        websiteUrl: lead.websiteUrl,
        discoverySource: "csv_upload",
      }));
    if (candidates.length === 0) return;

    setIsRunning(true);
    const controller = new AbortController();
    runController.current = controller;
    try {
      const completed = await reviewImportedLeads(
        clonePreferences(preferences),
        candidates,
        { onProgress: setCurrentRun },
        {
          instructions: feedbackAwareInstructions(instructions, importedLeads),
          signal: controller.signal,
        },
      );
      await finishRun(completed);
    } finally {
      if (runController.current === controller) runController.current = null;
      setIsRunning(false);
    }
  }, [apiConfigured, importedLeads, instructions, isRunning, preferences]);

  const cancelRun = useCallback(() => {
    runController.current?.abort();
  }, []);

  async function finishRun(completed: RunRecord) {
    setCurrentRun(completed);
    setRuns(await dashboardDb.runs.orderBy("startedAt").reverse().toArray());
  }

  return (
    <main className="dashboard" id="top">
      <DashboardHeader apiConfigured={apiConfigured} runCount={runs.length} />

      <section className="utility-intro" aria-labelledby="page-title">
        <h1 id="page-title">Seller search</h1>
        <p>Canadian jewelry leads · You.com · XLSX export</p>
      </section>

      <DashboardTabs
        searchContent={
          <div className="workspace">
            <div className="config-stack">
              <ExistingLeadsPanel
                apiAvailable={apiConfigured === true}
                instructions={instructions}
                isRunning={isRunning}
                leadCount={importedLeads.length}
                reviewableCount={importedLeads.filter((lead) => !lead.feedbackStatus).length}
                onClear={clearImportedLeads}
                onImport={importLeads}
                onInstructionsChange={updateInstructions}
                onReview={() => void reviewLeads()}
              />
              <RunConfig
                apiAvailable={apiConfigured === true}
                isRunning={isRunning}
                onChange={updatePreferences}
                onRestoreDefaults={restoreDefaults}
                onStart={() => void startRun()}
                preferences={preferences}
              />
            </div>
            <aside className="sidebar-stack" aria-label="Run status and history">
              <RunProgress isRunning={isRunning} onCancel={cancelRun} run={currentRun} />
              <RunHistory runs={runs} />
            </aside>
          </div>
        }
      />

    </main>
  );
}

async function rememberRejectedCandidates(runs: RunRecord[]): Promise<void> {
  const candidates = runs.flatMap((run) =>
    Object.values(run.rejectedEvidence ?? {}).map((evidence) => ({
      id: evidence.id,
      companyName: evidence.companyName.value,
      websiteUrl: evidence.officialWebsite?.value ?? null,
      outcome: "rejected" as const,
      reason: (run.rejectionReasons[evidence.id] ?? []).join("; "),
      runId: run.id,
      updatedAt: run.completedAt ?? run.startedAt,
    })),
  );
  if (candidates.length) await dashboardDb.candidateMemory.bulkPut(candidates);
}

function feedbackAwareInstructions(instructions: string, leads: ImportedLead[]): string {
  const goodExamples = leads
    .filter((lead) => lead.feedbackStatus === "good")
    .slice(0, 3)
    .map((lead) => `${lead.companyName}${lead.feedbackNotes ? ` (${lead.feedbackNotes})` : ""}`);
  return [
    instructions.trim(),
    goodExamples.length ? `Good fit examples: ${goodExamples.join(", ")}` : "",
  ].filter(Boolean).join(". ").slice(0, 240);
}

function clonePreferences(preferences: RunPreferences): RunPreferences {
  return {
    ...preferences,
    weights: { ...preferences.weights },
    acceptedMetals: [...preferences.acceptedMetals],
    acceptedCategories: [...preferences.acceptedCategories],
    avoidTerms: [...(preferences.avoidTerms ?? [])],
  };
}
