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
        <strong>Aurum</strong>
      </a>

      <div className="header-meta">
        <div className="header-stat">
          <span>Runs</span>
          <strong>{runCount}</strong>
        </div>
        <div
          className={`api-status ${apiConfigured ? "is-online" : ""}`}
          title={apiConfigured ? "Research API configured" : "Research API not configured"}
        >
          <span aria-hidden="true" />
          {apiConfigured === null
            ? "Checking API"
            : apiConfigured
              ? "Ready"
              : "API key needed"}
        </div>
      </div>
    </header>
  );
}
