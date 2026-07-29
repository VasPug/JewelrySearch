export function DashboardHeader({
  apiConfigured,
  runCount,
}: {
  apiConfigured: boolean | null;
  runCount: number;
}) {
  return (
    <header className="dashboard-header">
      <a className="brand" href="#top" aria-label="Aurum Sourcing home">
        <span aria-hidden="true">A</span>
        <strong>
          Aurum <i>/</i> Sourcing
        </strong>
      </a>

      <div className="header-meta">
        <div className="header-stat">
          <span>Research ledger</span>
          <strong>{runCount} saved runs</strong>
        </div>
        <div
          className={`api-status ${apiConfigured ? "is-online" : ""}`}
          title={apiConfigured ? "Research API configured" : "Research API not configured"}
        >
          <span aria-hidden="true" />
          {apiConfigured === null
            ? "Checking API"
            : apiConfigured
              ? "Research online"
              : "Setup required"}
        </div>
      </div>
    </header>
  );
}

