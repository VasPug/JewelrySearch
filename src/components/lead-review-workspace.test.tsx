import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImportedLead } from "@/domain/imported-leads";

import { LeadReviewWorkspace } from "./lead-review-workspace";

afterEach(cleanup);

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
});
