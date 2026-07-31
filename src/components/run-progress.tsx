import type { RunRecord, RunStage } from "@/domain/types";

const STAGE_LABELS: Record<RunStage, string> = {
  queued: "Queued",
  discovering: "Discovering sellers",
  verifying: "Verifying Canadian location",
  researching: "Researching evidence",
  scoring: "Applying score model",
  "export-ready": "Export ready",
  exhausted: "Run finished below target",
  qualifying: "Applying score model",
  deduplicating: "Removing duplicates",
  exporting: "Preparing export",
  completed: "Run complete",
  cancelled: "Run cancelled",
  failed: "Run failed",
};

const STAGE_ORDER: RunStage[] = [
  "discovering",
  "verifying",
  "researching",
  "scoring",
  "export-ready",
];

export function RunProgress({
  isRunning = false,
  onCancel,
  run,
}: {
  isRunning?: boolean;
  onCancel?: () => void;
  run: RunRecord | null;
}) {
  if (!run) {
    return (
      <section className="panel empty-progress" aria-labelledby="progress-heading">
        <p className="eyebrow">Live run</p>
        <h2 id="progress-heading">Ready for a new research pass</h2>
        <p>
          Progress, quality gates, and candidate outcomes will appear here as the run advances.
        </p>
        <div className="idle-orbit" aria-hidden="true">
          <span />
          <i />
        </div>
      </section>
    );
  }

  const currentIndex = STAGE_ORDER.indexOf(run.stage);
  const target = run.preferences.targetLeads;
  const acceptedPercent = Math.min(100, Math.round((run.qualifiedCount / target) * 100));
  const isFinished = ["completed", "failed", "export-ready", "exhausted", "cancelled"].includes(run.stage);

  return (
    <section className="panel run-progress" aria-labelledby="progress-heading" aria-live="polite">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Live run · {shortRunId(run.id)}</p>
          <h2 id="progress-heading">{STAGE_LABELS[run.stage]}</h2>
        </div>
        <span className={`run-state ${isFinished ? "is-finished" : ""}`}>
          {isFinished ? "Final" : "In progress"}
        </span>
        {isRunning && !isFinished && onCancel ? (
          <button className="cancel-button" onClick={onCancel} type="button">
            Cancel run
          </button>
        ) : null}
      </div>

      <div className="target-progress">
        <div>
          <strong>{run.qualifiedCount}</strong>
          <span>/ {target} accepted sellers</span>
        </div>
        <span>{acceptedPercent}%</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Accepted seller target"
        aria-valuemax={target}
        aria-valuemin={0}
        aria-valuenow={run.qualifiedCount}
      >
        <span style={{ transform: `scaleX(${acceptedPercent / 100})` }} />
      </div>

      <ol className="stage-list" aria-label="Research stages">
        {STAGE_ORDER.map((stage, index) => (
          <li
            className={
              run.stage === stage ? "is-current" : currentIndex > index ? "is-complete" : ""
            }
            key={stage}
          >
            <span>{index + 1}</span>
            {STAGE_LABELS[stage]}
          </li>
        ))}
      </ol>

      <div className="counter-grid">
        <Counter label="Discovered" value={run.discoveredCount} />
        <Counter label="Researched" value={run.researchedCount} />
        <Counter label="Rejected" value={run.rejectedCount} tone="caution" />
        <Counter label="Duplicates" value={run.deduplicatedCount} />
        <Counter label="Errors" value={run.error ? 1 : 0} tone={run.error ? "danger" : undefined} />
      </div>

      {run.error || run.outcome === "candidate_budget_reached" || run.outcome === "search_exhausted" || run.outcome === "cancelled" || Boolean(run.completedAt && run.researchLimitReached) ? (
        <p className={`run-note ${run.error ? "is-error" : ""}`}>
          <strong>{runNote(run).title}</strong>{" "}
          {runNote(run).message}
        </p>
      ) : null}
    </section>
  );
}

function runNote(run: RunRecord): { title: string; message: string } {
  if (run.error) return { title: "Run stopped:", message: run.error };
  if (run.outcome === "cancelled") {
    return {
      title: "Cancelled:",
      message: `Kept ${run.qualifiedCount} accepted leads from ${run.researchedCount} completed candidates.`,
    };
  }
  if (run.outcome === "search_exhausted") {
    return {
      title: "Search exhausted:",
      message: `No new candidates remained after checking saved candidate history.`,
    };
  }
  return {
    title: "Candidate budget reached:",
    message: `The run researched ${run.researchedCount} candidates before reaching the ${run.preferences.targetLeads}-lead target.`,
  };
}

function Counter({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "caution" | "danger";
  value: number;
}) {
  return (
    <div className={tone ? `counter is-${tone}` : "counter"}>
      <span>{label}</span>
      <strong>{value.toLocaleString("en-CA")}</strong>
    </div>
  );
}

function shortRunId(id: string) {
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase();
}
