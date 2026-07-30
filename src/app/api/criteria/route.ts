import { NextResponse } from "next/server";

import {
  CRITERIA_RESPONSE_JSON_SCHEMA,
  CRITERIA_SYSTEM_PROMPT,
  type CriteriaResponse,
  criteriaRequestSchema,
  criteriaResponseSchema,
} from "@/ai/criteria";
import { validatePreferences } from "@/domain/scoring";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Add OPENAI_API_KEY to enable the search assistant." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = criteriaRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid assistant request." }, { status: 400 });
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-nano",
        store: false,
        reasoning: { effort: "minimal" },
        max_output_tokens: 2500,
        instructions: CRITERIA_SYSTEM_PROMPT,
        input: JSON.stringify(parsed.data),
        text: {
          format: {
            type: "json_schema",
            name: "lead_search_criteria",
            strict: true,
            schema: CRITERIA_RESPONSE_JSON_SCHEMA,
          },
        },
      }),
      signal: request.signal,
    });

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (isCreditBalanceError(payload)) {
        return NextResponse.json(
          { error: "OpenAI credits are exhausted. Add billing credits, then try again." },
          { status: 402 },
        );
      }
      return NextResponse.json(
        { error: "The search assistant could not update the criteria." },
        { status: response.status === 429 ? 429 : 502 },
      );
    }

    const output = criteriaResponseSchema.safeParse(
      JSON.parse(readOutputText(payload)),
    );
    if (!output.success || !validatePreferences(output.data.preferences).valid) {
      return NextResponse.json(
        { error: "The assistant returned invalid search settings. Nothing was changed." },
        { status: 502 },
      );
    }

    const explicitExclusions = explicitSellerExclusions(parsed.data.message);
    const explicitPreferences = explicitSellerPreferences(parsed.data.message);
    const normalizedOutput = {
      ...output.data,
      preferences: {
        ...output.data.preferences,
        avoidTerms: canonicalizeAvoidTerms([
          ...output.data.preferences.avoidTerms,
          ...explicitExclusions,
        ]),
      },
    };

    return NextResponse.json(
      applyExplicitSellerIntent(
        normalizedOutput,
        parsed.data.instructions,
        explicitExclusions,
        explicitPreferences,
        parsed.data.message,
      ),
    );
  } catch (error) {
    if (request.signal.aborted) {
      return NextResponse.json({ error: "Assistant request cancelled." }, { status: 499 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof SyntaxError
            ? "The assistant returned unreadable settings. Nothing was changed."
            : "The search assistant is temporarily unavailable.",
      },
      { status: 502 },
    );
  }
}

function readOutputText(payload: unknown): string {
  if (!isRecord(payload)) throw new Error("Missing OpenAI response");
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) throw new Error("Missing OpenAI output");

  const text = payload.output.flatMap((item) => {
    if (!isRecord(item) || !Array.isArray(item.content)) return [];
    return item.content.flatMap((content) =>
      isRecord(content) && content.type === "output_text" && typeof content.text === "string"
        ? [content.text]
        : [],
    );
  }).join("");

  if (!text) throw new Error("Missing OpenAI output text");
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCreditBalanceError(payload: unknown): boolean {
  if (!isRecord(payload) || !isRecord(payload.error)) return false;
  return (
    payload.error.code === "credit_balance_exhausted" ||
    payload.error.code === "insufficient_quota"
  );
}

function canonicalizeAvoidTerms(terms: string[]): string[] {
  const sellerTypes: Record<string, string> = {
    manufacturer: "manufacturer",
    manufacturers: "manufacturer",
    wholesaler: "wholesaler",
    wholesalers: "wholesaler",
    retailer: "retailer",
    retailers: "retailer",
    "brand boutique": "brand_boutique",
    "brand boutiques": "brand_boutique",
    brand_boutique: "brand_boutique",
    "marketplace social": "marketplace_social",
    marketplaces: "marketplace_social",
    marketplace_social: "marketplace_social",
  };
  return [...new Set(
    terms.map((term) => sellerTypes[term.trim().toLowerCase()] ?? term.trim()),
  )];
}

