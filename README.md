# Aurum Sourcing

An evidence-backed dashboard for discovering and qualifying Canadian jewelry sellers. Aurum uses You.com for research, applies deterministic scoring in application code, retains source URLs for every researched lead, and exports Excel workbooks with separate Accepted and Rejected tabs.

## Local setup

Requirements: Node.js 20 or newer and a You.com API key.

```bash
npm install
cp .env.example .env.local
```

Add the server-only provider credential to `.env.local`:

```dotenv
YDC_API_KEY=your-key-here
```

The browser only receives a configured/not-configured health response. The API key is never written to IndexedDB, returned by an API route, or included in a CSV.

Start the development server:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Verification

```bash
npm test
npm run lint
npm run build
```

If Playwright browsers are installed, browser tests can be run with `npm run test:e2e`.

## Five-candidate trial evaluation

Preview the trial budget without making API calls:

```bash
npm run eval:trial
```

Run the paid trial:

```bash
npm run eval:trial -- --execute
```

The trial researches no more than five candidates, ranks qualifying leads by
their deterministic confidence score, and writes an XLSX workbook plus a JSON
report to `eval-results/`. The workbook separates accepted and rejected sellers,
while the JSON report also retains run counts,
rejections, evidence, and the exact preferences used for the evaluation.

For a broader controlled evaluation:

```bash
npm run eval:trial -- --execute --max-candidates=20 --result-limit=5 --concurrency=3
```

Trial arguments are capped at 50 candidates, 20 results, and concurrency 5.

## How qualification works

Canadian location is a permanent binary gate. A candidate without verified Canadian location evidence is rejected before scoring. Candidates that pass receive a weighted score for product fit, affordability, inventory, seller priority, contactability, and online presence, less unwanted-category penalties. Positive weights must total exactly 100 before a run can start.

The budget-safe default run uses a 41-point qualification threshold, targets 5
accepted sellers, researches no more than 20 candidates, and uses one concurrent research call. At current You.com
standard Research pricing, that is approximately $1.05 USD at the maximum
candidate budget, including up to ten discovery searches. The dashboard shows
an estimated maximum before every run.

The most recent valid configuration, resumable run records, accepted public lead data, and queued candidates are stored locally in IndexedDB. No API key or private customer data is stored.

### Feedback, exclusions, and cancellation

- Add hard exclusions under **Scoring and product filters → Avoid**. Matching candidates are rejected even when their score would otherwise pass.
- Existing-lead CSVs may include `Feedback Status` (`good`, `not_fit`, `already_known`, or blank) and `Feedback Notes`. Only blank-status rows are eligible for **Review uploaded leads**.
- Researched candidates and imported feedback are remembered in this browser so later searches skip them.
- Cancelling a run stops active requests and keeps completed leads available as a partial XLSX export.

## Data limitations

- Research output is only as current and complete as the cited public sources.
- Evidence URLs should be reviewed before using a lead in a high-stakes workflow.
- Inferred personal emails are labeled as unverified and are never presented as published facts.
- A passing score is a deterministic sourcing signal, not an endorsement or outreach approval.
- The application does not send outreach, schedule activity, sync a CRM, or provide multi-user collaboration.

## Production

Create and validate an optimized build with:

```bash
npm run build
npm run start
```

Configure `YDC_API_KEY` in the deployment environment. Do not expose it through a `NEXT_PUBLIC_` variable.
