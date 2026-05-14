import { processAgendaEmailUnsubscribe } from "@/lib/emails";
import { RequestBodyTooLargeError, readFormDataWithSizeLimit } from "@/lib/request-size";

export const runtime = "nodejs";

const MAX_UNSUBSCRIBE_FORM_BYTES = 4 * 1024;

async function handle(token: string | null): Promise<Response> {
  if (!token) {
    return new Response("Missing token", { status: 400 });
  }
  const result = await processAgendaEmailUnsubscribe(token);
  if (!result.ok) {
    return new Response("Invalid token", { status: 400 });
  }
  const isTransactional = result.category.startsWith("auth.");
  const message = isTransactional
    ? `Sua preferência foi registrada para ${result.category}. Emails essenciais de autenticação continuam sendo enviados.`
    : `Você foi removido de ${result.category}.`;
  return new Response(
    `<!doctype html><html lang="pt-BR"><body style="font-family:sans-serif;padding:32px;max-width:520px;margin:0 auto;"><h1>Inscrição cancelada</h1><p>${message}</p></body></html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return handle(url.searchParams.get("t"));
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let token = url.searchParams.get("t");
  if (!token) {
    let formData: FormData | null = null;
    try {
      formData = await readFormDataWithSizeLimit(request, MAX_UNSUBSCRIBE_FORM_BYTES);
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) {
        return new Response(null, { status: 413 });
      }
    }
    token = formData?.get("t")?.toString() ?? null;
  }
  if (!token) {
    return new Response(null, { status: 400 });
  }
  const result = await processAgendaEmailUnsubscribe(token);
  return new Response(null, { status: result.ok ? 200 : 400 });
}