function explicitSellerExclusions(message: string): string[] {
  const normalized = message.toLowerCase().replaceAll("’", "'");
  const exclusionPhrases = [
    "exclude",
    "avoid",
    "reject",
    "without",
    "do not include",
    "don't include",
    "no ",
  ];
  const sellerTypes: Array<{ patterns: string[]; value: string }> = [
    { patterns: ["retailer", "retailers", "retail-only", "retail only"], value: "retailer" },
    { patterns: ["wholesaler", "wholesalers"], value: "wholesaler" },
    { patterns: ["manufacturer", "manufacturers"], value: "manufacturer" },
    { patterns: ["brand boutique", "brand boutiques"], value: "brand_boutique" },
    {
      patterns: ["marketplace", "marketplaces", "social marketplace"],
      value: "marketplace_social",
    },
  ];

  return sellerTypes.flatMap(({ patterns, value }) => {
    const explicitlyExcluded = exclusionPhrases.some((phrase) => {
      const phraseIndex = normalized.indexOf(phrase);
      if (phraseIndex < 0) return false;
      const nearbyText = normalized.slice(phraseIndex, phraseIndex + 160);
      const exclusionClause = nearbyText.split(
        /\b(?:and\s+(?:prioritize|prefer|include|focus)|but|instead|while)\b|[.;!?]/,
        1,
      )[0] ?? "";
      return patterns.some((pattern) => exclusionClause.includes(pattern));
    });
    return explicitlyExcluded ? [value] : [];
  });
}

function explicitSellerPreferences(message: string): string[] {
  const normalized = message.toLowerCase().replaceAll("’", "'");
  const preferencePhrases = ["prioritize", "prefer", "focus on", "favour", "favor"];
  const sellerTypes: Array<{ patterns: string[]; value: string }> = [
    { patterns: ["wholesaler", "wholesalers"], value: "wholesaler" },
    { patterns: ["manufacturer", "manufacturers"], value: "manufacturer" },
    { patterns: ["retailer", "retailers"], value: "retailer" },
    { patterns: ["brand boutique", "brand boutiques"], value: "brand_boutique" },
    {
      patterns: ["marketplace", "marketplaces", "social marketplace"],
      value: "marketplace_social",
    },
  ];

  return sellerTypes.flatMap(({ patterns, value }) => {
    const explicitlyPreferred = preferencePhrases.some((phrase) => {
      const phraseIndex = normalized.indexOf(phrase);
      if (phraseIndex < 0) return false;
      const nearbyText = normalized.slice(phraseIndex, phraseIndex + 160);
      const preferenceClause = nearbyText.split(
        /\b(?:and\s+(?:exclude|avoid|reject)|but|instead|while)\b|[.;!?]/,
        1,
      )[0] ?? "";
      return patterns.some((pattern) => preferenceClause.includes(pattern));
    });
    return explicitlyPreferred ? [value] : [];
  });
}

function applyExplicitSellerIntent(
  output: CriteriaResponse,
  previousInstructions: string,
  exclusions: string[],
  preferences: string[],
  message: string,
) {
  if (exclusions.length === 0 && preferences.length === 0) return output;

  const normalizedMessage = message.toLowerCase();
  const preferenceLabels = preferences.map((value) => {
    const baseLabel = sellerTypeLabel(value, false);
    return sellerTypeLabel(value, normalizedMessage.includes(`specialized ${baseLabel}`));
  });
  const exclusionLabels = exclusions.map((value) => sellerTypeLabel(value, false));
  const changes = [
    preferenceLabels.length ? `prioritize ${joinLabels(preferenceLabels)}` : "",
    exclusionLabels.length ? `exclude ${joinLabels(exclusionLabels)}` : "",
  ].filter(Boolean);
  const preferenceInstruction = preferenceLabels.length
    ? `Prioritize ${joinLabels(preferenceLabels)}.`
    : "";
  const instructions = [previousInstructions.trim(), preferenceInstruction]
    .filter(Boolean)
    .join(" ")
    .slice(0, 240);

  return {
    ...output,
    assistantReply: `Updated your criteria to ${changes.join(" and ")}. Everything else stayed the same.`,
    instructions,
    summary: {
      ...output.summary,
      prefer: preferenceLabels,
      avoid: exclusionLabels,
    },
  };
}

function sellerTypeLabel(value: string, specialized: boolean): string {
  const labels: Record<string, string> = {
    manufacturer: "manufacturers",
    wholesaler: "wholesalers",
    retailer: "retailers",
    brand_boutique: "brand boutiques",
    marketplace_social: "marketplaces",
  };
  const label = labels[value] ?? value.replaceAll("_", " ");
  return specialized ? `specialized ${label}` : label;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return labels.join(" and ");
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}
