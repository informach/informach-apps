import { readiness } from "@/lib/health";

/** Portão de deploy do Railway. */
export async function GET() {
  const state = await readiness();
  return Response.json(state, {
    status: state.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
