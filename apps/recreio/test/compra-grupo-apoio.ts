import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { consultarMeuGrupo } from "@/features/grupo/service";
import { pedidoDaCompra } from "./compra-apoio";

export async function pedidoDaCompraDoGrupo(
  autor: AutorNativoRecente,
  produtoId = "recreio_individual_monthly",
) {
  const grupo = await consultarMeuGrupo(autor);
  return pedidoDaCompra(
    produtoId,
    (grupo?.perfis ?? []).map((p) => ({
      perfilId: p.perfilId,
      versao: p.versao,
      cobrir: p.selecionado,
    })),
  );
}
