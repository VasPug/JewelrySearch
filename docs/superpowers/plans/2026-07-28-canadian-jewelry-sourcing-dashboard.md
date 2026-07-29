# Canadian Jewelry Sourcing Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user web dashboard that manually launches You.com-backed research runs and downloads up to 100 deterministically qualified Canadian jewelry sellers as CSV.

**Architecture:** Use a Next.js App Router application with a stateless server-side You.com client and a browser-side run orchestrator. You.com Research structured output extracts cited candidate facts; pure TypeScript modules apply hard gates, configurable scoring, deduplication, and CSV generation. Preferences and completed run summaries persist in IndexedDB so no second paid service or hosted database is required.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Zod, Dexie/IndexedDB, Vitest, Testing Library, Playwright, You.com Web Search and Research APIs

## Global Constraints

- You.com is the only paid research service.
- `YDC_API_KEY` remains server-side and is never included in browser responses, logs, or exports.
- Canadian physical location is a permanent, non-configurable hard gate.
- An unverified or non-Canadian candidate receives score 0 and is rejected.
- Positive scoring weights are configurable and must total 100.
- The default qualification threshold is 75 and the default target is 100 accepted sellers.
- Runs are manual; scheduling, outreach, CRM sync, Google Sheets sync, and multi-user support are out of scope.
- Missing evidence remains blank and earns zero points.
- Published and inferred personal emails are always distinguishable.
- CSV follower counts contain digits only.

---

## File Map

### Application shell and UI

- `src/app/layout.tsx`: document metadata, fonts, and shell
- `src/app/page.tsx`: dashboard composition
- `src/app/globals.css`: tokens, responsive layout, and component styling
- `src/components/dashboard-header.tsx`: title, API readiness, and new-run action
- `src/components/run-config.tsx`: editable weights, filters, threshold, target, and budget
- `src/components/score-equation.tsx`: live equation and total validation
- `src/components/run-progress.tsx`: current-stage metrics and progress
- `src/components/run-history.tsx`: previous runs and CSV downloads
- `src/components/evidence-preview.tsx`: accepted-lead evidence details

### Domain and research

- `src/domain/types.ts`: shared preferences, evidence, candidate, score, and run types
- `src/domain/defaults.ts`: recommended immutable defaults
- `src/domain/scoring.ts`: pure Canadian gate, exclusions, and confidence equation
- `src/domain/deduplicate.ts`: canonical keys and cross-run duplicate detection
- `src/domain/csv.ts`: safe CSV serialization
- `src/research/prompts.ts`: discovery and structured-research prompts
- `src/research/schema.ts`: Zod schemas and You.com output schema
- `src/research/you-client.ts`: authenticated server-only Search and Research calls
- `src/research/orchestrator.ts`: browser-side candidate queue, concurrency, continuation, and progress

### API and persistence

- `src/app/api/discover/route.ts`: server-side discovery endpoint
- `src/app/api/research/route.ts`: server-side candidate research endpoint
- `src/app/api/health/route.ts`: reports whether `YDC_API_KEY` is configured without exposing it
- `src/storage/db.ts`: IndexedDB preferences and run history
- `.env.example`: documents `YDC_API_KEY`

### Tests

- `src/domain/scoring.test.ts`
- `src/domain/deduplicate.test.ts`
- `src/domain/csv.test.ts`
- `src/research/schema.test.ts`
- `src/research/you-client.test.ts`
- `src/research/orchestrator.test.ts`
- `src/components/run-config.test.tsx`
- `e2e/dashboard.spec.ts`

---

### Task 1: Application Foundation and Domain Contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/domain/types.ts`
- Create: `src/domain/defaults.ts`
- Create: `.env.example`

**Interfaces:**
- Produces: `RunPreferences`, `CandidateEvidence`, `ScoreBreakdown`, `QualifiedLead`, `RunRecord`, and `DEFAULT_PREFERENCES`
- Consumes: none

- [ ] **Step 1: Scaffold the Next.js TypeScript application and test runner**

Create scripts `dev`, `build`, `lint`, `test`, `test:watch`, and `test:e2e`. Add production dependencies `next`, `react`, `react-dom`, `zod`, and `dexie`; add development dependencies for TypeScript, ESLint, Tailwind, Vitest, Testing Library, jsdom, and Playwright.

- [ ] **Step 2: Define exact domain contracts**

Define configurable scoring:

