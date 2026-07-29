"use client";

import { type ReactNode, useState } from "react";

export function DashboardTabs({ searchContent }: { searchContent: ReactNode }) {
  const [activeTab, setActiveTab] = useState<"search" | "help">("search");

  return (
    <>
      <div aria-label="Dashboard sections" className="dashboard-tabs" role="tablist">
        <button
          aria-controls="search-panel"
          aria-selected={activeTab === "search"}
          id="search-tab"
          onClick={() => setActiveTab("search")}
          role="tab"
          type="button"
        >
          Search
        </button>
        <button
          aria-controls="help-panel"
          aria-selected={activeTab === "help"}
          id="help-tab"
          onClick={() => setActiveTab("help")}
          role="tab"
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
