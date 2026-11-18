import "server-only";
import { ErroDoRecreio, PerfilIdSchema } from "@informach/recreio";
import { redirect } from "next/navigation";
import { cache } from "react";
import { aparelhoPareadoAtual, temContextoPareado } from "@/features/protecao/http";
import { identidadeNativaDoAparelho } from "@/features/protecao/nativo";
import { escolhasDoAparelho } from "@/features/protecao/service";
import { safeDestination } from "@/lib/destination";
import { AppError } from "@/lib/errors";

/** Apenas jogador/aparelho. Esta referência nunca concede conta, cobrança ou gestão. */
export const jogadorDoAparelho = cache(async () => {
  if (await temContextoPareado()) {
    const pareado = await aparelhoPareadoAtual();
    if (!pareado) throw new ErroDoRecreio("NAO_AUTENTICADO");
    return {
      perfil: pareado.perfil,
      sessaoDeAparelhoId: pareado.sessaoDeAparelhoId,
      protegido: true,
    };
  }
  const identidade = await identidadeNativaDoAparelho();
  if (!identidade) throw new ErroDoRecreio("NAO_AUTENTICADO");
  const escolhas = await escolhasDoAparelho(identidade).catch((erro: unknown) => {
    if (erro instanceof AppError && erro.code === "AUTH")
      throw new ErroDoRecreio("NAO_AUTENTICADO");
    throw erro;
  });
  const perfil = escolhas.restrito
    ? escolhas.menores.find((item) => item.id === escolhas.atualId)
    : escolhas.adulto?.id === escolhas.atualId
      ? escolhas.adulto
      : null;
  if (!perfil) throw new ErroDoRecreio("SEM_PERFIL");
  return {
    perfil: { ...perfil, id: PerfilIdSchema.parse(perfil.id) },
    sessaoDeAparelhoId: identidade.sessaoDeAparelhoId,
    protegido: escolhas.restrito,
  };
});

export async function paginaDoJogador(next?: string) {
  try {
    return await jogadorDoAparelho();
  } catch (erro) {
    if (erro instanceof ErroDoRecreio) {
      if (erro.codigo === "NAO_AUTENTICADO")
        redirect(
          (await temContextoPareado())
            ? "/parear"
            : `/entrar?encerrada=1${next ? `&next=${encodeURIComponent(safeDestination(next))}` : ""}`,
        );
      if (erro.codigo === "SEM_PERFIL")
        redirect(next ? `/perfis?next=${encodeURIComponent(safeDestination(next))}` : "/perfis");
    }
    throw erro;
  }
}
