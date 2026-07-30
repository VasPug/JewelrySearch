import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES } from "@/domain/defaults";

import { CriteriaAssistant } from "./criteria-assistant";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CriteriaAssistant", () => {
  it("turns a plain-language request into applied criteria and chat history", async () => {
    const onApply = vi.fn();
    const onMessagesChange = vi.fn();
    const response = {
      assistantReply: "Retailers are now excluded. Wholesalers remain preferred.",
      instructions: "Prioritize specialized wholesalers.",
      preferences: {
        ...DEFAULT_PREFERENCES,
        weights: { ...DEFAULT_PREFERENCES.weights },
        acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
        acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
        avoidTerms: ["retailer"],
      },
      summary: {
        mustHave: ["Verified Canadian location"],
        prefer: ["Wholesalers"],
        avoid: ["Retailers"],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response)));

    render(
      <CriteriaAssistant
        apiAvailable
        feedback={[]}
        instructions=""
        messages={[]}
        onApply={onApply}
        onMessagesChange={onMessagesChange}
        preferences={{
          ...DEFAULT_PREFERENCES,
          weights: { ...DEFAULT_PREFERENCES.weights },
          acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
          acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
          avoidTerms: [],
        }}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", { name: /describe or change the lead criteria/i }),
      { target: { value: "Exclude retailers and prioritize wholesalers" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(response));
    expect(onMessagesChange).toHaveBeenCalledTimes(2);
    expect(onMessagesChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        role: "user",
        content: "Exclude retailers and prioritize wholesalers",
      }),
      expect.objectContaining({
        role: "assistant",
        content: response.assistantReply,
      }),
    ]);
  });

  it("explains how to enable the assistant when no OpenAI key is configured", () => {
    render(
      <CriteriaAssistant
        apiAvailable={false}
        feedback={[]}
        instructions=""
        messages={[]}
        onApply={vi.fn()}
        onMessagesChange={vi.fn()}
        preferences={{
          ...DEFAULT_PREFERENCES,
          weights: { ...DEFAULT_PREFERENCES.weights },
          acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
          acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
          avoidTerms: [],
        }}
      />,
    );

    expect(screen.getByText("API key needed")).toBeVisible();
    expect(
      screen.getByPlaceholderText(/add OPENAI_API_KEY to enable the assistant/i),
    ).toBeDisabled();
  });
});
