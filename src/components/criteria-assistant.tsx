"use client";

import { type FormEvent, useState } from "react";

import type { CriteriaResponse } from "@/ai/criteria";
import type { CriteriaChatMessage, RunPreferences, ScoreWeights } from "@/domain/types";

type FeedbackExample = {
  companyName: string;
  status: "good" | "maybe" | "not_fit" | "already_known";
  notes: string;
};

type CriteriaAssistantProps = {
  apiAvailable: boolean;
  feedback: FeedbackExample[];
  instructions: string;
  isRunning?: boolean;
  messages: CriteriaChatMessage[];
  preferences: RunPreferences;
  researchAvailable?: boolean;
  onApply: (response: CriteriaResponse) => void;
  onCancel?: () => void;
  onMessagesChange: (messages: CriteriaChatMessage[]) => void;
  onStart?: () => void;
};

const STARTER_PROMPTS = [
  "Prioritize specialized wholesalers and exclude retailers.",
  "Learn from my reviewed leads.",
  "Find 10 strong leads and keep the search strict.",
];

const SCORE_LABELS: Record<keyof ScoreWeights, string> = {
  productFit: "Product",
  affordability: "Price",
  inventory: "Inventory",
  sellerPriority: "Seller",
  contactability: "Contact",
  presence: "Presence",
};

