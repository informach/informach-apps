import { unsubscribeEmail } from "@/lib/emails";
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  const ok = token && token.length <= 2048 && (await unsubscribeEmail(token)).ok;
  return new Response(
    ok
      ? "Preferência registrada. E-mails essenciais de acesso e cobrança continuam sendo enviados."
      : "Link inválido.",
    {
      status: ok ? 200 : 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}

export const POST = GET;
