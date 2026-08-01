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
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

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

  it("keeps the qualification equation visible without requiring manual setup", () => {
    render(
      <CriteriaAssistant
        apiAvailable
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

    const brief = screen.getByText("Current brief").closest("details");
    expect(brief).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Current brief"));
    expect(brief).toHaveAttribute("open");
    expect(screen.getByText(/canada × weighted fit/i)).toHaveTextContent(
      `Canada × weighted fit − penalties · ${DEFAULT_PREFERENCES.threshold}+ qualifies`,
    );
    fireEvent.click(screen.getByText("Weights"));
    expect(screen.getByText("max(0, weighted fit − penalties)")).toBeVisible();
    expect(screen.getByText("30")).toBeVisible();
    expect(screen.getByText(/aurum proposes the weights/i)).toBeVisible();
  });

  it("keeps the newest conversation message in view", async () => {
    const baseProps = {
      apiAvailable: true,
      feedback: [],
      instructions: "",
      onApply: vi.fn(),
      onMessagesChange: vi.fn(),
      preferences: {
        ...DEFAULT_PREFERENCES,
        weights: { ...DEFAULT_PREFERENCES.weights },
        acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
        acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
        avoidTerms: [],
      },
    };
    const firstMessage = {
      id: "message-1",
      role: "user" as const,
      content: "Find wholesalers",
      createdAt: "2026-07-31T00:00:00.000Z",
    };
    const { rerender } = render(
      <CriteriaAssistant {...baseProps} messages={[firstMessage]} />,
    );
    const conversation = screen.getByLabelText("Conversation");
    Object.defineProperty(conversation, "scrollHeight", { configurable: true, value: 420 });

    rerender(
      <CriteriaAssistant
        {...baseProps}
        messages={[
          firstMessage,
          {
            id: "message-2",
            role: "assistant",
            content: "Wholesalers are now preferred.",
            createdAt: "2026-07-31T00:00:01.000Z",
          },
        ]}
      />,
    );

    await waitFor(() => expect(conversation.scrollTop).toBe(420));
  });

  it("turns a direct chat search command into a confirmation instead of starting immediately", () => {
    const onStart = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CriteriaAssistant
        apiAvailable
        feedback={[]}
        instructions=""
        messages={[]}
        onApply={vi.fn()}
        onMessagesChange={vi.fn()}
        onStart={onStart}
        preferences={{
          ...DEFAULT_PREFERENCES,
          weights: { ...DEFAULT_PREFERENCES.weights },
          acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
          acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
          avoidTerms: [...DEFAULT_PREFERENCES.avoidTerms],
        }}
        researchAvailable
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", { name: /describe or change the lead criteria/i }),
      { target: { value: "Start the search" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: /confirm lead search/i })).toBeVisible();
    expect(screen.getByText(/ready to find 5 strong leads/i)).toBeVisible();
    expect(screen.getByText(/research up to 20 sites/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Start search" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: /confirm lead search/i })).not.toBeInTheDocument();
  });

  it("updates a mixed request before offering to start the search", async () => {
    const onApply = vi.fn();
    const onStart = vi.fn();
    const response = {
      assistantReply: "The target is now 10 strong leads.",
      instructions: "",
      preferences: {
        ...DEFAULT_PREFERENCES,
        targetLeads: 10,
        weights: { ...DEFAULT_PREFERENCES.weights },
        acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
        acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
        avoidTerms: [...DEFAULT_PREFERENCES.avoidTerms],
      },
      summary: {
        mustHave: ["Verified Canadian location"],
        prefer: [],
        avoid: [],
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
        onMessagesChange={vi.fn()}
        onStart={onStart}
        preferences={{
          ...DEFAULT_PREFERENCES,
          weights: { ...DEFAULT_PREFERENCES.weights },
          acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
          acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
          avoidTerms: [...DEFAULT_PREFERENCES.avoidTerms],
        }}
        researchAvailable
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", { name: /describe or change the lead criteria/i }),
      { target: { value: "Find 10 strong leads and keep the search strict" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(response));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: /confirm lead search/i })).toBeVisible();
  });

  it("lets the user dismiss a proposed search and return to editing", () => {
    render(
      <CriteriaAssistant
        apiAvailable
        feedback={[]}
        instructions=""
        messages={[]}
        onApply={vi.fn()}
        onMessagesChange={vi.fn()}
        onStart={vi.fn()}
        preferences={{
          ...DEFAULT_PREFERENCES,
          weights: { ...DEFAULT_PREFERENCES.weights },
          acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
          acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
          avoidTerms: [...DEFAULT_PREFERENCES.avoidTerms],
        }}
        researchAvailable
      />,
    );

    const composer = screen.getByRole("textbox", { name: /describe or change the lead criteria/i });
    fireEvent.change(composer, { target: { value: "Run it" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("group", { name: /confirm lead search/i })).not.toBeInTheDocument();
    expect(composer).toHaveFocus();
  });

  it("does not mistake a preference request for a search command", async () => {
    const response = {
      assistantReply: "Wholesalers are now preferred.",
      instructions: "Prioritize wholesalers.",
      preferences: {
        ...DEFAULT_PREFERENCES,
        weights: { ...DEFAULT_PREFERENCES.weights },
        acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
        acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
        avoidTerms: [...DEFAULT_PREFERENCES.avoidTerms],
      },
      summary: { mustHave: [], prefer: ["Wholesalers"], avoid: [] },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response)));

    render(
      <CriteriaAssistant
        apiAvailable
        feedback={[]}
        instructions=""
        messages={[]}
        onApply={vi.fn()}
        onMessagesChange={vi.fn()}
        onStart={vi.fn()}
        preferences={{
          ...DEFAULT_PREFERENCES,
          weights: { ...DEFAULT_PREFERENCES.weights },
          acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
          acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
          avoidTerms: [...DEFAULT_PREFERENCES.avoidTerms],
        }}
        researchAvailable
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", { name: /describe or change the lead criteria/i }),
      { target: { value: "Find wholesalers with ready-to-ship inventory" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.queryByText(/updating your criteria/i)).not.toBeInTheDocument());
    expect(screen.queryByRole("group", { name: /confirm lead search/i })).not.toBeInTheDocument();
  });

  it("summarizes active background research inside the chat controls", () => {
    render(
      <CriteriaAssistant
        apiAvailable
        feedback={[]}
        instructions=""
        isRunning
        messages={[]}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        onMessagesChange={vi.fn()}
        preferences={{
          ...DEFAULT_PREFERENCES,
          weights: { ...DEFAULT_PREFERENCES.weights },
          acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
          acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
          avoidTerms: [...DEFAULT_PREFERENCES.avoidTerms],
        }}
        researchAvailable
        run={{
          id: "run-live",
          startedAt: "2026-07-31T00:00:00.000Z",
          completedAt: null,
          stage: "researching",
          outcome: null,
          preferences: { ...DEFAULT_PREFERENCES },
          discoveredCount: 6,
          researchedCount: 4,
          qualifiedCount: 2,
          rejectedCount: 1,
          deduplicatedCount: 0,
          researchLimitReached: false,
          leads: [],
          rejectionReasons: {},
          rejectedEvidence: {},
          error: null,
          issues: [],
          activity: [],
          activeCandidates: [{ id: "seller-1", companyName: "Silver House" }],
        }}
      />,
    );

    expect(screen.getByText("Researching evidence")).toBeVisible();
    expect(screen.getByText("Checking Silver House")).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop search" })).toBeVisible();
  });

  it("shows the failure reason and retry action in the chat controls", () => {
    render(
      <CriteriaAssistant
        apiAvailable
        feedback={[]}
        instructions=""
        messages={[]}
        onApply={vi.fn()}
        onMessagesChange={vi.fn()}
        onStart={vi.fn()}
        preferences={{
          ...DEFAULT_PREFERENCES,
          weights: { ...DEFAULT_PREFERENCES.weights },
          acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
          acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
          avoidTerms: [...DEFAULT_PREFERENCES.avoidTerms],
        }}
        researchAvailable
        run={{
          id: "run-failed",
          startedAt: "2026-07-31T00:00:00.000Z",
          completedAt: "2026-07-31T00:01:00.000Z",
          stage: "failed",
          outcome: "failed",
          preferences: { ...DEFAULT_PREFERENCES },
          discoveredCount: 0,
          researchedCount: 0,
          qualifiedCount: 0,
          rejectedCount: 0,
          deduplicatedCount: 0,
          researchLimitReached: false,
          leads: [],
          rejectionReasons: {},
          rejectedEvidence: {},
          error: "The research provider is rate-limiting requests. Wait a moment, then retry.",
        }}
      />,
    );

    expect(screen.getByText("Search failed")).toBeVisible();
    expect(screen.getByText(/rate-limiting requests/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /retry search/i })).toBeVisible();
  });
});
