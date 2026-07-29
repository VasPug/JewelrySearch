import { NextResponse } from "next/server";

import { buildRunWorkbook } from "@/domain/workbook";
import type { RunRecord } from "@/domain/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const run = (await request.json().catch(() => null)) as RunRecord | null;
  if (!run || typeof run.id !== "string" || !Array.isArray(run.leads)) {
    return NextResponse.json({ error: "Invalid run payload" }, { status: 400 });
  }

  const workbook = await buildRunWorkbook(run);
  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sourcing-run-${safeFilename(run.id)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}
