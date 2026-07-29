"use client";

import { useCallback, useEffect, useState } from "react";

import type { RunPreferences, RunRecord } from "@/domain/types";
import { runResearch } from "@/research/orchestrator";
import { dashboardDb } from "@/storage/db";

import { DashboardHeader } from "./dashboard-header";
import {
  freshDefaultPreferences,
  isValidPreferences,
  RunConfig,
} from "./run-config";
import { RunHistory } from "./run-history";
import { RunProgress } from "./run-progress";

const RECENT_PREFERENCES_ID = "most-recent-valid-v3";

export function SourcingDashboard() {
  const [preferences, setPreferences] = useState<RunPreferences>(freshDefaultPreferences);
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [currentRun, setCurrentRun] = useState<RunRecord | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let active = true;

    async function hydrateDashboard() {
      const healthPromise = fetch("/api/health")
        .then(async (response) =>
          response.ok ? ((await response.json()) as { configured: boolean }).configured : false,
        )
        .catch(() => false);

      const [configured, storedPreferences, savedRuns] = await Promise.all([
        healthPromise,
        dashboardDb.preferences.get(RECENT_PREFERENCES_ID).catch(() => undefined),
        dashboardDb.runs.orderBy("startedAt").reverse().toArray().catch(() => []),
      ]);

      if (!active) return;
      setApiConfigured(configured);
      if (storedPreferences) setPreferences(clonePreferences(storedPreferences.preferences));
      setRuns(savedRuns);
      setCurrentRun(savedRuns.find((run) => !run.completedAt) ?? savedRuns[0] ?? null);
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
    const completed = await runResearch(clonePreferences(preferences), {
      onProgress: setCurrentRun,
    });
    setCurrentRun(completed);
    const savedRuns = await dashboardDb.runs.orderBy("startedAt").reverse().toArray();
    setRuns(savedRuns);
    setIsRunning(false);
  }, [apiConfigured, isRunning, preferences]);

  return (
    <main className="dashboard" id="top">
      <DashboardHeader apiConfigured={apiConfigured} runCount={runs.length} />

      <section className="utility-intro" aria-labelledby="page-title">
        <h1 id="page-title">Seller search</h1>
        <p>Canadian jewelry leads · You.com · XLSX export</p>
      </section>

      <div className="workspace">
        <RunConfig
          apiAvailable={apiConfigured === true}
          isRunning={isRunning}
          onChange={updatePreferences}
          onRestoreDefaults={restoreDefaults}
          onStart={() => void startRun()}
          preferences={preferences}
        />
        <aside className="sidebar-stack" aria-label="Run status and history">
          <RunProgress run={currentRun} />
          <RunHistory runs={runs} />
        </aside>
      </div>

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
