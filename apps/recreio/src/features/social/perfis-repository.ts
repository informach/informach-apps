import "server-only";
import { eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioMinorProtection as protection,
} from "@informach/db/schema";
import { ContaIdSchema, type PerfilId, type PerfilSocial } from "@informach/recreio";
import {
  calcularPoliticaEfetivaSobTrava,
  politicaConfereNoInstante,
} from "@/features/politicas/repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { ComposicaoSocial } from "./composicao-repository";

export async function admitirPerfilSocial(
  tx: Transacao,
  composicao: ComposicaoSocial,
  perfilId: PerfilId,
  agora: Date,
) {
  const perfil = composicao.perfis.find((p) => p.id === perfilId);
  assertAllowed(perfil, "CONTATO", "Contato não disponível.");
  const responsavel = composicao.vinculos.find((v) => v.profileId === perfil.id);
  const conta = composicao.contas.find(
    (c) => c.id === (perfil.kind === "adult" ? perfil.userId : responsavel?.guardianUserId),
  );
  const ativo =
    perfil.status === "active" &&
    Boolean(conta?.emailVerified) &&
    !(conta?.banned && (!conta.banExpiresAt || conta.banExpiresAt > agora));
  if (perfil.kind === "adult") {
    const fato: PerfilSocial = { id: perfilId, tipo: "adulto", ativo };
    return {
      fato,
      politicaDeJogo: null,
      recalculou: false,
      conferirPrazo: (_instante: Date) => {},
    };
  }
  const [protecao] = await tx
    .select()
    .from(protection)
    .where(eq(protection.profileId, perfilId))
    .for("share");
  assertAllowed(
    responsavel && protecao?.guardianLinkId === responsavel.id,
    "CONTATO",
    "Contato não disponível.",
  );
  const politica = await calcularPoliticaEfetivaSobTrava(tx, perfilId);
  if (politica.mudou)
    await encerrarSessoesAbertas(tx, sql`${games.profileId}=${perfilId}`, "permissions_changed", {
      porQuem: "recreio",
    });
  const fato: PerfilSocial = {
    id: perfilId,
    tipo: "protegido",
    ativo,
    reconhecida: politica.reconhecida,
    politica: politica.politica,
    responsabilidade: {
      contaId: ContaIdSchema.parse(responsavel.guardianUserId),
      vinculoId: responsavel.id,
      geracao: protecao.accessGeneration,
    },
  };
  return {
    fato,
    politicaDeJogo: politica,
    recalculou: politica.mudou,
    conferirPrazo: (instante: Date) => {
      if (!politicaConfereNoInstante(politica, instante))
        throw new AppError("CONTATO", "Contato não disponível.");
    },
  };
}
