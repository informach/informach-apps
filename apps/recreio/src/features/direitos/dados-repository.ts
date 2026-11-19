import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioGuardianLinks as guardians,
  recreioProfileDataKeys as keys,
  recreioProfiles as profiles,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import { bytesParaBase64, LIMITES_DOS_DADOS } from "@informach/recreio/contrato";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
  lerContaNativa,
} from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { travar } from "@/lib/repository";
import type { CopiaPessoalDoJogo, PedidoDeCopiaDoJogo } from "./contrato";

const VERSOES_POR_CHAVE = 1 + LIMITES_DOS_DADOS.anteriores + LIMITES_DOS_DADOS.conflitos;
const MAX_VERSOES = LIMITES_DOS_DADOS.chaves * VERSOES_POR_CHAVE;
const MAX_CONQUISTAS = 10_000;
const indisponivel = () => new ErroDoRecreio("INDISPONIVEL");

/**
 * Base de F7, ainda sem rota pública ou artefato temporário. Não usa ingresso,
 * cobertura comercial, catálogo atual ou seleção de jogador como autoridade.
 * Conta → perfil próprio → alvo/responsabilidade → mutex de dados → aparelho:
 * o mutex precede o aparelho, como em todos os escritores de progresso.
 */
export async function copiarDadosPessoaisDoJogo(
  autor: AutorNativoRecente,
  pedido: PedidoDeCopiaDoJogo,
): Promise<CopiaPessoalDoJogo> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    await lerContaNativa(tx, autor.contaId);
    // autorizarContaNativa tomará esta mesma trava antes do aparelho.
    await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.userId, autor.contaId), eq(profiles.kind, "adult")))
      .for("share");
    const [perfil] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, pedido.perfilId))
      .for("share");
    const [vinculo] =
      perfil?.kind === "minor"
        ? await tx
            .select({ id: guardians.id })
            .from(guardians)
            .where(
              and(eq(guardians.profileId, perfil.id), eq(guardians.guardianUserId, autor.contaId)),
            )
            .for("share")
        : [];
    assertAllowed(
      perfil && (perfil.kind === "adult" ? perfil.userId === autor.contaId : vinculo),
      "PERFIL",
      "Perfil não disponível.",
    );
    // Perfis suspensos e sem cobertura conservam seus direitos pessoais.
    await travar(tx, `dados-perfil:${perfil.id}:${pedido.jogo}`);
    const nativa = await autorizarContaNativa(tx, autor);
    await nativa.conferirPrazo(autor.login);
    const escopo = and(eq(keys.profileId, perfil.id), eq(keys.gameId, pedido.jogo));
    const chaves = await tx
      .select()
      .from(keys)
      .where(escopo)
      .orderBy(keys.key)
      .limit(LIMITES_DOS_DADOS.chaves + 1);
    if (chaves.length > LIMITES_DOS_DADOS.chaves) throw indisponivel();
    // Metadados primeiro: tamanho/quantidade excessivos não carregam bytes sem limite.
    const metadados = await tx
      .select({
        id: versions.id,
        dataId: versions.dataId,
        tamanho: sql<number>`octet_length(${versions.bytes})`.mapWith(Number),
      })
      .from(versions)
      .where(and(eq(versions.profileId, perfil.id), eq(versions.gameId, pedido.jogo)))
      .orderBy(versions.id)
      .limit(MAX_VERSOES + 1);
    if (
      metadados.length > MAX_VERSOES ||
      metadados.some(
        (v) =>
          v.tamanho < 0 ||
          v.tamanho > LIMITES_DOS_DADOS.bytesPorVersao ||
          !Number.isSafeInteger(v.tamanho) ||
          !chaves.some((k) => k.id === v.dataId),
      )
    )
      throw indisponivel();
    for (const chave of chaves) {
      if (metadados.filter((v) => v.dataId === chave.id).length > VERSOES_POR_CHAVE)
        throw indisponivel();
    }
    const linhas = await tx
      .select()
      .from(versions)
      .where(and(eq(versions.profileId, perfil.id), eq(versions.gameId, pedido.jogo)))
      .orderBy(versions.dataId, versions.createdAt, versions.id)
      .limit(MAX_VERSOES + 1);
    if (
      linhas.length !== metadados.length ||
      linhas.some(
        (v) =>
          !metadados.some(
            (m) => m.id === v.id && m.dataId === v.dataId && m.tamanho === v.bytes.length,
          ) || createHash("sha256").update(v.bytes).digest("hex") !== v.digest,
      )
    )
      throw indisponivel();
    const obtidas = await tx
      .select({ id: achievements.achievementId, obtidaEm: achievements.earnedAt })
      .from(achievements)
      .where(and(eq(achievements.profileId, perfil.id), eq(achievements.gameId, pedido.jogo)))
      .orderBy(achievements.achievementId)
      .limit(MAX_CONQUISTAS + 1);
    if (obtidas.length > MAX_CONQUISTAS) throw indisponivel();
    const copia: CopiaPessoalDoJogo = {
      formato: "recreio-dados-pessoais-do-jogo-v1",
      escopo: "progresso-versoes-conflitos-conquistas",
      perfilId: perfil.id,
      jogo: pedido.jogo,
      conferidoEm: "",
      chaves: chaves.map((k) => {
        const historico = linhas.filter((v) => v.dataId === k.id);
        if (
          (k.revision > 0 &&
            !historico.some((v) => v.kind === "accepted" && v.revision === k.revision)) ||
          historico.some((v) => v.revision !== null && v.revision > k.revision) ||
          historico.filter((v) => v.kind === "conflict").length > LIMITES_DOS_DADOS.conflitos ||
          historico.filter((v) => v.kind === "accepted").length > 1 + LIMITES_DOS_DADOS.anteriores
        )
          throw indisponivel();
        return {
          chave: k.key,
          revisaoAtual: k.revision,
          versoes: historico.map((v) => ({
            id: v.id,
            revisaoBase: v.baseRevision,
            revisao: v.revision,
            estado: v.kind,
            conteudo: bytesParaBase64(v.bytes),
            sha256: v.digest,
            criadoEm: v.createdAt.toISOString(),
          })),
        };
      }),
      conquistas: obtidas.map((c) => ({ id: c.id, obtidaEm: c.obtidaEm.toISOString() })),
    };
    await logAuditEventStrict(
      "recreio.profile_game_copy_prepared",
      autor.contaId,
      {
        app: "recreio",
        profileId: perfil.id,
        gameId: pedido.jogo,
        keyCount: chaves.length,
        versionCount: linhas.length,
        achievementCount: obtidas.length,
      },
      { writer: tx },
    );
    copia.conferidoEm = (await nativa.conferirPrazo(autor.login)).toISOString();
    return copia;
  });
}
