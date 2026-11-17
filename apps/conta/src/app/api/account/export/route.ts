import { UnauthorizedError } from "@informach/auth";
import { RateLimitError } from "@informach/auth/server-actions";
import { prepareAccountExport } from "@/features/account/privacy-service";
import { getEnv } from "@/lib/env";
import { reportOperationalError } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = getEnv().origin;
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (request.headers.has("origin") && request.headers.get("origin") !== origin)
  )
    return new Response("Abra a exportação na Minha conta.", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  try {
    const iterator = await prepareAccountExport(request);
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const item = await iterator.next();
          if (item.done) controller.close();
          else controller.enqueue(item.value);
        } catch (error) {
          if (!request.signal.aborted) reportOperationalError("privacy.export_interrupted");
          controller.error(error);
          await iterator.return();
        }
      },
      async cancel() {
        await iterator.return();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="minha-conta.json"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    const state =
      error instanceof UnauthorizedError
        ? "recente"
        : error instanceof RateLimitError
          ? "limite"
          : "erro";
    if (state === "erro") reportOperationalError("privacy.export_failed");
    return new Response(null, {
      status: 303,
      headers: {
        Location: new URL(`/?privacidade=${state}#privacidade`, origin).href,
        "Cache-Control": "no-store",
      },
    });
  }
}