```ts
export type ScoreWeights = {
  productFit: number;
  affordability: number;
  inventory: number;
  sellerPriority: number;
  contactability: number;
  presence: number;
};

export type RunPreferences = {
  threshold: number;
  targetLeads: number;
  maxCandidates: number;
  maxConcurrentResearch: number;
  weights: ScoreWeights;
  acceptedMetals: string[];
  acceptedCategories: string[];
  unwantedMeaningfulPercent: number;
  unwantedMeaningfulCount: number;
  unwantedLowMax: number;
  unwantedMediumMax: number;
  unwantedGeneralRejectAbove: number;
  unwantedMoissaniteRejectAbove: number;
};
```

Define evidence objects with value, source URL, and extraction confidence. Define candidate catalog samples, Canadian-location evidence, contacts, socials, rejection reasons, component scores, and accepted export fields.

- [ ] **Step 3: Add recommended defaults**

Use threshold 75, target 100, maximum 600 candidates, concurrency 3, weights `30/20/18/12/12/8`, unwanted thresholds `30/60/70/60`, and meaningful representation `10% or 5 listings`.

- [ ] **Step 4: Add the minimal application shell**

Create metadata, global font declarations, base color tokens, and an empty page that renders “Canadian Jewelry Sourcing”.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit 0.

Commit:

```bash
git add package.json package-lock.json tsconfig.json next.config.ts vitest.config.ts src/app src/domain .env.example
git commit -m "feat: scaffold sourcing dashboard domain"
```

### Task 2: Deterministic Qualification and Scoring

**Files:**
- Create: `src/domain/scoring.test.ts`
- Create: `src/domain/scoring.ts`

**Interfaces:**
- Consumes: `CandidateEvidence`, `RunPreferences`, and `ScoreBreakdown`
- Produces: `validatePreferences(preferences): ValidationResult`, `scoreCandidate(candidate, preferences): QualificationResult`

- [ ] **Step 1: Write failing tests for hard gates**

Cover non-Canadian location, unverifiable location, missing website, non-jewelry seller, missing qualifying materials, missing email and phone, prohibited main category, expensive meaningful unwanted inventory, and one stray unwanted listing.

Example:

```ts
it("returns zero when Canadian location is unverified", () => {
  const result = scoreCandidate(candidate({ canadaVerified: false }), DEFAULT_PREFERENCES);
  expect(result).toMatchObject({ accepted: false, confidence: 0 });
  expect(result.reasons).toContain("Canadian physical location is not verified");
});
```

- [ ] **Step 2: Run the hard-gate tests and verify failure**

Run `npm test -- src/domain/scoring.test.ts`.

Expected: FAIL because `scoreCandidate` does not exist.

- [ ] **Step 3: Implement hard gates and meaningful representation**

Implement explicit gate functions. Treat unwanted inventory as meaningful when its proportion is at least the configured percentage or its listing count is at least the configured count.

- [ ] **Step 4: Write failing tests for configurable weights and boundaries**

Cover a perfect 100, threshold equality, weight totals other than 100, affordability boundaries at 25/50/70/100, seller priority ordering, published/inferred/generic/phone-only contact scores, and secondary penalties of 0/5/10.

- [ ] **Step 5: Implement pure component scoring**

Use:

```ts
confidence = canadaMultiplier *
  Math.max(0, productFit + affordability + inventory +
    sellerPriority + contactability + presence - unwantedPenalty);
```

Round component values to two decimals and final confidence to the nearest integer. Do not accept when preferences are invalid.

- [ ] **Step 6: Verify and commit**

Run `npm test -- src/domain/scoring.test.ts`.

Expected: all scoring tests pass.

Commit:

```bash
git add src/domain/scoring.ts src/domain/scoring.test.ts
git commit -m "feat: add deterministic seller scoring"
```

### Task 3: You.com Structured Research Adapter

**Files:**
- Create: `src/research/schema.test.ts`
- Create: `src/research/schema.ts`
- Create: `src/research/prompts.ts`
- Create: `src/research/you-client.test.ts`
- Create: `src/research/you-client.ts`

**Interfaces:**
- Consumes: You.com `GET /v1/search` and `POST /v1/research`
- Produces: `discoverCandidates(query, count): Promise<DiscoveryCandidate[]>`, `researchCandidate(candidate, preferences): Promise<CandidateEvidence>`

- [ ] **Step 1: Write failing schema tests**

Test a complete structured research response, nullable fields, digits-only follower normalization, invalid URLs, invalid emails, and missing evidence URLs.

- [ ] **Step 2: Define strict Zod and JSON schemas**

Create a Research API `output_schema` containing company identity, official website, Canadian physical address evidence, seller type, main categories, metals, up to 20 listing samples, ready-to-ship evidence, contacts, socials, trade shows, and evidence URLs. Require nullable fields instead of guessed strings.

- [ ] **Step 3: Write failing client tests with mocked fetch**

