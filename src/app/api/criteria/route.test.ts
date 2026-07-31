import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES } from "@/domain/defaults";

import { POST } from "./route";

const request = (body: unknown) =>
  new Request("http://localhost/api/criteria", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const validRequest = {
  message: "Exclude retailers",
  preferences: {
    ...DEFAULT_PREFERENCES,
    weights: { ...DEFAULT_PREFERENCES.weights },
    acceptedMetals: [...DEFAULT_PREFERENCES.acceptedMetals],
    acceptedCategories: [...DEFAULT_PREFERENCES.acceptedCategories],
    avoidTerms: [],
  },
  instructions: "",
  feedback: [],
};

const validOutput = {
  assistantReply: "I added retailers as a hard exclusion.",
  instructions: "",
  preferences: {
    ...validRequest.preferences,
    avoidTerms: ["retailer"],
  },
  summary: {
    mustHave: ["Verified Canadian location", "Jewelry"],
    prefer: ["Wholesalers"],
    avoid: ["Retailers"],
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("criteria API route", () => {
  it("requires a server-side OpenAI API key", async () => {
    const response = await POST(request(validRequest));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Add OPENAI_API_KEY to enable the search assistant.",
    });
  });

  it("uses GPT-5 Nano structured output and returns validated criteria", async () => {
    vi.stubEnv("OPENAI_API_KEY", "private-openai-key");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        output: [{
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(validOutput) }],
        }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(validRequest));
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const providerBody = JSON.parse(String(options.body)) as {
      model: string;
      store: boolean;
      reasoning: { effort: string };
      text: { format: { type: string; strict: boolean } };
    };

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      assistantReply: "Updated your criteria to exclude retailers. Everything else stayed the same.",
      preferences: {
        avoidTerms: ["retailer"],
      },
      summary: {
        avoid: ["retailers"],
      },
    });
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options.headers).not.toEqual(
      expect.objectContaining({ Authorization: expect.stringContaining("not-the-key") }),
    );
    expect(providerBody).toMatchObject({
      model: "gpt-5.6-luna",
      store: false,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", strict: true } },
    });
  });

  it("rejects model settings whose weights do not total 100", async () => {
    vi.stubEnv("OPENAI_API_KEY", "private-openai-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({
        output_text: JSON.stringify({
          ...validOutput,
          preferences: {
            ...validOutput.preferences,
            weights: { ...validOutput.preferences.weights, productFit: 29 },
          },
        }),
      }),
    ));

    const response = await POST(request(validRequest));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "The assistant returned invalid search settings. Nothing was changed.",
    });
  });

  it("returns an actionable message when OpenAI credits are exhausted", async () => {
    vi.stubEnv("OPENAI_API_KEY", "private-openai-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "credit_balance_exhausted",
            message: "provider detail",
          },
        },
        { status: 429 },
      ),
    ));

    const response = await POST(request(validRequest));

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      error: "OpenAI credits are exhausted. Add billing credits, then try again.",
    });
  });

  it("canonicalizes conversational seller-type exclusions", async () => {
    vi.stubEnv("OPENAI_API_KEY", "private-openai-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({
        output_text: JSON.stringify({
          ...validOutput,
          preferences: {
            ...validOutput.preferences,
            avoidTerms: ["retailers", "marketplaces"],
          },
        }),
      }),
    ));

    const response = await POST(request(validRequest));
    const output = await response.json();

    expect(response.status).toBe(200);
    expect(output.preferences.avoidTerms).toEqual(["retailer", "marketplace_social"]);
  });

  it("enforces explicit seller exclusions even when the model misfiles them", async () => {
    vi.stubEnv("OPENAI_API_KEY", "private-openai-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({
        output_text: JSON.stringify({
          ...validOutput,
          preferences: {
            ...validOutput.preferences,
            avoidTerms: [],
          },
        }),
      }),
    ));

    const response = await POST(request(validRequest));
    const output = await response.json();

    expect(response.status).toBe(200);
    expect(output.preferences.avoidTerms).toEqual(["retailer"]);
  });

  it("does not turn a later preferred seller type into an exclusion", async () => {
    vi.stubEnv("OPENAI_API_KEY", "private-openai-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({
        output_text: JSON.stringify({
          ...validOutput,
          preferences: {
            ...validOutput.preferences,
            avoidTerms: [],
          },
        }),
      }),
    ));
    const detailedRequest = {
      ...validRequest,
      message: "Exclude retailers and prioritize specialized wholesalers.",
    };

    const response = await POST(request(detailedRequest));
    const output = await response.json();

    expect(response.status).toBe(200);
    expect(output.preferences.avoidTerms).toEqual(["retailer"]);
    expect(output.instructions).toBe("Prioritize specialized wholesalers.");
    expect(output.assistantReply).toBe(
      "Updated your criteria to prioritize specialized wholesalers and exclude retailers. Everything else stayed the same.",
    );
  });
});
