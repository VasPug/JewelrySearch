"use client";

import { useCallback, useEffect, useState } from "react";

import type { QualifiedLead, RunPreferences, RunRecord } from "@/domain/types";
import { runResearch } from "@/research/orchestrator";
import { dashboardDb } from "@/storage/db";

import { DashboardHeader } from "./dashboard-header";
import { EvidencePreview } from "./evidence-preview";
import {
  freshDefaultPreferences,
  isValidPreferences,
  RunConfig,
} from "./run-config";
import { RunHistory } from "./run-history";
import { RunProgress } from "./run-progress";

const RECENT_PREFERENCES_ID = "most-recent-valid";

export function SourcingDashboard() {
  const [preferences, setPreferences] = useState<RunPreferences>(freshDefaultPreferences);
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [currentRun, setCurrentRun] = useState<RunRecord | null>(null);
  const [acceptedLeads, setAcceptedLeads] = useState<QualifiedLead[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let active = true;

    async function hydrateDashboard() {
      const healthPromise = fetch("/api/health")
        .then(async (response) =>
          response.ok ? ((await response.json()) as { configured: boolean }).configured : false,
        )
        .catch(() => false);

      const [configured, storedPreferences, savedRuns, savedLeads] = await Promise.all([
        healthPromise,
        dashboardDb.preferences.get(RECENT_PREFERENCES_ID).catch(() => undefined),
        dashboardDb.runs.orderBy("startedAt").reverse().toArray().catch(() => []),
        dashboardDb.acceptedLeads.orderBy("dateResearched").reverse().toArray().catch(() => []),
      ]);

      if (!active) return;
      setApiConfigured(configured);
      if (storedPreferences) setPreferences(clonePreferences(storedPreferences.preferences));
      setRuns(savedRuns);
      setAcceptedLeads(savedLeads);
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
    const [savedRuns, savedLeads] = await Promise.all([
      dashboardDb.runs.orderBy("startedAt").reverse().toArray(),
      dashboardDb.acceptedLeads.orderBy("dateResearched").reverse().toArray(),
    ]);
    setRuns(savedRuns);
    setAcceptedLeads(savedLeads);
    setIsRunning(false);
  }, [apiConfigured, isRunning, preferences]);

  const visibleLeads = currentRun?.leads.length ? currentRun.leads : acceptedLeads;

  return (
    <main className="dashboard" id="top">
      <DashboardHeader apiConfigured={apiConfigured} runCount={runs.length} />

      <section className="hero" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Canadian jewelry intelligence · Evidence first</p>
          <h1 id="page-title">
            Find the right sellers, <em>with receipts.</em>
          </h1>
        </div>
        <div className="hero-aside">
          <p>
            A deterministic research desk for finding Canadian jewelry sellers that fit your
            catalog, price, inventory, and contact criteria.
          </p>
          <dl>
            <div>
              <dt>Country gate</dt>
              <dd>Canada only</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{preferences.targetLeads} leads</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>You.com</dd>
            </div>
          </dl>
        </div>
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

      <EvidencePreview leads={visibleLeads} />

      <footer className="page-footer">
        <span>Evidence-backed research · Deterministic scoring · No outreach automation</span>
        <span>Private browser ledger / API key stays server-side</span>
      </footer>
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