Cover `X-API-Key`, country `CA`, search count, Research structured output, 401, 422, 429/500 retry behavior, timeout, and response-schema failure.

- [ ] **Step 4: Implement the server-only You.com client**

Use `YDC_API_KEY`, `https://api.you.com/v1/search`, and `https://api.you.com/v1/research`. Search uses `count <= 100`, `country=CA`, and `livecrawl=web` only when requested. Research uses `research_effort: "lite"` plus the output schema. Retry 429 and 5xx responses up to three attempts with bounded backoff; never retry 401 or 422.

- [ ] **Step 5: Implement prompts**

Add query families for manufacturers, wholesalers, retailers, trade-show exhibitors, and marketplace/social sellers. The candidate prompt must require citations for location, catalog, prices, stock, contacts, and social counts and must state that absence is returned as null.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- src/research/schema.test.ts src/research/you-client.test.ts
```

Expected: all adapter tests pass without live API calls.

Commit:

```bash
git add src/research
git commit -m "feat: integrate You.com structured research"
```

### Task 4: API Routes and Secret Isolation

**Files:**
- Create: `src/app/api/health/route.ts`
- Create: `src/app/api/discover/route.ts`
- Create: `src/app/api/research/route.ts`
- Create: `src/app/api/api-routes.test.ts`

**Interfaces:**
- Consumes: `discoverCandidates`, `researchCandidate`, Zod request schemas
- Produces: `GET /api/health`, `POST /api/discover`, `POST /api/research`

- [ ] **Step 1: Write failing route tests**

Test missing key health state, valid discovery request, invalid preference payload, researched candidate response, provider error mapping, and absence of secrets in every response.

- [ ] **Step 2: Implement health and validated POST routes**

`GET /api/health` returns `{ configured: boolean }`. POST routes parse request bodies with Zod, return 400 for invalid input, 503 for missing configuration, 502 for permanent provider errors, and 429 for provider rate limits.

- [ ] **Step 3: Verify and commit**

Run `npm test -- src/app/api/api-routes.test.ts`.

Expected: route tests pass and no response snapshot contains `YDC_API_KEY`.

Commit:

```bash
git add src/app/api
git commit -m "feat: expose secure research endpoints"
```

### Task 5: Deduplication, Run Orchestration, and Persistence

**Files:**
- Create: `src/domain/deduplicate.test.ts`
- Create: `src/domain/deduplicate.ts`
- Create: `src/research/orchestrator.test.ts`
- Create: `src/research/orchestrator.ts`
- Create: `src/storage/db.ts`

**Interfaces:**
- Consumes: discovery/research endpoints, `scoreCandidate`, prior accepted leads
- Produces: `candidateKeys(candidate): string[]`, `runResearch(preferences, callbacks): Promise<RunRecord>`, `dashboardDb`

- [ ] **Step 1: Write failing deduplication tests**

Cover normalized domains with and without `www`, company punctuation/casing, E.164-like phone digits, normalized social handles, and businesses sharing only a generic word.

- [ ] **Step 2: Implement canonical keys**

Return namespaced keys such as `domain:example.ca`, `phone:14165550123`, and `instagram:example`. Mark a candidate duplicate when any strong key matches; normalized company name alone requires the same Canadian city.

- [ ] **Step 3: Write failing orchestrator tests**

Cover query-family rotation, concurrency cap, progress callbacks, candidate failures that do not fail a run, continuing until target, stopping at maximum candidates, current/prior-run deduplication, and interrupted-run persistence.

- [ ] **Step 4: Implement IndexedDB storage**

Create tables for preferences, runs, accepted leads, and queued candidates. Store only public research data and run state; do not store the API key.

- [ ] **Step 5: Implement the orchestrator**

Use an explicit state machine:

```ts
export type RunStage =
  | "discovering"
  | "verifying"
  | "researching"
  | "scoring"
  | "export-ready"
  | "exhausted"
  | "failed";
```

Bound concurrency with a worker queue, persist after each researched candidate, emit counters, and end as `export-ready` at the target or `exhausted` at the research limit.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- src/domain/deduplicate.test.ts src/research/orchestrator.test.ts
```

Expected: all tests pass.

Commit:

```bash
git add src/domain/deduplicate.ts src/domain/deduplicate.test.ts src/research/orchestrator.ts src/research/orchestrator.test.ts src/storage/db.ts
git commit -m "feat: orchestrate resumable sourcing runs"
```

### Task 6: Safe CSV Export

**Files:**
- Create: `src/domain/csv.test.ts`
- Create: `src/domain/csv.ts`

