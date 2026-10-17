import { getAuth } from "@/lib/auth";
import { isAllowedAuthRoute } from "@/lib/auth-routes";

function handle(request: Request) {
  if (!isAllowedAuthRoute(request.method, new URL(request.url).pathname))
    return Response.json({ error: "not_found" }, { status: 404 });
  return getAuth().auth.handler(request);
}

export const GET = handle;
export const POST = handle;
