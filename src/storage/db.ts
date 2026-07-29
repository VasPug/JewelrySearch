"use client";

import Dexie, { type EntityTable } from "dexie";

import type { DiscoveryCandidate, QualifiedLead, RunPreferences, RunRecord } from "@/domain/types";

export type StoredPreference = { id: string; updatedAt: string; preferences: RunPreferences };
export type QueuedCandidate = { id: string; runId: string; candidate: DiscoveryCandidate; queuedAt: string };

class DashboardDb extends Dexie {
  preferences!: EntityTable<StoredPreference, "id">;
  runs!: EntityTable<RunRecord, "id">;
  acceptedLeads!: EntityTable<QualifiedLead, "websiteUrl">;
  queuedCandidates!: EntityTable<QueuedCandidate, "id">;

  constructor() {
    super("canadian-jewelry-sourcing-dashboard");
    this.version(1).stores({
      preferences: "id, updatedAt",
      runs: "id, startedAt, stage",
      acceptedLeads: "websiteUrl, companyName, dateResearched",
      queuedCandidates: "id, runId, queuedAt",
    });
  }
}

/** Browser-only state: intentionally no configuration or provider secret table. */
export const dashboardDb = new DashboardDb();
