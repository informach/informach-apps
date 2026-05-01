import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    app: "cozya",
    commit: process.env.GIT_COMMIT_SHA ?? null,
    timestamp: new Date().toISOString(),
  });
}
