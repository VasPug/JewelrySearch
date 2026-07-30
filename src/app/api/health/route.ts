import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.YDC_API_KEY),
    assistantConfigured: Boolean(process.env.OPENAI_API_KEY),
  });
}