**Interfaces:**
- Consumes: `QualifiedLead[]`
- Produces: `serializeLeadsCsv(leads): string`, `downloadLeadsCsv(run): void`

- [ ] **Step 1: Write failing export tests**

Assert the exact agreed column order, blank missing fields, quoted commas/newlines, digits-only follower counts, ISO research dates, joined evidence URLs, and neutralized fields beginning with `=`, `+`, `-`, or `@`.

- [ ] **Step 2: Implement serialization and browser download**

Prefix formula-like text with a single quote, use RFC 4180 escaping, and include a UTF-8 BOM for spreadsheet compatibility.

- [ ] **Step 3: Verify and commit**

Run `npm test -- src/domain/csv.test.ts`.

Expected: all CSV tests pass.

Commit:

```bash
git add src/domain/csv.ts src/domain/csv.test.ts
git commit -m "feat: export qualified sellers safely"
```

### Task 7: Dashboard Experience

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Create: `src/components/dashboard-header.tsx`
- Create: `src/components/run-config.tsx`
- Create: `src/components/score-equation.tsx`
- Create: `src/components/run-progress.tsx`
- Create: `src/components/run-history.tsx`
- Create: `src/components/evidence-preview.tsx`
- Create: `src/components/run-config.test.tsx`

**Interfaces:**
- Consumes: defaults, persistence, `runResearch`, and CSV download
- Produces: accessible single-page dashboard

- [ ] **Step 1: Write failing configuration tests**

Test editable weights, live total, disabled Start button when total is not 100, no Canadian-location preference, restored defaults, threshold/target/budget bounds, and persistence of the most recent valid configuration.

- [ ] **Step 2: Build configuration and live equation**

Use labeled numeric inputs and removable accepted-metal/category chips. Keep advanced penalties in a collapsible section. Display:

```text
Canada × max(0, Product + Affordability + Inventory +
Seller priority + Contactability + Presence − Penalties)
```

State clearly that Canada is permanent and non-configurable without presenting it as a form field.

- [ ] **Step 3: Build run progress and history**

Show stage, accepted target progress, discovered/researched/rejected/duplicate/error counts, and exhaustion reason. Allow CSV download only for runs with accepted leads.

- [ ] **Step 4: Add an evidence preview**

Show accepted companies, scores, compact component bars, contact status, representative product, and clickable evidence links. This is diagnostic visibility, not an approval step.

- [ ] **Step 5: Implement responsive visual styling**

Use a restrained editorial dashboard: warm neutral background, deep ink text, evergreen accent, compact data typography, clear focus states, and responsive cards. Avoid generic gradient-heavy SaaS styling.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- src/components/run-config.test.tsx
npm run lint
npm run build
```

Expected: all commands exit 0.

Commit:

```bash
git add src/app src/components
git commit -m "feat: build sourcing dashboard experience"
```

### Task 8: End-to-End Verification and Deployment Readiness

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/dashboard.spec.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: complete application
- Produces: verified local and deployable build

- [ ] **Step 1: Add deterministic browser fixtures**

Intercept `/api/health`, `/api/discover`, and `/api/research` with fixture responses containing accepted, rejected, duplicate, and failed candidates.

- [ ] **Step 2: Add end-to-end tests**

Verify API-not-configured state, weight validation, successful run, progress counters, Canada rejection, evidence preview, run history persistence, and CSV download contents.

- [ ] **Step 3: Document setup and operation**

Document Node version, `npm install`, copying `.env.example` to `.env.local`, adding `YDC_API_KEY`, running tests, starting development, production build, scoring behavior, API cost controls, and data limitations.

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

Expected: unit/integration tests pass, lint exits 0, production build succeeds, and Playwright passes.

- [ ] **Step 5: Perform a live smoke test when an API key is available**

Run a target of one lead with a maximum of ten candidates. Confirm the API key stays server-side, cited evidence is present, deterministic scoring is reproducible, and the CSV downloads.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e README.md
git commit -m "test: verify sourcing dashboard end to end"
```

## Final Acceptance Checklist

- [ ] Canada is a non-configurable binary gate.
- [ ] The live equation and every positive weight are editable.
- [ ] Invalid weights cannot start a run.
- [ ] A manual run aims for 100 new deduplicated accepted sellers.
- [ ] You.com is the only paid research provider.
- [ ] Research facts retain evidence URLs.
- [ ] Scoring is pure application code, not an LLM judgment.
- [ ] Inferred emails are explicitly unverified.
- [ ] Unwanted main categories and price-sensitive secondary categories follow the specification.
- [ ] CSV columns and formatting match the agreed schema.
- [ ] No outreach, scheduling, CRM, Sheets, or multi-user features are present.
