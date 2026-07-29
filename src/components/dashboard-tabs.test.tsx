import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DashboardTabs } from "./dashboard-tabs";

afterEach(cleanup);

describe("DashboardTabs", () => {
  it("switches between the search workspace and brief usage instructions", () => {
    render(<DashboardTabs searchContent={<div>Search workspace</div>} />);

    expect(screen.getByText("Search workspace")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "How to use" }));

    expect(screen.queryByText("Search workspace")).not.toBeInTheDocument();
    expect(screen.getByText("Set your limits")).toBeVisible();
    expect(screen.getByText("Run the search")).toBeVisible();
    expect(screen.getByText("Download the XLSX")).toBeVisible();
  });

  it("supports arrow-key navigation between tabs", () => {
    render(<DashboardTabs searchContent={<div>Search workspace</div>} />);
    const searchTab = screen.getByRole("tab", { name: "Search" });
    const helpTab = screen.getByRole("tab", { name: "How to use" });

    searchTab.focus();
    fireEvent.keyDown(searchTab, { key: "ArrowRight" });

    expect(helpTab).toHaveFocus();
    expect(helpTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Set your limits")).toBeVisible();
  });
});
