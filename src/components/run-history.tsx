"use client";

import type { RunRecord } from "@/domain/types";
import { downloadRunWorkbook } from "@/domain/xlsx";

export function RunHistory({ runs }: { runs: RunRecord[] }) {
  return (
    <section className="panel history-panel" aria-labelledby="history-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Research ledger</p>
          <h2 id="history-heading">Run history</h2>
        </div>
        <span className="record-count">{runs.length} records</span>
      </div>

      {runs.length === 0 ? (
        <div className="empty-table">
          <span aria-hidden="true">⌁</span>
          <p>No saved runs yet. Your completed research passes will collect here.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Started</th>
                <th scope="col">Stage</th>
                <th scope="col">Accepted</th>
                <th scope="col">Researched</th>
                <th scope="col">Outcome</th>
                <th scope="col">
                  <span className="sr-only">Export</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <strong>{formatDate(run.startedAt)}</strong>
                    <small>{formatTime(run.startedAt)}</small>
                  </td>
                  <td>
                    <span className={`table-status is-${run.stage}`}>{run.stage}</span>
                  </td>
                  <td>
                    <strong>{run.qualifiedCount}</strong>
                    <small>of {run.preferences.targetLeads}</small>
                  </td>
                  <td>{run.researchedCount}</td>
                  <td>
                    {run.error
                      ? "Failed"
                      : run.researchLimitReached
                        ? "Budget exhausted"
                        : run.completedAt
                          ? "Complete"
                          : "Active"}
                  </td>
                  <td className="table-action">
                    <button
                      aria-label={`Download ${run.id} Excel workbook`}
                      disabled={run.leads.length === 0 && Object.keys(run.rejectionReasons).length === 0}
                      onClick={() => void downloadRunWorkbook(run)}
                      type="button"
                    >
                      XLSX <span aria-hidden="true">↓</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