export function CriteriaAssistant({
  apiAvailable,
  feedback,
  instructions,
  isRunning = false,
  messages,
  preferences,
  researchAvailable = false,
  onApply,
  onCancel,
  onMessagesChange,
  onStart,
}: CriteriaAssistantProps) {
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState("");

  async function submit(message: string) {
    const trimmed = message.trim();
    if (!trimmed || !apiAvailable || isThinking) return;

    const userMessage = chatMessage("user", trimmed);
    const nextMessages = [...messages, userMessage].slice(-12);
    onMessagesChange(nextMessages);
    setDraft("");
    setError("");
    setIsThinking(true);

    try {
      const response = await fetch("/api/criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          preferences,
          instructions,
          feedback: feedback.slice(0, 20),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | CriteriaResponse
        | { error?: string }
        | null;

      if (!response.ok || !isCriteriaResponse(payload)) {
        throw new Error(
          readError(payload) || "The search assistant is temporarily unavailable.",
        );
      }

      onApply(payload);
      onMessagesChange(
        [...nextMessages, chatMessage("assistant", payload.assistantReply)].slice(-12),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The search assistant is unavailable.");
    } finally {
      setIsThinking(false);
    }
  }

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(draft);
  }

  return (
    <section className="panel criteria-assistant" aria-labelledby="criteria-assistant-heading">
      <div className="criteria-assistant-heading">
        <div>
          <span className="assistant-avatar" aria-hidden="true">A</span>
          <span>
            <h2 id="criteria-assistant-heading">Aurum assistant</h2>
            <p>GPT-5.6 Luna · remembers your feedback</p>
          </span>
        </div>
        <span className={`assistant-status ${apiAvailable ? "is-ready" : ""}`}>
          {apiAvailable ? "Ready" : "API key needed"}
        </span>
      </div>

      <div className="chat-thread" aria-live="polite">
        <div className="chat-message is-assistant">
          Tell me what a great lead looks like—and what I should avoid. I’ll turn that into a
          search, review every result, and show you the evidence.
        </div>
        {messages.map((message) => (
          <div
            className={`chat-message ${message.role === "user" ? "is-user" : "is-assistant"}`}
            key={message.id}
          >
            {message.content}
          </div>
        ))}
        {isThinking ? (
          <div className="chat-message is-assistant is-thinking">Updating your criteria…</div>
        ) : null}
      </div>

      <div className="criteria-readback" aria-label="Current search understanding">
        <CriteriaReadback
          items={["Verified Canadian location", ...preferences.acceptedCategories.slice(0, 3)]}
          label="Must match"
        />
        <CriteriaReadback
          items={[
            ...preferences.acceptedMetals.slice(0, 3),
            ...(instructions ? [instructions] : []),
          ]}
          label="Prefer"
        />
        <CriteriaReadback
          empty="Nothing yet"
          items={(preferences.avoidTerms ?? []).slice(0, 4)}
          label="Avoid"
        />
      </div>

      <ScoringPreview preferences={preferences} />

      {messages.length === 0 && apiAvailable ? (
        <div className="starter-prompts" aria-label="Suggested prompts">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              disabled={!apiAvailable || isThinking}
              key={prompt}
              onClick={() => void submit(prompt)}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      <form className="chat-composer" onSubmit={submitDraft}>
        <textarea
          aria-label="Describe or change the lead criteria"
          disabled={!apiAvailable || isThinking}
          maxLength={1000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={
            apiAvailable
              ? "Example: Exclude retailers and prioritize Canadian findings wholesalers"
              : "Add OPENAI_API_KEY to enable the assistant"
          }
          rows={2}
          value={draft}
        />
        <button disabled={!apiAvailable || !draft.trim() || isThinking} type="submit">
          Send
        </button>
      </form>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <div className="assistant-run-action">
        <span>
          <strong>{preferences.targetLeads} strong leads</strong>
          <small>Up to {preferences.maxCandidates} sites researched</small>
        </span>
        {isRunning ? (
          <button className="cancel-run-button" onClick={onCancel} type="button">
            Stop search
          </button>
        ) : (
          <button
            className="start-search-button"
            disabled={!researchAvailable}
            onClick={onStart}
            type="button"
          >
            Find leads <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
      {!researchAvailable ? (
        <p className="assistant-footnote">Add YDC_API_KEY to enable web research.</p>
      ) : !apiAvailable ? (
        <p className="assistant-footnote">
          Web research is ready. Add OPENAI_API_KEY to edit criteria through chat.
        </p>
      ) : (
        <p className="assistant-footnote">You make the final call on every recommendation.</p>
      )}
    </section>
  );
}

function ScoringPreview({ preferences }: { preferences: RunPreferences }) {
  const entries = Object.entries(preferences.weights) as [keyof ScoreWeights, number][];

  return (
    <details className="assistant-scoring">
      <summary>
        <span>
          <small>Transparent scoring</small>
          <strong>Canada × weighted fit − penalties · {preferences.threshold}+ qualifies</strong>
        </span>
        <span className="scoring-summary-action">Weights</span>
      </summary>
      <div className="assistant-scoring-body">
        <p className="assistant-formula">
          <b>Canada verified</b>
          <span aria-hidden="true">×</span>
          <span>max(0, weighted fit − penalties)</span>
        </p>
        <dl className="assistant-weight-list" aria-label="Current score weights">
          {entries.map(([key, value]) => (
            <div key={key}>
              <dt>{SCORE_LABELS[key]}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="assistant-scoring-note">
          Aurum proposes the weights from your brief and review history. You can inspect or
          override them in Search settings.
        </p>
      </div>
    </details>
  );
}

function chatMessage(
  role: CriteriaChatMessage["role"],
  content: string,
): CriteriaChatMessage {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function CriteriaReadback({
  empty,
  items,
  label,
}: {
  empty?: string;
  items: string[];
  label: string;
}) {
  return (
    <div>
      <strong>{label}</strong>
      <p>{items.length ? items.join(" · ") : empty}</p>
    </div>
  );
}

function isCriteriaResponse(value: unknown): value is CriteriaResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "assistantReply" in value &&
    typeof value.assistantReply === "string" &&
    "preferences" in value &&
    typeof value.preferences === "object" &&
    value.preferences !== null &&
    "instructions" in value &&
    typeof value.instructions === "string" &&
    "summary" in value &&
    typeof value.summary === "object" &&
    value.summary !== null
  );
}

function readError(value: unknown): string {
  return typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
    ? value.error
    : "";
}
