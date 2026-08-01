"use client";

import { useMemo, useState } from "react";

import type { ImportedLead } from "@/domain/imported-leads";
import { downloadRunWorkbook } from "@/domain/xlsx";
import type {
  CandidateMemory,
  QualifiedLead,
  RunRecord,
  RunStage,
  ScoreBreakdown,
  SellerType,
} from "@/domain/types";
import {
  activeCandidateLabel,
  compactRunCounts,
  recentRunActivity,
  retryableCandidates,
  runIssueCount,
  runIssues,
} from "@/domain/run-observability";

import { RunProgress } from "./run-progress";

export type LeadDecision = "good" | "maybe" | "not_fit";

type ReviewLead = {
  id: string;
  companyName: string;
  websiteUrl: string | null;
  recommendation: LeadDecision;
  recommendationReason: string;
  confidenceScore: number | null;
  sellerType: SellerType | "";
  mainProductSegment: string;
  email: string;
  phone: string;
  evidenceUrls: string[];
  scoreBreakdown: ScoreBreakdown | null;
  humanDecision: LeadDecision | null;
};

type LeadReviewWorkspaceProps = {
  currentRun: RunRecord | null;
  importedLeads: ImportedLead[];
  isRunning?: boolean;
  memory: CandidateMemory[];
  onCancel?: () => void;
  onRetry?: () => void;
  onRetryFailed?: () => void;
  onDecision: (lead: {
    id: string;
    companyName: string;
    websiteUrl: string | null;
    decision: LeadDecision;
  }) => void;
};

const FILTERS: { key: "all" | LeadDecision; label: string }[] = [
  { key: "all", label: "All" },
  { key: "good", label: "Fit" },
  { key: "maybe", label: "Maybe" },
  { key: "not_fit", label: "Not fit" },
];

const SCORE_COMPONENTS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: "productFit", label: "Product fit" },
  { key: "affordability", label: "Price fit" },
  { key: "inventory", label: "Inventory" },
  { key: "sellerPriority", label: "Seller type" },
  { key: "contactability", label: "Contactability" },
  { key: "presence", label: "Online presence" },
];

