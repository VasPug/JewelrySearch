import type { QualifiedLead, ScoreBreakdown } from "@/domain/types";

const COMPONENTS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: "productFit", label: "Product" },
  { key: "affordability", label: "Price" },
  { key: "inventory", label: "Stock" },
  { key: "sellerPriority", label: "Seller" },
  { key: "contactability", label: "Contact" },
  { key: "presence", label: "Presence" },
];

export function EvidencePreview({ leads }: { leads: QualifiedLead[] }) {
  return (
    <section className="evidence-section" aria-labelledby="evidence-heading">
      <div className="section-heading evidence-heading">
        <div>
          <p className="eyebrow">Diagnostic evidence</p>
          <h2 id="evidence-heading">Accepted seller preview</h2>
          <p>Why each company passed—shown for traceability, not manual approval.</p>
        </div>
        <span className="record-count">{leads.length} accepted</span>
      </div>

      {leads.length === 0 ? (
        <div className="panel evidence-empty">
          <div aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>Accepted sellers and their cited evidence will appear after qualification.</p>
        </div>
      ) : (
        <div className="evidence-grid">
          {leads.slice(0, 6).map((lead, index) => (
            <article className="evidence-card" key={`${lead.companyName}-${index}`}>
              <div className="evidence-card-top">
                <div>
                  <span className="seller-index">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{lead.companyName}</h3>
                  <p>
                    {humanize(lead.sellerType) || "Canadian seller"} ·{" "}
                    {lead.mainProductSegment || "Mixed jewelry"}
                  </p>
                </div>
                <div className="score-medallion">
                  <strong>{lead.confidenceScore}</strong>
                  <span>score</span>
                </div>
              </div>

              <dl className="seller-facts">
                <div>
                  <dt>Contact</dt>
                  <dd>
                    {lead.personalEmail || lead.genericEmail || lead.phoneNumber || "Not published"}
                    {lead.personalEmailStatus === "inferred" ? (
                      <span className="inferred-label">Unverified inference</span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Representative product</dt>
                  <dd>
                    {lead.mainProductSegment || "Jewelry catalog"}
                    {lead.pricingTier ? ` · ${lead.pricingTier}` : ""}
                  </dd>
                </div>
              </dl>

              <div className="component-bars" aria-label={`${lead.companyName} score components`}>
                {COMPONENTS.map(({ key, label }) => {
                  const value = lead.scoreBreakdown[key];
                  return (
                    <div key={key}>
                      <span>{label}</span>
                      <i>
                        <b style={{ width: `${Math.min(100, value * 3.33)}%` }} />
                      </i>
                      <em>{value}</em>
                    </div>
                  );
                })}
              </div>

              <div className="evidence-links">
                <span>{lead.evidenceUrls.length} cited sources</span>
                {lead.evidenceUrls.slice(0, 3).map((url, sourceIndex) => (
                  <a href={url} key={url} rel="noreferrer" target="_blank">
                    Source {sourceIndex + 1}
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}
