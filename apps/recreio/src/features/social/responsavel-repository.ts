import "server-only";
import { and, db, eq, or, sql } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { type PerfilId, PerfilIdSchema } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
} from "@/features/account/autoridade-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { ContextoSocial } from "./autoridade-repository";
import { ComposicaoSocialMudou, travarComposicaoSocial } from "./composicao-repository";
import { admitirPerfilSocial } from "./perfis-repository";

export type ContextoDoResponsavelSocial = ContextoSocial & {
  contaId: string;
  destino: NonNullable<ContextoSocial["destino"]>;
  menor: Extract<ContextoSocial["origem"], { tipo: "protegido" }>;
  versaoDoMenor: number;
};

async function tentar<T>(
  autor: AutorNativoRecente,
  pedidoId: string,
  perfilId: PerfilId,
  executar: (tx: Transacao, atual: ContextoDoResponsavelSocial) => Promise<T>,
) {
  const [pista] = await db
    .select({ origem: requests.originProfileId, destino: requests.targetProfileId })
    .from(requests)
    .innerJoin(
      guardians,
      and(eq(guardians.profileId, perfilId), eq(guardians.guardianUserId, autor.contaId)),
    )
    .where(
      and(
        eq(requests.id, pedidoId),
        or(
          eq(requests.originProfileId, guardians.profileId),
          eq(requests.targetProfileId, guardians.profileId),
        ),
      ),
    );
  assertAllowed(pista, "PEDIDO", "Pedido não disponível.");
  const origemId = PerfilIdSchema.parse(pista.origem);
  const destinoId = PerfilIdSchema.parse(pista.destino);
  const resultado = await db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const composicao = await travarComposicaoSocial(
      tx,
      { tipo: "responsavel", contaId: autor.contaId },
      [origemId, destinoId],
    );
    const nativa = await autorizarContaNativa(tx, autor);
    await nativa.conferirPrazo(autor.login);
    assertAllowed(
      composicao.vinculos.some(
        (v) => v.profileId === perfilId && v.guardianUserId === autor.contaId,
      ),
      "PEDIDO",
      "Pedido não disponível.",
    );
    const origem = await admitirPerfilSocial(
      tx,
      composicao,
      origemId,
      await nativa.conferirPrazo(autor.login),
    );
    const destino = await admitirPerfilSocial(
      tx,
      composicao,
      destinoId,
      await nativa.conferirPrazo(autor.login),
    );
    if (origem.recalculou || destino.recalculou) {
      await nativa.conferirPrazo(autor.login);
      return {
        admitida: false as const,
        erro: new AppError("CONFLITO", "A supervisão mudou. Reabra o pedido antes de continuar."),
      };
    }
    const menor = origemId === perfilId ? origem.fato : destino.fato;
    const perfil = composicao.perfis.find((p) => p.id === perfilId);
    assertAllowed(
      perfil && menor.tipo === "protegido" && menor.responsabilidade.contaId === autor.contaId,
      "PEDIDO",
      "Pedido não disponível.",
    );
    const conferirPrazo = async () => {
      const agora = await nativa.conferirPrazo(autor.login);
      origem.conferirPrazo(agora);
      destino.conferirPrazo(agora);
      return agora;
    };
    const valor = await executar(tx, {
      origem: origem.fato,
      destino: destino.fato,
      menor,
      versaoDoMenor: perfil.policyVersion,
      contaId: autor.contaId,
      conferirPrazo,
    });
    await conferirPrazo();
    return { admitida: true as const, valor };
  });
  if (!resultado.admitida) throw resultado.erro;
  return resultado.valor;
}

/** Ser pagante não é ser responsável por este perfil. Não exige jogador do adulto. */
export async function comResponsavelPorPedido<T>(
  autor: AutorNativoRecente,
  pedidoId: string,
  perfilId: PerfilId,
  executar: (tx: Transacao, atual: ContextoDoResponsavelSocial) => Promise<T>,
) {
  try {
    return await tentar(autor, pedidoId, perfilId, executar);
  } catch (erro) {
    if (!(erro instanceof ComposicaoSocialMudou)) throw erro;
    return tentar(autor, pedidoId, perfilId, executar);
  }
}
