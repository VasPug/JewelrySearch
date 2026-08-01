"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import type { CriteriaResponse } from "@/ai/criteria";
import type {
  CriteriaChatMessage,
  RunPreferences,
  RunRecord,
  RunStage,
  ScoreWeights,
} from "@/domain/types";
import {
  activeCandidateLabel,
  compactRunCounts,
  runIssueCount,
} from "@/domain/run-observability";

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
  run?: RunRecord | null;
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
  run = null,
  researchAvailable = false,
  onApply,
  onCancel,
  onMessagesChange,
  onStart,
}: CriteriaAssistantProps) {
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState("");
  const [pendingSearch, setPendingSearch] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [isThinking, messages, pendingSearch]);

  async function submit(message: string) {
    const trimmed = message.trim();
    if (!trimmed || !apiAvailable || isThinking) return;

    const userMessage = chatMessage("user", trimmed);
    const nextMessages = [...messages, userMessage].slice(-12);
    const searchRequested = requestsSearchConfirmation(trimmed);
    onMessagesChange(nextMessages);
    setDraft("");
    setError("");
    setPendingSearch(false);

    if (searchRequested && isStandaloneSearchCommand(trimmed)) {
      if (isRunning) {
        onMessagesChange([
          ...nextMessages,
          chatMessage("assistant", "A search is already running. Stop it before starting another."),
        ].slice(-12));
      } else {
        setPendingSearch(true);
      }
      return;
    }

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
      if (searchRequested && !isRunning) setPendingSearch(true);
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

      <div
        aria-label="Conversation"
        aria-live="polite"
        className="chat-thread"
        ref={threadRef}
      >
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
        {pendingSearch ? (
          <SearchConfirmation
            onDismiss={() => {
              setPendingSearch(false);
              composerRef.current?.focus();
            }}
            onStart={() => {
              setPendingSearch(false);
              onStart?.();
            }}
            preferences={preferences}
            researchAvailable={researchAvailable}
          />
        ) : null}
        {isThinking ? (
          <div className="chat-message is-assistant is-thinking">Updating your criteria…</div>
        ) : null}
      </div>

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

      <CurrentBrief instructions={instructions} preferences={preferences} />

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
          ref={composerRef}
          value={draft}
        />
        <button disabled={!apiAvailable || !draft.trim() || isThinking} type="submit">
          Send
        </button>
      </form>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <div className="assistant-run-action">
        <span>
          <strong>
            {isRunning
              ? runStageLabel(run?.stage)
              : run && isRecoverableRun(run)
                ? run.outcome === "partial"
                  ? "Partial results kept"
                  : "Search failed"
                : `${preferences.targetLeads} strong leads`}
          </strong>
          <small>
            {isRunning
              ? run
                ? activeCandidateLabel(run) || compactRunCounts(run)
                : "Preparing the research run"
              : run && isRecoverableRun(run)
                ? terminalRunSummary(run)
              : `Up to ${preferences.maxCandidates} sites researched`}
          </small>
        </span>
        {isRunning ? (
          <button className="cancel-run-button" onClick={onCancel} type="button">
            Stop search
          </button>
        ) : (
          <button
            className="start-search-button"
            disabled={!researchAvailable}
            onClick={() => {
              setPendingSearch(false);
              onStart?.();
            }}
            type="button"
          >
            {run && isRecoverableRun(run) ? "Retry search" : "Find leads"}{" "}
            <span aria-hidden="true">→</span>
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

function SearchConfirmation({
  onDismiss,
  onStart,
  preferences,
  researchAvailable,
}: {
  onDismiss: () => void;
  onStart: () => void;
  preferences: RunPreferences;
  researchAvailable: boolean;
}) {
  return (
    <div aria-label="Confirm lead search" className="search-confirmation" role="group">
      <strong>Ready to find {preferences.targetLeads} strong leads</strong>
      <p>
        {researchAvailable
          ? `Aurum will research up to ${preferences.maxCandidates} sites using your current brief.`
          : "Web research needs a YDC API key before this search can start."}
      </p>
      <div className="search-confirmation-actions">
        <button disabled={!researchAvailable} onClick={onStart} type="button">
          Start search
        </button>
        <button onClick={onDismiss} type="button">Keep editing</button>
      </div>
    </div>
  );
}

function CurrentBrief({
  instructions,
  preferences,
}: {
  instructions: string;
  preferences: RunPreferences;
}) {
  const exclusions = preferences.avoidTerms ?? [];

  return (
    <details className="current-brief">
      <summary>
        <span>
          <strong>Current brief</strong>
          <small>
            Canada · {quantityLabel(preferences.acceptedCategories.length, "category", "categories")} ·{" "}
            {quantityLabel(preferences.acceptedMetals.length, "metal", "metals")} ·{" "}
            {quantityLabel(exclusions.length, "exclusion", "exclusions")} · {preferences.threshold}+ qualifies
          </small>
        </span>
        <span className="current-brief-action">Review</span>
      </summary>
      <div className="current-brief-body">
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
            items={exclusions.slice(0, 4)}
            label="Avoid"
          />
        </div>
        <ScoringPreview preferences={preferences} />
      </div>
    </details>
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

function requestsSearchConfirmation(message: string): boolean {
  const normalized = normalizeCommand(message);
  if (/\b(?:do not|don't|dont|not yet|wait|later|hold off)\b/.test(normalized)) {
    return false;
  }

  return (
    /\b(?:start|begin|launch)\s+(?:(?:the|a|my|this|our)\s+)?(?:lead\s+)?(?:search|research)\b/.test(normalized) ||
    /\brun\s+(?:(?:the|a|my|this|our)\s+)?(?:lead\s+)?(?:search|research)\b/.test(normalized) ||
    /\b(?:run|start)\s+it\b/.test(normalized) ||
    /\bgo ahead\b/.test(normalized) ||
    /\bfind(?:\s+me)?(?:\s+\d+|\s+some|\s+the)?(?:\s+strong|\s+qualified)?\s+leads?\b/.test(normalized)
  );
}

function isStandaloneSearchCommand(message: string): boolean {
  const normalized = normalizeCommand(message)
    .replace(/^(?:please\s+|can you\s+|could you\s+|let's\s+|lets\s+)/, "")
    .replace(/\s+(?:please|now)$/, "")
    .trim();

  return (
    /^(?:start|begin|launch)\s+(?:(?:the|a|my|this|our)\s+)?(?:lead\s+)?(?:search|research)$/.test(normalized) ||
    /^run\s+(?:(?:the|a|my|this|our)\s+)?(?:lead\s+)?(?:search|research)$/.test(normalized) ||
    /^(?:run|start)\s+it$/.test(normalized) ||
    /^go ahead$/.test(normalized) ||
    /^find(?:\s+me)?(?:\s+(?:some|the))?\s+leads?$/.test(normalized)
  );
}

function normalizeCommand(message: string): string {
  return message
    .toLowerCase()
    .replaceAll("’", "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function quantityLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function runStageLabel(stage: RunStage | undefined): string {
  if (!stage || stage === "queued") return "Starting research";
  if (stage === "discovering") return "Discovering sellers";
  if (stage === "verifying") return "Verifying locations";
  if (stage === "researching") return "Researching evidence";
  if (stage === "scoring" || stage === "qualifying") return "Scoring candidates";
  if (stage === "deduplicating") return "Removing duplicates";
  if (stage === "exporting") return "Preparing results";
  return "Finishing research";
}

function isRecoverableRun(run: RunRecord): boolean {
  return Boolean(run.error || run.outcome === "failed" || run.outcome === "partial");
}

function terminalRunSummary(run: RunRecord): string {
  const issueCount = runIssueCount(run);
  if (run.outcome === "partial") {
    return `${compactRunCounts(run)} · Results remain reviewable`;
  }
  return run.error || `${issueCount} ${issueCount === 1 ? "issue" : "issues"} blocked the search`;
}
