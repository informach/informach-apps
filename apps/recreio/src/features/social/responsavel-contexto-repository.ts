import "server-only";
import { db, sql } from "@informach/db";
import type { PerfilId } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
} from "@/features/account/autoridade-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { ContextoSocial } from "./autoridade-repository";
import { ComposicaoSocialMudou, travarComposicaoSocial } from "./composicao-repository";
import { admitirPerfilSocial } from "./perfis-repository";

export type ContextoDeSupervisaoSocial = ContextoSocial & {
  contaId: string;
  menor: Extract<ContextoSocial["origem"], { tipo: "protegido" }>;
  versaoDoMenor: number;
};
type Pontas = {
  origemId: PerfilId;
  destinoId: PerfilId | null;
  finalidade: "contato" | "protecao";
  operacao?: "leitura" | "alteracao";
};

async function tentar<T>(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  pontas: Pontas,
  executar: (tx: Transacao, atual: ContextoDeSupervisaoSocial) => Promise<T>,
) {
  const resultado = await db.transaction(async (tx) => {
    const prova = pontas.operacao === "leitura" ? undefined : autor.login;
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const composicao = await travarComposicaoSocial(
      tx,
      { tipo: "responsavel", contaId: autor.contaId },
      [...new Set([pontas.origemId, ...(pontas.destinoId ? [pontas.destinoId] : [])])],
    );
    const nativa = await autorizarContaNativa(tx, autor);
    await nativa.conferirPrazo(prova);
    assertAllowed(
      composicao.vinculos.some(
        (v) => v.profileId === perfilId && v.guardianUserId === autor.contaId,
      ),
      "PEDIDO",
      "Perfil não disponível para esta responsabilidade.",
    );
    const origem = await admitirPerfilSocial(
      tx,
      composicao,
      pontas.origemId,
      await nativa.conferirPrazo(prova),
    );
    const destino =
      pontas.destinoId && pontas.finalidade === "contato"
        ? await admitirPerfilSocial(
            tx,
            composicao,
            pontas.destinoId,
            await nativa.conferirPrazo(prova),
          )
        : null;
    if (origem.recalculou || destino?.recalculou) {
      await nativa.conferirPrazo(prova);
      return {
        admitida: false as const,
        erro: new AppError("CONFLITO", "A supervisão mudou. Reabra a tela antes de continuar."),
      };
    }
    const menor = pontas.origemId === perfilId ? origem.fato : destino?.fato;
    const perfil = composicao.perfis.find((p) => p.id === perfilId);
    assertAllowed(
      perfil && menor?.tipo === "protegido" && menor.responsabilidade.contaId === autor.contaId,
      "PEDIDO",
      "Perfil não disponível para esta responsabilidade.",
    );
    const conferirPrazo = async () => {
      const agora = await nativa.conferirPrazo(prova);
      origem.conferirPrazo(agora);
      destino?.conferirPrazo(agora);
      return agora;
    };
    const valor = await executar(tx, {
      origem: origem.fato,
      destino: destino?.fato ?? null,
      contaId: autor.contaId,
      menor,
      versaoDoMenor: perfil.policyVersion,
      conferirPrazo,
    });
    await conferirPrazo();
    return { admitida: true as const, valor };
  });
  if (!resultado.admitida) throw resultado.erro;
  return resultado.valor;
}

/** Autoridade nativa atual do responsável; nenhum aparelho ou perfil jogador é emprestado. */
export async function comResponsavelSocialNativo<T>(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  pontas: Pontas,
  executar: (tx: Transacao, atual: ContextoDeSupervisaoSocial) => Promise<T>,
) {
  try {
    return await tentar(autor, perfilId, pontas, executar);
  } catch (erro) {
    if (!(erro instanceof ComposicaoSocialMudou)) throw erro;
    return tentar(autor, perfilId, pontas, executar);
  }
}
