import { authorizedJob } from "@/lib/http";
import { runMaintenance } from "@/lib/maintenance";
import { reportError } from "@/lib/observability";

export async function POST(request: Request) {
  if (!authorizedJob(request)) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await runMaintenance());
  } catch (error) {
    const incident = crypto.randomUUID();
    reportError(error, incident);
    return Response.json({ status: "failed", incident }, { status: 503 });
  }
}
