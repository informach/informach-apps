import { hostDoPedido } from "@/features/posse/http";
import { reivindicar } from "@/features/posse/service";
import { json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/** A instância assume a posse que o Recreio atribuiu a ela e recebe a cerca. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const host = await hostDoPedido(request);
    return json(await reivindicar(host, (await params).id));
  });
}
