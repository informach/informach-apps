import {
  PedidoDeSalvamentoDePerfilSchema,
  SALVAMENTO_CORPO_MAX_BYTES,
} from "@informach/recreio/contrato";
import { estadoDoSalvamento } from "@/features/salvamento/estado";
import { salvamentoDoPedido } from "@/features/salvamento/http";
import { finalizarDadosDoPerfil } from "@/features/salvamento/perfil";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return responder(async () => json(await estadoDoSalvamento(await salvamentoDoPedido(request))));
}
export function POST(request: Request) {
  return responder(async () => {
    const capacidade = await salvamentoDoPedido(request);
    return json(
      await finalizarDadosDoPerfil(capacidade, () =>
        corpoJson(request, PedidoDeSalvamentoDePerfilSchema, SALVAMENTO_CORPO_MAX_BYTES),
      ),
    );
  });
}
