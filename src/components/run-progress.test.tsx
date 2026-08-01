import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES } from "@/domain/defaults";
import type { RunRecord } from "@/domain/types";

import { RunProgress } from "./run-progress";

afterEach(cleanup);

function activeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run-12345678",
    startedAt: new Date().toISOString(),
    completedAt: null,
    stage: "researching",
    outcome: null,
    preferences: { ...DEFAULT_PREFERENCES },
    discoveredCount: 3,
    researchedCount: 0,
    qualifiedCount: 0,
    rejectedCount: 0,
    deduplicatedCount: 0,
    researchLimitReached: true,
    leads: [],
    rejectionReasons: {},
    rejectedEvidence: {},
    error: null,
    ...overrides,
  };
}

describe("RunProgress", () => {
  it("shows cancellation for an active run without prematurely reporting budget exhaustion", () => {
    const onCancel = vi.fn();
    render(<RunProgress isRunning onCancel={onCancel} run={activeRun()} />);

    expect(screen.queryByText(/candidate budget reached/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel run/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("labels a cancelled run and keeps its partial counts", () => {
    render(
      <RunProgress
        run={activeRun({
          completedAt: new Date().toISOString(),
          stage: "cancelled",
          outcome: "cancelled",
          researchedCount: 4,
          qualifiedCount: 2,
        })}
      />,
    );

    expect(screen.getByText(/kept 2 accepted leads after checking 4 candidates/i)).toBeVisible();
  });

  it("shows structured candidate issues, activity, and retry recovery", () => {
    const onRetry = vi.fn();
    const onRetryFailed = vi.fn();
    render(
      <RunProgress
        onRetry={onRetry}
        onRetryFailed={onRetryFailed}
        run={activeRun({
          completedAt: new Date().toISOString(),
          stage: "exhausted",
          outcome: "partial",
          researchedCount: 3,
          qualifiedCount: 1,
          issues: [{
            id: "issue-1",
            occurredAt: "2026-07-31T00:00:10.000Z",
            stage: "researching",
            scope: "candidate",
            kind: "rate_limit",
            message: "The research provider is rate-limiting requests. Wait a moment, then retry.",
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
            occurredAt: "2026-07-31T00:00:10.000Z",
            kind: "issue",
            message: "Could not check Silver House",
          }],
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: "Partial results ready" })).toBeVisible();
    expect(screen.getByText("1", { selector: ".counter.is-danger strong" })).toBeVisible();
    expect(screen.getByText(/partial results kept/i)).toBeVisible();

    fireEvent.click(screen.getByText(/1 issue/i));
    expect(screen.getByText("Silver House")).toBeVisible();
    expect(screen.getByText(/rate-limiting requests/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Retry failed sellers" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
    expect(onRetryFailed).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
