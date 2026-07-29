import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExistingLeadsPanel } from "./existing-leads-panel";

afterEach(cleanup);

describe("ExistingLeadsPanel", () => {
  it("imports a CSV and enables review for saved leads", async () => {
    const onImport = vi.fn().mockResolvedValue(undefined);
    const onReview = vi.fn();
    render(
      <ExistingLeadsPanel
        apiAvailable
        instructions=""
        isRunning={false}
        leadCount={0}
        onClear={vi.fn()}
        onImport={onImport}
        onInstructionsChange={vi.fn()}
        onReview={onReview}
      />,
    );

    const file = new File(["Company Name,Website\nMaple Silver,maplesilver.ca"], "leads.csv", {
      type: "text/csv",
    });
    fireEvent.change(screen.getByLabelText(/upload existing leads/i), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith([
        expect.objectContaining({ companyName: "Maple Silver", websiteUrl: "https://maplesilver.ca" }),
      ]),
    );
    expect(screen.getByText(/new searches skip uploaded matches automatically/i)).toBeVisible();
  });

  it("saves instructions and only enables review when leads exist", () => {
    const onInstructionsChange = vi.fn();
    const onReview = vi.fn();
    const { rerender } = render(
      <ExistingLeadsPanel
        apiAvailable
        instructions=""
        isRunning={false}
        leadCount={0}
        onClear={vi.fn()}
        onImport={vi.fn()}
        onInstructionsChange={onInstructionsChange}
        onReview={onReview}
      />,
    );

    expect(screen.getByRole("button", { name: /review uploaded leads/i })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /run instructions/i }), {
      target: { value: "Focus on ready-to-ship chains" },
    });
    expect(onInstructionsChange).toHaveBeenCalledWith("Focus on ready-to-ship chains");

    rerender(
      <ExistingLeadsPanel
        apiAvailable
        instructions="Focus on ready-to-ship chains"
        isRunning={false}
        leadCount={2}
        onClear={vi.fn()}
        onImport={vi.fn()}
        onInstructionsChange={onInstructionsChange}
        onReview={onReview}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /review uploaded leads/i }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });
});
