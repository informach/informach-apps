import { unsubscribe } from "@/lib/emails";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (!token || token.length > 2000) return new Response("Invalid token", { status: 400 });
  const result = await unsubscribe(token);
  return new Response(
    result.ok
      ? "Preferência registrada. E-mails essenciais de autenticação podem continuar sendo enviados."
      : "Link inválido.",
    {
      status: result.ok ? 200 : 400,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    },
  );
}
export const POST = GET;
