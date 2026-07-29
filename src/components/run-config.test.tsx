import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES } from "@/domain/defaults";
import type { RunPreferences } from "@/domain/types";

import { isValidPreferences, RunConfig } from "./run-config";

afterEach(cleanup);

function renderConfig(overrides: Partial<RunPreferences> = {}) {
  const preferences: RunPreferences = {
    ...DEFAULT_PREFERENCES,
    ...overrides,
    weights: {
      ...DEFAULT_PREFERENCES.weights,
      ...overrides.weights,
    },
    acceptedMetals: [...(overrides.acceptedMetals ?? DEFAULT_PREFERENCES.acceptedMetals)],
    acceptedCategories: [
      ...(overrides.acceptedCategories ?? DEFAULT_PREFERENCES.acceptedCategories),
    ],
  };
  const onChange = vi.fn();
  const onStart = vi.fn();
  const onRestoreDefaults = vi.fn();

  const result = render(
    <RunConfig
      apiAvailable
      isRunning={false}
      onChange={onChange}
      onRestoreDefaults={onRestoreDefaults}
      onStart={onStart}
      preferences={preferences}
    />,
  );

  return { ...result, onChange, onRestoreDefaults, onStart, preferences };
}

describe("RunConfig", () => {
  it("keeps Start disabled until editable positive weights total 100", () => {
    const { onChange, onStart } = renderConfig();
    const startButton = screen.getByRole("button", { name: /start sourcing run/i });

    expect(screen.getByText("100", { selector: "[data-weight-total]" })).toBeInTheDocument();
    expect(startButton).toBeEnabled();

    fireEvent.change(screen.getByRole("spinbutton", { name: /product fit/i }), {
      target: { value: "29" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        weights: expect.objectContaining({ productFit: 29 }),
      }),
    );

    resultRerenderWithInvalidWeights();
    expect(screen.getByText("99", { selector: "[data-weight-total]" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start sourcing run/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /start sourcing run/i }));
    expect(onStart).not.toHaveBeenCalled();
  });

  it("presents Canada as a permanent gate rather than a location preference", () => {
    renderConfig();

    expect(screen.getByText(/Canadian location is a permanent pass\/fail gate/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /canada/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /location/i })).not.toBeInTheDocument();
  });

  it("removes accepted chips and restores the frozen defaults", () => {
    const { onChange, onRestoreDefaults } = renderConfig();
    const silverChip = screen.getByText("0.925 sterling silver").closest("[data-chip]");

    expect(silverChip).not.toBeNull();
    fireEvent.click(
      within(silverChip as HTMLElement).getByRole("button", {
        name: /remove 0.925 sterling silver/i,
      }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedMetals: DEFAULT_PREFERENCES.acceptedMetals.slice(1),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /restore defaults/i }));
    expect(onRestoreDefaults).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["metal", "Accepted metals", "stainless steel", "acceptedMetals"],
    ["category", "Accepted categories", "necklaces", "acceptedCategories"],
    ["avoid rule", "Avoid", "marketplace", "avoidTerms"],
  ] as const)("adds a new accepted %s", (_, label, value, preferenceKey) => {
    const { onChange } = renderConfig();

    fireEvent.change(screen.getByRole("textbox", { name: `Add ${label.toLowerCase()}` }), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: `Add to ${label.toLowerCase()}` }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        [preferenceKey]: [...DEFAULT_PREFERENCES[preferenceKey], value],
      }),
    );
  });

  it("enforces threshold, target, candidate budget, and concurrency bounds", () => {
    renderConfig();

    expect(screen.getByRole("spinbutton", { name: /qualification threshold/i })).toHaveAttribute(
      "min",
      "0",
    );
    expect(screen.getByRole("spinbutton", { name: /qualification threshold/i })).toHaveAttribute(
      "max",
      "100",
    );
    expect(screen.getByRole("spinbutton", { name: /accepted lead target/i })).toHaveAttribute(
      "min",
      "1",
    );
    expect(screen.getByRole("spinbutton", { name: /candidate research budget/i })).toHaveAttribute(
      "max",
      "1000",
    );
    expect(screen.getByRole("spinbutton", { name: /concurrent research/i })).toHaveAttribute(
      "max",
      "8",
    );
  });

  it("labels rejection price ceilings in CAD", () => {
    renderConfig();

    const generalField = screen.getByRole("spinbutton", {
      name: /general category rejection/i,
    }).closest("label");
    const moissaniteField = screen.getByRole("spinbutton", {
      name: /moissanite rejection/i,
    }).closest("label");

    expect(generalField).toHaveTextContent("CAD");
    expect(moissaniteField).toHaveTextContent("CAD");
  });

  it("updates the qualification threshold used by the Accepted workbook tab", () => {
    const { onChange } = renderConfig();

    expect(screen.getByText(/changes save automatically in this browser/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: /qualification threshold/i }), {
      target: { value: "45" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        threshold: 45,
      }),
    );
    expect(screen.getByText(/accepted tab/i)).toBeInTheDocument();
  });

  it("disables Start when the server API is unavailable", () => {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      weights: { ...DEFAULT_PREFERENCES.weights },
      acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
      acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
    };

    render(
      <RunConfig
        apiAvailable={false}
        isRunning={false}
        onChange={vi.fn()}
        onRestoreDefaults={vi.fn()}
        onStart={vi.fn()}
        preferences={preferences}
      />,
    );

    expect(screen.getByRole("button", { name: /start sourcing run/i })).toBeDisabled();
    expect(screen.getByText(/add YDC_API_KEY/i)).toBeVisible();
  });

  it("identifies only bounded configurations as safe to persist", () => {
    expect(isValidPreferences(freshPreferences())).toBe(true);
    expect(isValidPreferences(freshPreferences({ targetLeads: 0 }))).toBe(false);
    expect(isValidPreferences(freshPreferences({ maxCandidates: 1001 }))).toBe(false);
    expect(
      isValidPreferences(
        freshPreferences({
          weights: { ...DEFAULT_PREFERENCES.weights, productFit: 29 },
        }),
      ),
    ).toBe(false);
    expect(
      isValidPreferences(
        freshPreferences({
          unwantedMediumMax: 80,
          unwantedGeneralRejectAbove: 70,
        }),
      ),
    ).toBe(false);
  });
});

function resultRerenderWithInvalidWeights() {
  cleanup();
  render(
    <RunConfig
      apiAvailable
      isRunning={false}
      onChange={vi.fn()}
      onRestoreDefaults={vi.fn()}
      onStart={vi.fn()}
      preferences={{
        ...DEFAULT_PREFERENCES,
        weights: {
          ...DEFAULT_PREFERENCES.weights,
          productFit: 29,
        },
        acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
        acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
      }}
    />,
  );
}

function freshPreferences(overrides: Partial<RunPreferences> = {}): RunPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...overrides,
    weights: {
      ...DEFAULT_PREFERENCES.weights,
      ...overrides.weights,
    },
    acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
    acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
    avoidTerms: [...(overrides.avoidTerms ?? DEFAULT_PREFERENCES.avoidTerms)],
  };
}
