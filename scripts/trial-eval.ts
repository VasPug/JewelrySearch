import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import { serializeLeadsCsv } from "../src/domain/csv";
import { DEFAULT_PREFERENCES } from "../src/domain/defaults";
import type {
  QualifiedLead,
  RunPreferences,
  RunRecord,
} from "../src/domain/types";
import type { RunStorage } from "../src/research/orchestrator";
import { runResearch } from "../src/research/orchestrator";
import { discoveryQueries } from "../src/research/prompts";
import { YouClient } from "../src/research/you-client";

const TRIAL_RESULT_LIMIT = 5;

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  loadEnvConfig(process.cwd());

  if (!execute) {
    console.log(`
Aurum trial evaluation (dry run)

This trial researches at most ${TRIAL_RESULT_LIMIT} candidates and returns up to
${TRIAL_RESULT_LIMIT} qualifying results. Maximum provider calls:

  - ${TRIAL_RESULT_LIMIT} You.com Research calls
  - ${discoveryQueries().length} You.com Search calls (normally only one)

No API calls were made.

Run the paid trial with:
  npm run eval:trial -- --execute
`);
    return;
  }

  if (!process.env.YDC_API_KEY) {
    throw new Error("YDC_API_KEY is missing. Add it to .env.local or export it in your shell.");
  }

  const preferences: RunPreferences = {
  ...structuredClone(DEFAULT_PREFERENCES),
  targetLeads: TRIAL_RESULT_LIMIT,
  maxCandidates: TRIAL_RESULT_LIMIT,
  maxConcurrentResearch: 1,
};

  const client = new YouClient();
  const acceptedLeads: QualifiedLead[] = [];
  const memoryStorage: RunStorage = {
  async saveRun() {},
  async listAcceptedLeads() {
    return [];
  },
  async saveQueuedCandidates() {},
  async clearQueuedCandidates() {},
  async saveAcceptedLeads(leads: QualifiedLead[]) {
    acceptedLeads.push(...leads);
  },
  };

  console.log(`Starting capped trial: at most ${TRIAL_RESULT_LIMIT} candidates will be researched.`);

  const run = await runResearch(
  preferences,
  {
    onProgress(current) {
      process.stdout.write(
        `\rDiscovered ${current.discoveredCount} | Researched ${current.researchedCount}/${TRIAL_RESULT_LIMIT} | Qualified ${current.qualifiedCount}`,
      );
    },
  },
  {
    gateway: {
      discoverCandidates: (query, count) => client.discoverCandidates(query, count),
      researchCandidate: (candidate, currentPreferences) =>
        client.researchCandidate(candidate, currentPreferences),
    },
    storage: memoryStorage,
    id: () => `trial-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`,
  },
  );

  console.log();

  const rankedLeads = [...run.leads]
  .sort((left, right) => right.confidenceScore - left.confidenceScore)
  .slice(0, TRIAL_RESULT_LIMIT);
  const rankedRun: RunRecord = { ...run, leads: rankedLeads };
  const outputDirectory = path.join(process.cwd(), "eval-results");
  await mkdir(outputDirectory, { recursive: true });

  const csvPath = path.join(outputDirectory, `${run.id}.csv`);
  const reportPath = path.join(outputDirectory, `${run.id}.json`);
  await writeFile(csvPath, serializeLeadsCsv(rankedLeads), "utf8");
  await writeFile(
  reportPath,
  JSON.stringify(
    {
      evaluation: {
        candidateResearchCap: TRIAL_RESULT_LIMIT,
        resultLimit: TRIAL_RESULT_LIMIT,
        preferences,
      },
      run: rankedRun,
    },
    null,
    2,
  ),
  "utf8",
  );

  console.log(`Trial finished with stage: ${run.stage}`);
  console.log(`Qualified results: ${rankedLeads.length}`);
  console.log(`CSV: ${csvPath}`);
  console.log(`Evaluation report: ${reportPath}`);

  if (run.error) {
    throw new Error(`Run error: ${run.error}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Trial evaluation failed");
  process.exitCode = 1;
});
