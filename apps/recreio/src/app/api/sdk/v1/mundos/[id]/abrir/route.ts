import { abrirMundo } from "@/features/posse/service";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Entra na posse do mundo ou faz o Recreio atribuir uma, e diz onde ele está rodando. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const sessao = await sessaoDeJogo(request);
    const { id } = await params;
    // A cerca é assunto da instância; o navegador não a recebe.
    const { cerca: _cerca, ...aberto } = await abrirMundo(sessao, id);
    return json(aberto);
  });
}
