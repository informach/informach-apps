import { unsubscribeEmail } from "@/lib/emails";
import { unsubscribeMessage } from "@/lib/unsubscribe-message";

/** Link do rodapé: a frase diz o que o descadastro daquela categoria muda de verdade. */
export async function GET(request: Request) {
  const result = await unsubscribeEmail(new URL(request.url).searchParams.get("t"));
  if (!result.ok) return new Response("Link inválido.", { status: 400 });
  return new Response(unsubscribeMessage(result.category), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const result = await unsubscribeEmail(new URL(request.url).searchParams.get("t"));
  return new Response(null, { status: result.ok ? 200 : 400 });
}
