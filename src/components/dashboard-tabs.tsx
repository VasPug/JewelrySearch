"use client";

import { type KeyboardEvent, type ReactNode, useState } from "react";

export function DashboardTabs({ searchContent }: { searchContent: ReactNode }) {
  const [activeTab, setActiveTab] = useState<"search" | "help">("search");

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const nextTab =
      event.key === "ArrowRight" || event.key === "End"
        ? "help"
        : event.key === "ArrowLeft" || event.key === "Home"
          ? "search"
          : null;
    if (!nextTab) return;

    event.preventDefault();
    setActiveTab(nextTab);
    document.getElementById(`${nextTab}-tab`)?.focus();
  }

  return (
    <>
      <div aria-label="Dashboard sections" className="dashboard-tabs" role="tablist">
        <button
          aria-controls="search-panel"
          aria-selected={activeTab === "search"}
          id="search-tab"
          onKeyDown={handleTabKey}
          onClick={() => setActiveTab("search")}
          role="tab"
          tabIndex={activeTab === "search" ? 0 : -1}
          type="button"
        >
          Search
        </button>
        <button
          aria-controls="help-panel"
          aria-selected={activeTab === "help"}
          id="help-tab"
          onKeyDown={handleTabKey}
          onClick={() => setActiveTab("help")}
          role="tab"
          tabIndex={activeTab === "help" ? 0 : -1}
          type="button"
        >
          How to use
        </button>
      </div>

      {activeTab === "search" ? (
        <div aria-labelledby="search-tab" id="search-panel" role="tabpanel">
          {searchContent}
        </div>
      ) : (
        <section
          aria-labelledby="help-tab"
          className="panel how-to-panel"
          id="help-panel"
          role="tabpanel"
        >
          <ol>
            <li>
              <strong>Set your limits</strong>
              <span>Choose the lead target, research budget, and score threshold.</span>
            </li>
            <li>
              <strong>Run the search</strong>
              <span>Click Start and leave the page open while it researches sellers.</span>
            </li>
            <li>
              <strong>Download the XLSX</strong>
              <span>Export the finished run for separate Accepted and Rejected tabs.</span>
            </li>
          </ol>
        </section>
      )}
    </>
  );
}
