import type { RunRecord } from "./types";

export async function downloadRunWorkbook(run: RunRecord): Promise<void> {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(run),
  });
  if (!response.ok) throw new Error("Workbook export failed");

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sourcing-run-${run.id}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
