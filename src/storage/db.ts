"use client";

import Dexie, { type EntityTable } from "dexie";

import type {
  CandidateMemory,
  CriteriaChatMessage,
  DiscoveryCandidate,
  QualifiedLead,
  RunPreferences,
  RunRecord,
} from "@/domain/types";
import type { ImportedLead } from "@/domain/imported-leads";

export type StoredPreference = { id: string; updatedAt: string; preferences: RunPreferences };
export type QueuedCandidate = { id: string; runId: string; candidate: DiscoveryCandidate; queuedAt: string };
export type WorkspaceSetting = {
  id: string;
  instructions?: string;
  criteriaMessages?: CriteriaChatMessage[];
  updatedAt: string;
};

class DashboardDb extends Dexie {
  preferences!: EntityTable<StoredPreference, "id">;
  runs!: EntityTable<RunRecord, "id">;
  acceptedLeads!: EntityTable<QualifiedLead, "websiteUrl">;
  queuedCandidates!: EntityTable<QueuedCandidate, "id">;
  importedLeads!: EntityTable<ImportedLead, "id">;
  workspaceSettings!: EntityTable<WorkspaceSetting, "id">;
  candidateMemory!: EntityTable<CandidateMemory, "id">;

  constructor() {
    super("canadian-jewelry-sourcing-dashboard");
    this.version(1).stores({
      preferences: "id, updatedAt",
      runs: "id, startedAt, stage",
      acceptedLeads: "websiteUrl, companyName, dateResearched",
      queuedCandidates: "id, runId, queuedAt",
    });
    this.version(2).stores({
      preferences: "id, updatedAt",
      runs: "id, startedAt, stage",
      acceptedLeads: "websiteUrl, companyName, dateResearched",
      queuedCandidates: "id, runId, queuedAt",
      importedLeads: "id, companyName, websiteUrl, importedAt",
    });
    this.version(3).stores({
      preferences: "id, updatedAt",
      runs: "id, startedAt, stage",
      acceptedLeads: "websiteUrl, companyName, dateResearched",
      queuedCandidates: "id, runId, queuedAt",
      importedLeads: "id, companyName, websiteUrl, importedAt",
      workspaceSettings: "id, updatedAt",
    });
    this.version(4).stores({
      preferences: "id, updatedAt",
      runs: "id, startedAt, stage",
      acceptedLeads: "websiteUrl, companyName, dateResearched",
      queuedCandidates: "id, runId, queuedAt",
      importedLeads: "id, companyName, websiteUrl, importedAt",
      workspaceSettings: "id, updatedAt",
      candidateMemory: "id, companyName, websiteUrl, outcome, updatedAt",
    });
  }
}

/** Browser-only state: intentionally no configuration or provider secret table. */
export const dashboardDb = new DashboardDb();
