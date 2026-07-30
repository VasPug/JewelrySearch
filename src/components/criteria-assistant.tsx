"use client";

import { type FormEvent, useState } from "react";

import type { CriteriaResponse } from "@/ai/criteria";
import type { CriteriaChatMessage, RunPreferences } from "@/domain/types";

type FeedbackExample = {
  companyName: string;
  status: "good" | "not_fit" | "already_known";
  notes: string;
};

type CriteriaAssistantProps = {
  apiAvailable: boolean;
  feedback: FeedbackExample[];
  instructions: string;
  messages: CriteriaChatMessage[];
  preferences: RunPreferences;
  onApply: (response: CriteriaResponse) => void;
  onMessagesChange: (messages: CriteriaChatMessage[]) => void;
};

const STARTER_PROMPTS = [
  "Prioritize specialized wholesalers and exclude retailers.",
  "Learn from my reviewed leads.",
  "Find 10 strong leads and keep the search strict.",
];

export function CriteriaAssistant({
  apiAvailable,
  feedback,
  instructions,
  messages,
  preferences,
  onApply,
  onMessagesChange,
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
          <p className="eyebrow">GPT-5 Nano assistant</p>
          <h2 id="criteria-assistant-heading">Describe a good lead</h2>
          <p>Use plain language. I’ll update the search rules; you keep the final decision.</p>
        </div>
        <span className={`assistant-status ${apiAvailable ? "is-ready" : ""}`}>
          {apiAvailable ? "Ready" : "API key needed"}
        </span>
      </div>

      <div className="chat-thread" aria-live="polite">
        <div className="chat-message is-assistant">
          Tell me who you want to find, what matters most, and what should never be included.
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

      {messages.length === 0 ? (
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
          rows={3}
          value={draft}
        />
        <button disabled={!apiAvailable || !draft.trim() || isThinking} type="submit">
          Apply
        </button>
      </form>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <p className="assistant-footnote">
        The assistant edits saved criteria only. It does not start research or make the final lead decision.
      </p>
    </section>
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
