import type { RunIssue, RunRecord, RunStage } from "@/domain/types";
import {
  activeCandidateLabel,
  recentRunActivity,
  retryableCandidates,
  runIssueCount,
  runIssues,
} from "@/domain/run-observability";

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
  onRetry,
  onRetryFailed,
  run,
}: {
  isRunning?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onRetryFailed?: () => void;
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
  const issueCount = runIssueCount(run);
  const issues = runIssues(run);
  const activity = recentRunActivity(run);
  const activeCandidate = activeCandidateLabel(run);
  const failedCandidates = retryableCandidates(run);
  const canRetry = !isRunning && (run.error || run.outcome === "failed" || run.outcome === "partial");

  return (
    <section className="panel run-progress" aria-labelledby="progress-heading" aria-live="polite">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Live run · {shortRunId(run.id)}</p>
          <h2 id="progress-heading">{progressHeading(run)}</h2>
          {activeCandidate ? <p className="run-current-candidate">{activeCandidate}</p> : null}
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
        <Counter label="Checked" value={run.researchedCount} />
        <Counter label="Rejected" value={run.rejectedCount} tone="caution" />
        <Counter label="Duplicates" value={run.deduplicatedCount} />
        <Counter label="Errors" value={issueCount} tone={issueCount ? "danger" : undefined} />
      </div>

      {run.error || run.outcome === "partial" || run.outcome === "candidate_budget_reached" || run.outcome === "search_exhausted" || run.outcome === "cancelled" || Boolean(run.completedAt && run.researchLimitReached) ? (
        <div className={`run-note ${run.error || run.outcome === "partial" ? "is-error" : ""}`}>
          <strong>{runNote(run).title}</strong>{" "}
          {runNote(run).message}
          {canRetry ? (
            <div className="run-recovery-actions">
              {failedCandidates.length > 0 && onRetryFailed ? (
                <button onClick={onRetryFailed} type="button">
                  Retry failed sellers
                </button>
              ) : null}
              {onRetry ? <button onClick={onRetry} type="button">Retry search</button> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {activity.length > 0 || issues.length > 0 ? (
        <details className="run-activity">
          <summary>
            <span>Activity</span>
            <span>{issueCount ? `${issueCount} ${issueCount === 1 ? "issue" : "issues"}` : "View details"}</span>
          </summary>
          {issues.length > 0 ? (
            <ul className="run-issue-list" aria-label="Research issues">
              {issues.slice(-6).reverse().map((issue) => (
                <li key={issue.id}>
                  <strong>{issue.candidate?.companyName ?? issueLabel(issue.kind)}</strong>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {activity.length > 0 ? (
            <ol className="run-activity-list" aria-label="Recent research activity">
              {activity.map((item) => (
                <li key={item.id}>
                  <time dateTime={item.occurredAt}>{formatActivityTime(item.occurredAt)}</time>
                  <span>{item.message}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}

function runNote(run: RunRecord): { title: string; message: string } {
  if (run.error) return { title: "Run stopped:", message: run.error };
  if (run.outcome === "partial") {
    const count = runIssueCount(run);
    const latestIssue = runIssues(run).at(-1)?.message;
    return {
      title: "Partial results kept:",
      message: `${run.qualifiedCount} accepted ${run.qualifiedCount === 1 ? "lead is" : "leads are"} available. ${count} research ${count === 1 ? "request could" : "requests could"} not be completed.${latestIssue ? ` ${latestIssue}` : ""}`,
    };
  }
  if (run.outcome === "cancelled") {
    return {
      title: "Cancelled:",
      message: `Kept ${run.qualifiedCount} accepted leads after checking ${run.researchedCount} candidates.`,
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
    message: `The run checked ${run.researchedCount} candidates before reaching the ${run.preferences.targetLeads}-lead target.`,
  };
}

function progressHeading(run: RunRecord): string {
  if (run.outcome === "partial") return "Partial results ready";
  return STAGE_LABELS[run.stage];
}

function issueLabel(kind: RunIssue["kind"]): string {
  if (kind === "rate_limit") return "Provider rate limit";
  if (kind === "configuration") return "Configuration";
  if (kind === "authentication") return "Provider authentication";
  if (kind === "quota") return "Provider credits";
  if (kind === "timeout") return "Provider timeout";
  if (kind === "network") return "Network connection";
  if (kind === "validation") return "Search brief";
  if (kind === "provider") return "Research provider";
  return "Research issue";
}

function formatActivityTime(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
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
