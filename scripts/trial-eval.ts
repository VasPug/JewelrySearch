import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import { DEFAULT_PREFERENCES } from "../src/domain/defaults";
import { buildRunWorkbook } from "../src/domain/workbook";
import type {
  QualifiedLead,
  RunPreferences,
  RunRecord,
} from "../src/domain/types";
import type { RunStorage } from "../src/research/orchestrator";
import { runResearch } from "../src/research/orchestrator";
import { discoveryQueries } from "../src/research/prompts";
import { YouClient } from "../src/research/you-client";

const DEFAULT_RESULT_LIMIT = 5;
const DEFAULT_CANDIDATE_LIMIT = 5;

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const resultLimit = readIntegerArgument("--result-limit", DEFAULT_RESULT_LIMIT, 1, 20);
  const candidateLimit = readIntegerArgument(
    "--max-candidates",
    DEFAULT_CANDIDATE_LIMIT,
    resultLimit,
    50,
  );
  const concurrency = readIntegerArgument("--concurrency", 1, 1, 5);
  loadEnvConfig(process.cwd());

  if (!execute) {
    console.log(`
Aurum trial evaluation (dry run)

This trial researches at most ${candidateLimit} candidates and returns up to
${resultLimit} qualifying results. Maximum provider calls:

  - ${candidateLimit} You.com Research calls
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
  targetLeads: resultLimit,
  maxCandidates: candidateLimit,
  maxConcurrentResearch: concurrency,
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

  console.log(
    `Starting capped trial: at most ${candidateLimit} candidates, ${resultLimit} results, concurrency ${concurrency}.`,
  );

  const run = await runResearch(
  preferences,
  {
    onProgress(current) {
      process.stdout.write(
        `\rDiscovered ${current.discoveredCount} | Researched ${current.researchedCount}/${candidateLimit} | Qualified ${current.qualifiedCount}`,
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
  .slice(0, resultLimit);
  const rankedRun: RunRecord = { ...run, leads: rankedLeads };
  const outputDirectory = path.join(process.cwd(), "eval-results");
  await mkdir(outputDirectory, { recursive: true });

  const workbookPath = path.join(outputDirectory, `${run.id}.xlsx`);
  const reportPath = path.join(outputDirectory, `${run.id}.json`);
  await writeFile(workbookPath, await buildRunWorkbook(rankedRun));
  await writeFile(
  reportPath,
  JSON.stringify(
    {
      evaluation: {
        candidateResearchCap: candidateLimit,
        resultLimit,
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
  console.log(`Workbook: ${workbookPath}`);
  console.log(`Evaluation report: ${reportPath}`);

  if (run.error) {
    throw new Error(`Run error: ${run.error}`);
  }
}

function readIntegerArgument(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.argv.find((argument) => argument.startsWith(`${name}=`))?.split("=")[1];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Trial evaluation failed");
  process.exitCode = 1;
});
