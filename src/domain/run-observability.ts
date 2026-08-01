import type { DiscoveryCandidate, RunActivity, RunIssue, RunRecord } from "./types";

export function runIssues(run: RunRecord): RunIssue[] {
  return run.issues ?? [];
}

export function runIssueCount(run: RunRecord): number {
  const count = runIssues(run).length;
  return count || (run.error ? 1 : 0);
}

export function retryableCandidates(run: RunRecord): DiscoveryCandidate[] {
  const candidates = new Map<string, DiscoveryCandidate>();
  for (const issue of runIssues(run)) {
    if (issue.retryable && issue.candidate) candidates.set(issue.candidate.id, issue.candidate);
  }
  return [...candidates.values()];
}

export function activeCandidateLabel(run: RunRecord): string {
  const active = run.activeCandidates ?? [];
  if (active.length === 0) return "";
  if (active.length === 1) return `Checking ${active[0]!.companyName}`;
  return `Checking ${active[0]!.companyName} +${active.length - 1} more`;
}

export function compactRunCounts(run: RunRecord): string {
  const issueCount = runIssueCount(run);
  return [
    `${run.researchedCount}/${run.preferences.maxCandidates} sites checked`,
    `${run.qualifiedCount}/${run.preferences.targetLeads} fit`,
    issueCount ? `${issueCount} ${issueCount === 1 ? "issue" : "issues"}` : "",
  ].filter(Boolean).join(" · ");
}

export function recentRunActivity(run: RunRecord, limit = 8): RunActivity[] {
  return [...(run.activity ?? [])].slice(-limit).reverse();
}
