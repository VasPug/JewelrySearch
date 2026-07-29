"use client";

import { type ChangeEvent, useState } from "react";

import { type ImportedLead, parseImportedLeadsCsv } from "@/domain/imported-leads";

type ExistingLeadsPanelProps = {
  apiAvailable: boolean;
  instructions: string;
  isRunning: boolean;
  leadCount: number;
  reviewableCount: number;
  onClear: () => void;
  onImport: (leads: ImportedLead[]) => Promise<void> | void;
  onInstructionsChange: (value: string) => void;
  onReview: () => void;
};

export function ExistingLeadsPanel({
  apiAvailable,
  instructions,
  isRunning,
  leadCount,
  reviewableCount,
  onClear,
  onImport,
  onInstructionsChange,
  onReview,
}: ExistingLeadsPanelProps) {
  const [error, setError] = useState("");

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const leads = parseImportedLeadsCsv(await readFile(file));
      if (leads.length === 0) throw new Error("No usable leads were found");
      await onImport(leads);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import this CSV");
    }
  }

  return (
    <section className="panel existing-leads" aria-labelledby="existing-leads-heading">
      <div className="existing-leads-copy">
        <div>
          <p className="eyebrow">Optional</p>
          <h2 id="existing-leads-heading">Existing leads</h2>
        </div>
        <span className="record-count">{leadCount} saved · {reviewableCount} unreviewed</span>
      </div>

      <p>
        Upload prior leads once. New searches skip uploaded matches automatically. Optional columns:
        Feedback Status (good, not_fit, already_known) and Feedback Notes.
      </p>

      <div className="existing-leads-controls">
        <label className="file-button">
          <input
            accept=".csv,text/csv"
            aria-label="Upload existing leads CSV"
            disabled={isRunning}
            onChange={(event) => void importFile(event)}
            type="file"
          />
          Upload CSV
        </label>
        <button
          className="secondary-button"
          disabled={!apiAvailable || isRunning || reviewableCount === 0}
          onClick={onReview}
          type="button"
        >
          Review uploaded leads
        </button>
        {leadCount > 0 ? (
          <button className="text-button" disabled={isRunning} onClick={onClear} type="button">
            Clear list
          </button>
        ) : null}
      </div>

      <label className="instruction-field">
        <span>Run instructions</span>
        <textarea
          maxLength={240}
          onChange={(event) => onInstructionsChange(event.target.value)}
          placeholder="Optional: focus on ready-to-ship chains"
          rows={2}
          value={instructions}
        />
      </label>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </section>
  );
}

function readFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(new Error("Could not read this CSV")));
    reader.readAsText(file);
  });
}
