import type { ScoreWeights } from "@/domain/types";

const LABELS: Record<keyof ScoreWeights, string> = {
  productFit: "Product",
  affordability: "Affordability",
  inventory: "Inventory",
  sellerPriority: "Seller priority",
  contactability: "Contactability",
  presence: "Presence",
};

export function ScoreEquation({ weights }: { weights: ScoreWeights }) {
  const entries = Object.entries(weights) as [keyof ScoreWeights, number][];
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const valid = total === 100 && entries.every(([, value]) => value > 0);

  return (
    <section className="equation" aria-labelledby="equation-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Scoring model</p>
          <h3 id="equation-heading">Live qualification equation</h3>
        </div>
        <p className={`weight-total ${valid ? "is-valid" : "is-invalid"}`} aria-live="polite">
          <strong data-weight-total>{total}</strong>
          <span>/ 100 weight</span>
        </p>
      </div>

      <div className="equation-formula" aria-label="Canada gate multiplied by weighted score">
        <span className="gate-token">Canada</span>
        <span aria-hidden="true">×</span>
        <span className="function-token">max(0,</span>
        <span className="equation-terms">
          {entries.map(([key, value], index) => (
            <span key={key}>
              {index > 0 ? <b aria-hidden="true"> + </b> : null}
              {LABELS[key]} <em>{value}</em>
            </span>
          ))}
          <b aria-hidden="true"> − </b>
          <span>Penalties</span>
        </span>
        <span className="function-token">)</span>
      </div>
      <p className="supporting-copy">
        Canadian location is a permanent pass/fail gate. It is verified before a seller can
        receive a score and cannot be configured.
      </p>
    </section>
  );
}