export function LeadReviewWorkspace({
  currentRun,
  importedLeads,
  isRunning = false,
  memory,
  onCancel,
  onRetry,
  onRetryFailed,
  onDecision,
}: LeadReviewWorkspaceProps) {
  const [filter, setFilter] = useState<"all" | LeadDecision>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const leads = useMemo(
    () => buildReviewLeads(currentRun, importedLeads, memory),
    [currentRun, importedLeads, memory],
  );
  const visibleLeads =
    filter === "all" ? leads : leads.filter((lead) => finalDecision(lead) === filter);
  const selected =
    leads.find((lead) => lead.id === selectedId) ??
    visibleLeads[0] ??
    leads[0] ??
    null;

  return (
    <>
      <section className="lead-inbox" aria-labelledby="lead-inbox-heading">
        <div className="lead-inbox-header">
          <div>
            <p className="workspace-kicker">Human review queue</p>
            <h1 id="lead-inbox-heading">Leads</h1>
          </div>
          <div className="lead-export-actions">
            <button
              disabled={leads.length === 0}
              onClick={() => downloadReviewCsv(leads)}
              type="button"
            >
              Export CSV
            </button>
            <button
              disabled={!currentRun || (
                currentRun.leads.length === 0 &&
                Object.keys(currentRun.rejectionReasons).length === 0
              )}
              onClick={() => currentRun && void downloadRunWorkbook(currentRun)}
              type="button"
            >
              XLSX
            </button>
          </div>
        </div>

        <div className="lead-filters" aria-label="Filter leads">
          {FILTERS.map(({ key, label }) => (
            <button
              aria-pressed={filter === key}
              key={key}
              onClick={() => setFilter(key)}
              type="button"
            >
              {label}
              <span>{countForFilter(leads, key)}</span>
            </button>
          ))}
        </div>

        {visibleLeads.length === 0 && leads.length === 0 && currentRun ? (
          <div className="lead-run-state">
            <RunProgress
              isRunning={isRunning}
              onCancel={onCancel}
              onRetry={onRetry}
              onRetryFailed={onRetryFailed}
              run={currentRun}
            />
          </div>
        ) : visibleLeads.length === 0 ? (
          <div className="lead-empty">
            <span aria-hidden="true">⌕</span>
            <h2>{leads.length ? "No leads in this view" : "Your lead review queue is empty"}</h2>
            <p>
              {leads.length
                ? "Choose another filter to see the rest of the queue."
                : "Describe the companies you want in the chat, then start a research run."}
            </p>
          </div>
        ) : (
          <>
            {currentRun ? (
              <RunStatusBanner
                isRunning={isRunning}
                onCancel={onCancel}
                onRetry={onRetry}
                onRetryFailed={onRetryFailed}
                run={currentRun}
              />
            ) : null}
            <div className="lead-list">
              {visibleLeads.map((lead) => (
                <article
                  className={`lead-row ${selected?.id === lead.id ? "is-selected" : ""}`}
                  key={lead.id}
                >
                  <button
                    className="lead-row-main"
                    onClick={() => setSelectedId(lead.id)}
                    type="button"
                  >
                    <span className={`fit-dot is-${finalDecision(lead)}`} aria-hidden="true" />
                    <span className="lead-row-copy">
                      <strong>{lead.companyName}</strong>
                      <small>
                        {humanize(lead.sellerType) || "Seller type unknown"}
                        {lead.mainProductSegment ? ` · ${lead.mainProductSegment}` : ""}
                      </small>
                    </span>
                    <span className={`recommendation-pill is-${lead.recommendation}`}>
                      {recommendationLabel(lead.recommendation)}
                    </span>
                    {lead.confidenceScore !== null ? (
                      <span className="lead-score">{lead.confidenceScore}</span>
                    ) : null}
                  </button>

                  <div className="decision-buttons" aria-label={`Review ${lead.companyName}`}>
                    <span>Your call</span>
                    {(["good", "maybe", "not_fit"] as const).map((decision) => (
                      <button
                        aria-label={`${decisionLabel(decision)}: ${lead.companyName}`}
                        aria-pressed={lead.humanDecision === decision}
                        className={`is-${decision}`}
                        key={decision}
                        onClick={() =>
                          onDecision({
                            id: lead.id,
                            companyName: lead.companyName,
                            websiteUrl: lead.websiteUrl,
                            decision,
                          })
                        }
                        type="button"
                      >
                        {decisionLabel(decision)}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <aside className="evidence-browser" aria-label="Selected lead evidence">
        {selected ? <SelectedLeadEvidence lead={selected} /> : <EvidenceEmpty />}
      </aside>
    </>
  );
}

function RunStatusBanner({
  isRunning,
  onCancel,
  onRetry,
  onRetryFailed,
  run,
}: {
  isRunning: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onRetryFailed?: () => void;
  run: RunRecord;
}) {
  const tone = run.error || run.outcome === "failed"
    ? "is-error"
    : run.outcome === "cancelled" || run.outcome === "candidate_budget_reached" || run.outcome === "search_exhausted"
      ? "is-caution"
      : isRunning
        ? "is-running"
        : "is-complete";
  const issues = runIssues(run);
  const issueCount = runIssueCount(run);
  const activity = recentRunActivity(run, 5);
  const activeCandidate = activeCandidateLabel(run);
  const failedCandidates = retryableCandidates(run);
  const canRetry = !isRunning && (run.error || run.outcome === "failed" || run.outcome === "partial");

  return (
    <div className={`lead-run-banner ${tone}`} role="status">
      <div className="lead-run-banner-summary">
        <span>
          <strong>{runStatusLabel(run, isRunning)}</strong>
          <small>{activeCandidate || compactRunCounts(run)}</small>
        </span>
        <div className="lead-run-banner-actions">
          {isRunning && onCancel ? (
            <button onClick={onCancel} type="button">Stop search</button>
          ) : null}
          {canRetry && failedCandidates.length > 0 && onRetryFailed ? (
            <button onClick={onRetryFailed} type="button">Retry failed sellers</button>
          ) : null}
          {canRetry && onRetry ? (
            <button onClick={onRetry} type="button">Retry search</button>
          ) : null}
        </div>
      </div>
      {issues.length > 0 || activity.length > 0 ? (
        <details className="lead-run-details">
          <summary>
            {issueCount
              ? `${issueCount} ${issueCount === 1 ? "issue" : "issues"} · View activity`
              : "View activity"}
          </summary>
          {issues.length > 0 ? (
            <ul>
              {issues.slice(-4).reverse().map((issue) => (
                <li key={issue.id}>
                  <strong>{issue.candidate?.companyName ?? "Search"}</strong>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {activity.length > 0 ? (
            <ol>
              {activity.map((item) => <li key={item.id}>{item.message}</li>)}
            </ol>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

function SelectedLeadEvidence({ lead }: { lead: ReviewLead }) {
  return (
    <>
      <div className="evidence-browser-header">
        <div className="browser-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span>Evidence viewer</span>
        {lead.websiteUrl ? (
          <a href={lead.websiteUrl} rel="noreferrer" target="_blank">
            Open site ↗
          </a>
        ) : null}
      </div>

      <div className="evidence-browser-body">
        <div className="selected-lead-heading">
          <div>
            <span className={`recommendation-pill is-${lead.recommendation}`}>
              {recommendationLabel(lead.recommendation)}
            </span>
            <h2>{lead.companyName}</h2>
            <p>{lead.recommendationReason}</p>
          </div>
          {lead.confidenceScore !== null ? (
            <div className="confidence-ring">
              <strong>{lead.confidenceScore}</strong>
              <span>score</span>
            </div>
          ) : null}
        </div>

        <dl className="lead-facts">
          <div>
            <dt>Seller</dt>
            <dd>{humanize(lead.sellerType) || "Unknown"}</dd>
          </div>
          <div>
            <dt>Product</dt>
            <dd>{lead.mainProductSegment || "Not confirmed"}</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>{lead.email || lead.phone || "Not published"}</dd>
          </div>
          <div>
            <dt>Human decision</dt>
            <dd>{lead.humanDecision ? decisionLabel(lead.humanDecision) : "Waiting for you"}</dd>
          </div>
        </dl>

        {lead.scoreBreakdown ? (
          <section className="fit-breakdown" aria-labelledby="fit-breakdown-heading">
            <div className="evidence-section-title">
              <h3 id="fit-breakdown-heading">Why it scored this way</h3>
              <span>Model recommendation</span>
            </div>
            {SCORE_COMPONENTS.map(({ key, label }) => {
              const value = lead.scoreBreakdown?.[key] ?? 0;
              return (
                <div className="fit-meter" key={key}>
                  <span>{label}</span>
                  <i><b style={{ width: `${Math.min(100, value * 3.33)}%` }} /></i>
                  <strong>{value}</strong>
                </div>
              );
            })}
          </section>
        ) : null}

        <section className="source-list" aria-labelledby="source-list-heading">
          <div className="evidence-section-title">
            <h3 id="source-list-heading">Research sources</h3>
            <span>{lead.evidenceUrls.length} found</span>
          </div>
          {lead.evidenceUrls.length ? (
            lead.evidenceUrls.map((url, index) => (
              <a href={url} key={url} rel="noreferrer" target="_blank">
                <span>{index + 1}</span>
                <span>
                  <strong>{sourceHost(url)}</strong>
                  <small>{url}</small>
                </span>
                <i aria-hidden="true">↗</i>
              </a>
            ))
          ) : (
            <p>No source links have been collected for this lead yet.</p>
          )}
        </section>
      </div>
    </>
  );
}

function EvidenceEmpty() {
  return (
    <div className="evidence-empty-state">
      <div className="browser-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <span aria-hidden="true">◎</span>
      <h2>Evidence appears here</h2>
      <p>Select a lead to inspect its fit recommendation, sources, contact details, and score.</p>
    </div>
  );
}

export function buildReviewLeads(
  currentRun: RunRecord | null,
  importedLeads: ImportedLead[],
  memory: CandidateMemory[],
): ReviewLead[] {
  const decisions = new Map(
    memory
      .filter((item) => ["good", "maybe", "not_fit"].includes(item.outcome))
      .map((item) => [item.id, item.outcome as LeadDecision]),
  );
  const leads = new Map<string, ReviewLead>();

  for (const lead of currentRun?.leads ?? []) {
    const id = reviewLeadId(lead.companyName, lead.websiteUrl);
    leads.set(id, acceptedReviewLead(lead, id, decisions.get(id) ?? null));
  }

  for (const evidence of Object.values(currentRun?.rejectedEvidence ?? {})) {
    const id = evidence.id;
    const websiteUrl = evidence.officialWebsite?.value ?? null;
    const reasons = currentRun?.rejectionReasons[id] ?? [];
    leads.set(id, {
      id,
      companyName: evidence.companyName.value,
      websiteUrl,
      recommendation: "not_fit",
      recommendationReason: reasons.join(" · ") || "Did not meet the current search criteria.",
      confidenceScore: null,
      sellerType: evidence.sellerType?.value ?? "",
      mainProductSegment: evidence.mainProductSegment?.value ?? "",
      email: evidence.contacts.personalEmail?.value ?? evidence.contacts.genericEmail?.value ?? "",
      phone: evidence.contacts.phoneNumber?.value ?? "",
      evidenceUrls: uniqueUrls([websiteUrl, ...evidence.sourceUrls]),
      scoreBreakdown: null,
      humanDecision: decisions.get(id) ?? null,
    });
  }

  for (const lead of importedLeads) {
    if (leads.has(lead.id)) continue;
    const importedDecision = importedFeedbackDecision(lead.feedbackStatus);
    leads.set(lead.id, {
      id: lead.id,
      companyName: lead.companyName,
      websiteUrl: lead.websiteUrl,
      recommendation: importedDecision ?? "maybe",
      recommendationReason: lead.feedbackNotes || "Imported lead awaiting research and review.",
      confidenceScore: null,
      sellerType: "",
      mainProductSegment: "",
      email: "",
      phone: lead.phoneNumber,
      evidenceUrls: uniqueUrls([lead.websiteUrl, lead.instagramUrl]),
      scoreBreakdown: null,
      humanDecision: decisions.get(lead.id) ?? importedDecision,
    });
  }

  return [...leads.values()].sort((left, right) => {
    const decisionOrder: Record<LeadDecision, number> = { good: 0, maybe: 1, not_fit: 2 };
    return decisionOrder[finalDecision(left)] - decisionOrder[finalDecision(right)];
  });
}

function acceptedReviewLead(
  lead: QualifiedLead,
  id: string,
  humanDecision: LeadDecision | null,
): ReviewLead {
  return {
    id,
    companyName: lead.companyName,
    websiteUrl: lead.websiteUrl || null,
    recommendation: "good",
    recommendationReason:
      lead.description || `Passed the current search criteria with a score of ${lead.confidenceScore}.`,
    confidenceScore: lead.confidenceScore,
    sellerType: lead.sellerType,
    mainProductSegment: lead.mainProductSegment,
    email: lead.personalEmail || lead.genericEmail,
    phone: lead.phoneNumber,
    evidenceUrls: uniqueUrls([lead.websiteUrl, lead.leadSource, ...lead.evidenceUrls]),
    scoreBreakdown: lead.scoreBreakdown,
    humanDecision,
  };
}

function importedFeedbackDecision(status: ImportedLead["feedbackStatus"]): LeadDecision | null {
  if (status === "good" || status === "maybe" || status === "not_fit") return status;
  return null;
}

function finalDecision(lead: ReviewLead): LeadDecision {
  return lead.humanDecision ?? lead.recommendation;
}

function countForFilter(leads: ReviewLead[], filter: "all" | LeadDecision): number {
  return filter === "all"
    ? leads.length
    : leads.filter((lead) => finalDecision(lead) === filter).length;
}

function reviewLeadId(companyName: string, websiteUrl: string): string {
  if (websiteUrl) return websiteUrl.replace(/\/$/, "");
  return `company:${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

function uniqueUrls(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function recommendationLabel(value: LeadDecision): string {
  if (value === "good") return "Recommended fit";
  if (value === "maybe") return "Worth a look";
  return "Likely not fit";
}

function decisionLabel(value: LeadDecision): string {
  if (value === "good") return "Good";
  if (value === "maybe") return "Maybe";
  return "Not fit";
}

function runStatusLabel(run: RunRecord, isRunning: boolean): string {
  if (isRunning) return activeStageLabel(run.stage);
  if (run.error || run.outcome === "failed") return "Research failed";
  if (run.outcome === "partial") return "Partial results kept";
  if (run.outcome === "cancelled") return "Research stopped · partial results kept";
  if (run.outcome === "candidate_budget_reached") return "Candidate budget reached";
  if (run.outcome === "search_exhausted") return "Search exhausted";
  if (run.outcome === "target_reached") return "Lead target reached";
  return "Research complete";
}

function activeStageLabel(stage: RunStage): string {
  if (stage === "discovering") return "Discovering sellers";
  if (stage === "verifying") return "Verifying locations";
  if (stage === "researching") return "Researching evidence";
  if (stage === "scoring" || stage === "qualifying") return "Scoring candidates";
  if (stage === "deduplicating") return "Removing duplicates";
  if (stage === "exporting") return "Preparing results";
  return "Research in progress";
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Research source";
  }
}

function downloadReviewCsv(leads: ReviewLead[]): void {
  const rows = [
    [
      "company_name",
      "website_url",
      "model_recommendation",
      "human_decision",
      "confidence_score",
      "seller_type",
      "main_product_segment",
      "email",
      "phone",
      "recommendation_reason",
      "evidence_urls",
    ],
    ...leads.map((lead) => [
      lead.companyName,
      lead.websiteUrl ?? "",
      lead.recommendation,
      lead.humanDecision ?? "",
      lead.confidenceScore ?? "",
      lead.sellerType,
      lead.mainProductSegment,
      lead.email,
      lead.phone,
      lead.recommendationReason,
      lead.evidenceUrls.join(" | "),
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `aurum-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
