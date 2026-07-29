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

    expect(screen.getByText(/kept 2 accepted leads from 4 completed candidates/i)).toBeVisible();
  });
});
