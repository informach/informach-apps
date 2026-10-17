import { unsubscribeEmail } from "@/lib/emails";

export async function GET(request: Request) {
  const result = await unsubscribeEmail(new URL(request.url).searchParams.get("t"));
  if (!result.ok) return new Response("Link inválido.", { status: 400 });
  return new Response(
    "Preferência registrada. Avisos de acesso e de operação continuam chegando.",
    {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: Request) {
  const result = await unsubscribeEmail(new URL(request.url).searchParams.get("t"));
  return new Response(null, { status: result.ok ? 200 : 400 });
}
