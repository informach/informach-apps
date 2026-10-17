import { unsubscribeEmail } from "@/lib/emails";
import { readRequestBody } from "@/lib/request-body";
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (!token || token.length > 2048 || !(await unsubscribeEmail(token)).ok)
    return new Response("Link inválido.", { status: 400 });
  return new Response(
    "Preferência registrada. E-mails essenciais de acesso e cobrança continuam sendo enviados.",
    { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const token =
    new URL(request.url).searchParams.get("t") ??
    new URLSearchParams(await readRequestBody(request, 4096)).get("t");
  return new Response(null, {
    status: token && token.length <= 2048 && (await unsubscribeEmail(token)).ok ? 200 : 400,
  });
}
