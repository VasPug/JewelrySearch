"use client";

import type { ChangeEvent } from "react";

import { DEFAULT_PREFERENCES } from "@/domain/defaults";
import type { RunPreferences, ScoreWeights } from "@/domain/types";

import { ScoreEquation } from "./score-equation";

const WEIGHT_FIELDS: { key: keyof ScoreWeights; label: string; hint: string }[] = [
  { key: "productFit", label: "Product fit", hint: "Metal and category match" },
  { key: "affordability", label: "Affordability", hint: "Price-band alignment" },
  { key: "inventory", label: "Inventory", hint: "Available-to-ship depth" },
  { key: "sellerPriority", label: "Seller priority", hint: "Trade-ready profile" },
  { key: "contactability", label: "Contactability", hint: "Published contact paths" },
  { key: "presence", label: "Presence", hint: "Credible digital footprint" },
];

type RunConfigProps = {
  apiAvailable: boolean;
  isRunning: boolean;
  preferences: RunPreferences;
  onChange: (preferences: RunPreferences) => void;
  onRestoreDefaults: () => void;
  onStart: () => void;
};

export function RunConfig({
  apiAvailable,
  isRunning,
  preferences,
  onChange,
  onRestoreDefaults,
  onStart,
}: RunConfigProps) {
  const canStart = apiAvailable && isValidPreferences(preferences) && !isRunning;
  const estimatedMaximumCost = preferences.maxCandidates * 0.05 + 0.025;

  function setNumber<K extends keyof RunPreferences>(key: K, value: number) {
    onChange({ ...preferences, [key]: value });
  }

  function setWeight(key: keyof ScoreWeights, value: number) {
    onChange({
      ...preferences,
      weights: { ...preferences.weights, [key]: value },
    });
  }

  return (
    <section className="config-stack" aria-labelledby="config-heading">
      <div className="panel panel-config">
        <div className="section-heading section-heading-main">
          <div>
            <h2 id="config-heading">New run</h2>
            <p>Choose the run size, then start.</p>
          </div>
          <button className="text-button" type="button" onClick={onRestoreDefaults}>
            Restore defaults
          </button>
        </div>

        <fieldset className="field-group primary-controls">
          <legend>Basics</legend>
          <div className="control-grid">
            <BoundedField
              label="Accepted lead target"
              max={500}
              min={1}
              onChange={(value) => setNumber("targetLeads", value)}
              suffix="leads"
              value={preferences.targetLeads}
            />
            <BoundedField
              label="Candidate research budget"
              max={1000}
              min={1}
              onChange={(value) => setNumber("maxCandidates", value)}
              suffix="profiles"
              value={preferences.maxCandidates}
            />
            <BoundedField
              label="Qualification threshold"
              max={100}
              min={0}
              onChange={(value) => setNumber("threshold", value)}
              suffix="score"
              value={preferences.threshold}
            />
            <BoundedField
              label="Concurrent research"
              max={8}
              min={1}
              onChange={(value) => setNumber("maxConcurrentResearch", value)}
              suffix="at once"
              value={preferences.maxConcurrentResearch}
            />
          </div>
        </fieldset>

        <details className="advanced-settings model-settings">
          <summary>
            <span>Scoring and product filters</span>
            <small>Optional</small>
          </summary>
          <ScoreEquation weights={preferences.weights} />

          <fieldset className="field-group">
          <legend>Positive score weights</legend>
          <div className="weight-grid">
            {WEIGHT_FIELDS.map(({ key, label, hint }) => (
              <label className="number-field" key={key}>
                <span>
                  <b>{label}</b>
                  <small>{hint}</small>
                </span>
                <span className="number-input">
                  <input
                    aria-label={`${label} weight`}
                    inputMode="numeric"
                    max="100"
                    min="1"
                    onChange={(event) => setWeight(key, numberValue(event))}
                    type="number"
                    value={preferences.weights[key]}
                  />
                  <i>pts</i>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

          <div className="chip-groups">
          <ChipGroup
            items={preferences.acceptedMetals}
            label="Accepted metals"
            onRemove={(item) =>
              onChange({
                ...preferences,
                acceptedMetals: preferences.acceptedMetals.filter((metal) => metal !== item),
              })
            }
          />
          <ChipGroup
            items={preferences.acceptedCategories}
            label="Accepted categories"
            onRemove={(item) =>
              onChange({
                ...preferences,
                acceptedCategories: preferences.acceptedCategories.filter(
                  (category) => category !== item,
                ),
              })
            }
          />
          </div>
        </details>

        <details className="advanced-settings">
          <summary>
            <span>Penalty rules</span>
            <small>Optional</small>
          </summary>
          <div className="control-grid">
            <BoundedField
              label="Meaningful catalog share"
              max={100}
              min={0}
              onChange={(value) => setNumber("unwantedMeaningfulPercent", value)}
              suffix="%"
              value={preferences.unwantedMeaningfulPercent}
            />
            <BoundedField
              label="Meaningful listing count"
              max={100}
              min={0}
              onChange={(value) => setNumber("unwantedMeaningfulCount", value)}
              suffix="items"
              value={preferences.unwantedMeaningfulCount}
            />
            <BoundedField
              label="Low penalty ceiling"
              max={100}
              min={0}
              onChange={(value) => setNumber("unwantedLowMax", value)}
              suffix="CAD"
              value={preferences.unwantedLowMax}
            />
            <BoundedField
              label="Medium penalty ceiling"
              max={200}
              min={0}
              onChange={(value) => setNumber("unwantedMediumMax", value)}
              suffix="CAD"
              value={preferences.unwantedMediumMax}
            />
            <BoundedField
              label="General category rejection"
              max={100}
              min={0}
              onChange={(value) => setNumber("unwantedGeneralRejectAbove", value)}
              suffix="%"
              value={preferences.unwantedGeneralRejectAbove}
            />
            <BoundedField
              label="Moissanite rejection"
              max={100}
              min={0}
              onChange={(value) => setNumber("unwantedMoissaniteRejectAbove", value)}
              suffix="%"
              value={preferences.unwantedMoissaniteRejectAbove}
            />
          </div>
        </details>

        <div className="config-action">
          <div>
            <span className={`status-dot ${apiAvailable ? "is-ready" : ""}`} aria-hidden="true" />
            <p>
              {apiAvailable
                ? "You.com research is configured and ready."
                : "Add YDC_API_KEY to .env.local before starting research."}
            </p>
            <p>Estimated maximum: ~${estimatedMaximumCost.toFixed(2)} USD this run.</p>
          </div>
          <button
            className="primary-button"
            disabled={!canStart}
            onClick={onStart}
            type="button"
          >
            {isRunning ? "Research in progress…" : "Start sourcing run"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function ChipGroup({
  items,
  label,
  onRemove,
}: {
  items: string[];
  label: string;
  onRemove: (item: string) => void;
}) {
  return (
    <div className="chip-group">
      <div className="chip-group-heading">
        <h3>{label}</h3>
        <span>{items.length} accepted</span>
      </div>
      <div className="chip-list" aria-label={label}>
        {items.map((item) => (
          <span data-chip key={item}>
            {item}
            <button aria-label={`Remove ${item}`} onClick={() => onRemove(item)} type="button">
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function BoundedField({
  label,
  max,
  min,
  onChange,
  suffix,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
}) {
  return (
    <label className="control-field">
      <span>{label}</span>
      <span className="number-input">
        <input
          aria-label={label}
          inputMode="numeric"
          max={max}
          min={min}
          onChange={(event) => onChange(numberValue(event))}
          type="number"
          value={value}
        />
        <i>{suffix}</i>
      </span>
    </label>
  );
}

function numberValue(event: ChangeEvent<HTMLInputElement>) {
  return Number(event.currentTarget.value);
}

export function freshDefaultPreferences(): RunPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    weights: { ...DEFAULT_PREFERENCES.weights },
    acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
    acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
  };
}

export function isValidPreferences(preferences: RunPreferences) {
  const weights = Object.values(preferences.weights);

  return (
    weights.reduce((sum, weight) => sum + weight, 0) === 100 &&
    weights.every((weight) => weight > 0 && weight <= 100) &&
    preferences.threshold >= 0 &&
    preferences.threshold <= 100 &&
    preferences.targetLeads >= 1 &&
    preferences.targetLeads <= 500 &&
    preferences.maxCandidates >= 1 &&
    preferences.maxCandidates <= 1000 &&
    preferences.maxConcurrentResearch >= 1 &&
    preferences.maxConcurrentResearch <= 8
  );
}
