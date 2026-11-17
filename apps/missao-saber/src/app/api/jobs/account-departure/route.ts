import { AccountDepartureBatchError } from "@informach/account/departure-jobs";
import { runAccountMaintenance } from "@/lib/account-maintenance";
import { authorizedJob } from "@/lib/http";
import { recordJob } from "@/lib/job-runs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authorizedJob(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await recordJob("account-departure", runAccountMaintenance);
    return Response.json(result);
  } catch (error) {
    if (error instanceof AccountDepartureBatchError)
      return Response.json(error.result, { status: 503 });
    throw error;
  }
}
