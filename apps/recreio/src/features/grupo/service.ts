import "server-only";
import { GrupoIdSchema } from "@informach/recreio";
import type {
  AutorNativoRecente,
  IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { CoberturaDoGrupoSchema } from "./regras";
import { gravarCoberturaDoGrupo, lerComposicaoDoGrupo, lerGrupoDoTitular } from "./repository";

export async function consultarMeuGrupo(autor: IdentidadeNativa) {
  await limitarTentativas({
    chave: `grupo-leitura:${autor.contaId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  return lerGrupoDoTitular(autor);
}

export async function consultarGrupo(autor: IdentidadeNativa, grupoId: unknown) {
  const id = GrupoIdSchema.parse(grupoId);
  await limitarTentativas({
    chave: `grupo-leitura:${autor.contaId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  return lerComposicaoDoGrupo(autor, id);
}

export async function atualizarCobertura(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = CoberturaDoGrupoSchema.parse(entrada);
  await limitarTentativas({
    chave: `grupo-cobertura:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return gravarCoberturaDoGrupo(autor, pedido);
}
