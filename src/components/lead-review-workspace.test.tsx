import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES } from "@/domain/defaults";
import type { ImportedLead } from "@/domain/imported-leads";
import type { RunRecord } from "@/domain/types";

import { LeadReviewWorkspace } from "./lead-review-workspace";

afterEach(cleanup);

function activeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run-12345678",
    startedAt: "2026-07-31T00:00:00.000Z",
    completedAt: null,
    stage: "researching",
    outcome: null,
    preferences: { ...DEFAULT_PREFERENCES },
    discoveredCount: 5,
    researchedCount: 0,
    qualifiedCount: 0,
    rejectedCount: 0,
    deduplicatedCount: 0,
    researchLimitReached: false,
    leads: [],
    rejectionReasons: {},
    rejectedEvidence: {},
    error: null,
    ...overrides,
  };
}

describe("LeadReviewWorkspace", () => {
  it("shows imported leads and records the human's final decision", () => {
    const onDecision = vi.fn();
    const lead: ImportedLead = {
      id: "https://foxyoriginals.com",
      companyName: "Foxy Originals",
      websiteUrl: "https://foxyoriginals.com",
      phoneNumber: "",
      instagramUrl: "",
      feedbackStatus: "maybe",
      feedbackNotes: "Initial gut check",
      importedAt: "2026-07-30T00:00:00.000Z",
    };

    render(
      <LeadReviewWorkspace
        currentRun={null}
        importedLeads={[lead]}
        memory={[]}
        onDecision={onDecision}
      />,
    );

    expect(screen.getAllByText("Foxy Originals").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Worth a look").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Good: Foxy Originals" }));
    expect(onDecision).toHaveBeenCalledWith({
      id: lead.id,
      companyName: lead.companyName,
      websiteUrl: lead.websiteUrl,
      decision: "good",
    });
  });

  it("keeps all three workspace panes useful before the first run", () => {
    render(
      <LeadReviewWorkspace
        currentRun={null}
        importedLeads={[]}
        memory={[]}
        onDecision={vi.fn()}
      />,
    );

    expect(screen.getByText("Your lead review queue is empty")).toBeVisible();
    expect(screen.getByText("Evidence appears here")).toBeVisible();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });

  it("uses the lead pane for detailed progress while the first results are pending", () => {
    const onCancel = vi.fn();
    render(
      <LeadReviewWorkspace
        currentRun={activeRun()}
        importedLeads={[]}
        isRunning
        memory={[]}
        onCancel={onCancel}
        onDecision={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Researching evidence" })).toBeVisible();
    expect(screen.queryByText("Your lead review queue is empty")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel run" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps partial leads reviewable while showing compact run status", () => {
    const onCancel = vi.fn();
    const lead: ImportedLead = {
      id: "https://foxyoriginals.com",
      companyName: "Foxy Originals",
      websiteUrl: "https://foxyoriginals.com",
      phoneNumber: "",
      instagramUrl: "",
      feedbackStatus: "maybe",
      feedbackNotes: "Initial gut check",
      importedAt: "2026-07-30T00:00:00.000Z",
    };

    render(
      <LeadReviewWorkspace
        currentRun={activeRun({ researchedCount: 2 })}
        importedLeads={[lead]}
        isRunning
        memory={[]}
        onCancel={onCancel}
        onDecision={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Foxy Originals").length).toBeGreaterThan(0);
    expect(screen.getByText("Researching evidence")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Stop search" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows a recoverable terminal state when a run fails without leads", () => {
    render(
      <LeadReviewWorkspace
        currentRun={activeRun({
          completedAt: "2026-07-31T00:01:00.000Z",
          error: "Research provider request failed",
          outcome: "failed",
          stage: "failed",
        })}
        importedLeads={[]}
        memory={[]}
        onDecision={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Run failed" })).toBeVisible();
    expect(screen.getByText(/research provider request failed/i)).toBeVisible();
  });

  it("keeps partial leads visible with specific issues and retry actions", () => {
    const onRetry = vi.fn();
    const onRetryFailed = vi.fn();
    const lead: ImportedLead = {
      id: "https://foxyoriginals.com",
      companyName: "Foxy Originals",
      websiteUrl: "https://foxyoriginals.com",
      phoneNumber: "",
      instagramUrl: "",
      feedbackStatus: "maybe",
      feedbackNotes: "Initial gut check",
      importedAt: "2026-07-30T00:00:00.000Z",
    };

    render(
      <LeadReviewWorkspace
        currentRun={activeRun({
          completedAt: "2026-07-31T00:01:00.000Z",
          outcome: "partial",
          stage: "exhausted",
          researchedCount: 3,
          qualifiedCount: 1,
          issues: [{
            id: "issue-1",
            occurredAt: "2026-07-31T00:00:30.000Z",
            stage: "researching",
            scope: "candidate",
            kind: "provider",
            message: "The research provider could not complete the request. Retry the search.",
            retryable: true,
            candidate: {
              id: "seller-1",
              companyName: "Silver House",
              websiteUrl: "https://silverhouse.ca",
              discoverySource: "search",
            },
          }],
          activity: [{
            id: "activity-1",
            occurredAt: "2026-07-31T00:00:30.000Z",
            kind: "issue",
            message: "Could not check Silver House",
          }],
        })}
        importedLeads={[lead]}
        memory={[]}
        onDecision={vi.fn()}
        onRetry={onRetry}
        onRetryFailed={onRetryFailed}
      />,
    );

    expect(screen.getAllByText("Foxy Originals").length).toBeGreaterThan(0);
    expect(screen.getByText("Partial results kept")).toBeVisible();
    fireEvent.click(screen.getByText(/1 issue · view activity/i));
    expect(screen.getByText(/research provider could not complete/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Retry failed sellers" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
    expect(onRetryFailed).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
