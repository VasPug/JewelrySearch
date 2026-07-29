"use client";

import { useCallback, useEffect, useState } from "react";

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
    try {
      const completed = await runResearch(
        clonePreferences(preferences),
        { onProgress: setCurrentRun },
        { instructions },
      );
      await finishRun(completed);
    } finally {
      setIsRunning(false);
    }
  }, [apiConfigured, instructions, isRunning, preferences]);

  const importLeads = useCallback(async (leads: ImportedLead[]) => {
    await dashboardDb.importedLeads.bulkPut(leads);
    setImportedLeads(await dashboardDb.importedLeads.toArray());
  }, []);

  const clearImportedLeads = useCallback(() => {
    void dashboardDb.importedLeads.clear().then(() => setImportedLeads([]));
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
    const candidates: DiscoveryCandidate[] = importedLeads.map((lead) => ({
      id: lead.id,
      companyName: lead.companyName,
      websiteUrl: lead.websiteUrl,
      discoverySource: "csv_upload",
    }));

    setIsRunning(true);
    try {
      const completed = await reviewImportedLeads(
        clonePreferences(preferences),
        candidates,
        { onProgress: setCurrentRun },
        { instructions },
      );
      await finishRun(completed);
    } finally {
      setIsRunning(false);
    }
  }, [apiConfigured, importedLeads, instructions, isRunning, preferences]);

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
              <RunProgress run={currentRun} />
              <RunHistory runs={runs} />
            </aside>
          </div>
        }
      />

    </main>
  );
}

function clonePreferences(preferences: RunPreferences): RunPreferences {
  return {
    ...preferences,
    weights: { ...preferences.weights },
    acceptedMetals: [...preferences.acceptedMetals],
    acceptedCategories: [...preferences.acceptedCategories],
  };
}
