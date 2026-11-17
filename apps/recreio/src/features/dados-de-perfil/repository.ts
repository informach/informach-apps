import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, desc, eq, inArray, sql } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioProfileDataKeys as keys,
  recreioProfiles as profiles,
  users,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import {
  base64ParaBytes,
  bytesParaBase64,
  LIMITES_DOS_DADOS,
  type MutacaoDeDados,
  type VersaoDeDadosHttp,
} from "@informach/recreio/contrato";
import { decidirFatosLidos } from "@/features/acesso/decisao";
import { lerFatosDeAcesso } from "@/features/acesso/repository";
import { sessaoDeLoginViva } from "@/features/sessao/login";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { AGORA, type Transacao, travar } from "@/lib/repository";

/** A ordem evita tomar o cursor de encerramento depois de travar a sessão. */
async function comAutoridade<T>(
  sessao: SessaoDeJogoAtiva,
  executar: (tx: Transacao, contaId: string) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const [referencia] = await tx
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.id, sessao.perfilId));
    // O pareamento infantil tem autoridade própria; não aceitar uma linha sem credencial.
    if (!referencia?.userId) throw new ErroDoRecreio("SESSAO_INVALIDA");
    const [conta] = await tx
      .select()
      .from(users)
      .where(eq(users.id, referencia.userId))
      .for("share");
    const [perfil] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, sessao.perfilId))
      .for("share");
    if (!conta || !perfil || perfil.userId !== conta.id || perfil.status !== "active")
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    await travar(tx, `dados-perfil:${sessao.perfilId}:${sessao.jogo}`);
    const [referenciaDeJogo] = await tx
      .select({ deviceId: games.deviceSessionId })
      .from(games)
      .where(eq(games.id, sessao.sid));
    if (!referenciaDeJogo) throw new ErroDoRecreio("SESSAO_INVALIDA");
    const [aparelho] = await tx
      .select()
      .from(devices)
      .where(eq(devices.id, referenciaDeJogo.deviceId))
      .for("share");
    const [jogo] = await tx.select().from(games).where(eq(games.id, sessao.sid)).for("share");
    if (
      !aparelho ||
      !jogo ||
      jogo.profileId !== perfil.id ||
      jogo.gameId !== sessao.jogo ||
      jogo.endedAt !== null ||
      aparelho.revokedAt !== null ||
      aparelho.activeProfileId !== perfil.id ||
      aparelho.kind !== "account" ||
      aparelho.userId !== conta.id ||
      !aparelho.authSessionId
    )
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    if (!(await sessaoDeLoginViva({ authSessionId: aparelho.authSessionId, contaId: conta.id })))
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    const fatos = await lerFatosDeAcesso(sessao.perfilId, tx);
    const [relogio] = await tx
      .select({ agora: sql<Date>`${AGORA}`.mapWith(users.createdAt) })
      .from(users)
      .where(eq(users.id, conta.id));
    if (!relogio) throw new ErroDoRecreio("SESSAO_INVALIDA");
    const agora = new Date(relogio.agora);
    if (
      (conta.banned && (!conta.banExpiresAt || conta.banExpiresAt > agora)) ||
      sessao.expiraEm <= agora.getTime() ||
      aparelho.expiresAt <= agora ||
      jogo.expiresAt <= agora ||
      perfil.policyVersion !== sessao.versaoDaPolitica
    )
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    const decisao = decidirFatosLidos(fatos, agora);
    if (!decisao.podeJogar)
      throw new ErroDoRecreio("ACESSO_PERDIDO", { estado: decisao.estado, motivo: decisao.motivo });
    return executar(tx, conta.id);
  });
}

const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const escopo = (sessao: SessaoDeJogoAtiva) =>
  and(eq(keys.profileId, sessao.perfilId), eq(keys.gameId, sessao.jogo));
const versaoHttp = (linha: typeof versions.$inferSelect): VersaoDeDadosHttp => ({
  id: linha.id,
  revisaoBase: linha.baseRevision,
  revisao: linha.revision,
  estado: linha.kind,
  conteudo: bytesParaBase64(linha.bytes),
  criadoEm: linha.createdAt.toISOString(),
});

export async function lerDados(sessao: SessaoDeJogoAtiva, chave: string, historico: boolean) {
  return comAutoridade(sessao, async (tx) => {
    const [key] = await tx
      .select()
      .from(keys)
      .where(and(escopo(sessao), eq(keys.key, chave)));
    const linhas = key
      ? await tx
          .select()
          .from(versions)
          .where(eq(versions.dataId, key.id))
          .orderBy(desc(versions.revision), desc(versions.createdAt))
          .limit(7)
      : [];
    if (historico) return { revisaoAtual: key?.revision ?? 0, versoes: linhas.map(versaoHttp) };
    const atual = linhas.find(
      (linha) => linha.kind === "accepted" && linha.revision === key?.revision,
    );
    return { versao: atual ? versaoHttp(atual) : null };
  });
}

/** Retornar o conflito permite COMMIT dos dois conteúdos antes da resposta 409. */
type ResultadoDeMutacao =
  | { revisao: number }
  | { conflito: true; versaoId: string; revisaoAtual: number }
  | { descartado: true };

export async function mutarDados(
  sessao: SessaoDeJogoAtiva,
  pedido: MutacaoDeDados,
): Promise<ResultadoDeMutacao> {
  return comAutoridade<ResultadoDeMutacao>(sessao, async (tx, contaId) => {
    let [key] = await tx
      .select()
      .from(keys)
      .where(and(escopo(sessao), eq(keys.key, pedido.chave)))
      .for("update");
    if (!key) {
      if (pedido.operacao !== "gravar") throw new ErroDoRecreio("NAO_ENCONTRADO");
      const existentes = await tx
        .select({ id: keys.id })
        .from(keys)
        .where(escopo(sessao))
        .limit(LIMITES_DOS_DADOS.chaves);
      if (existentes.length >= LIMITES_DOS_DADOS.chaves) throw new ErroDoRecreio("LIMITE_DE_DADOS");
      [key] = await tx
        .insert(keys)
        .values({ profileId: sessao.perfilId, gameId: sessao.jogo, key: pedido.chave })
        .returning();
    }
    if (!key) throw new ErroDoRecreio("INDISPONIVEL");
    const dataId = key.id;
    const linhas = await tx.select().from(versions).where(eq(versions.dataId, key.id));
    const escolhida =
      pedido.operacao !== "gravar"
        ? linhas.find((linha) => linha.id === pedido.versaoId && linha.kind === "conflict")
        : null;
    if (pedido.operacao !== "gravar" && !escolhida) throw new ErroDoRecreio("NAO_ENCONTRADO");
    const auditar = (
      evento:
        | "recreio.profile_data_updated"
        | "recreio.profile_data_conflict"
        | "recreio.profile_data_conflict_discarded",
      versionId: string,
      revisao: number,
    ) =>
      logAuditEventStrict(
        evento,
        contaId,
        {
          app: "recreio",
          profileId: sessao.perfilId,
          gameId: sessao.jogo,
          dataId,
          versionId,
          revision: revisao,
        },
        { writer: tx },
      );
    if (pedido.operacao === "descartar") {
      await tx
        .delete(versions)
        .where(
          and(
            eq(versions.id, pedido.versaoId),
            eq(versions.dataId, key.id),
            eq(versions.kind, "conflict"),
          ),
        );
      await auditar("recreio.profile_data_conflict_discarded", pedido.versaoId, key.revision);
      return { descartado: true as const };
    }
    const bytes =
      pedido.operacao === "gravar"
        ? Buffer.from(base64ParaBytes(pedido.conteudo))
        : escolhida?.bytes;
    if (!bytes) throw new ErroDoRecreio("NAO_ENCONTRADO");
    const digest = hash(bytes);
    if (pedido.revisao !== key.revision) {
      const repetida =
        pedido.operacao === "gravar" &&
        linhas.find(
          (linha) =>
            linha.kind === "accepted" &&
            linha.baseRevision === pedido.revisao &&
            linha.digest === digest,
        );
      if (repetida && repetida.revision !== null) return { revisao: repetida.revision };
      // Resolver nunca produz cópias de um conflito já preservado.
      if (pedido.operacao === "resolver")
        return { conflito: true as const, versaoId: pedido.versaoId, revisaoAtual: key.revision };
      let conflito = linhas.find(
        (linha) =>
          linha.kind === "conflict" &&
          linha.baseRevision === pedido.revisao &&
          linha.digest === digest,
      );
      if (!conflito) {
        if (
          linhas.filter((linha) => linha.kind === "conflict").length >= LIMITES_DOS_DADOS.conflitos
        )
          throw new ErroDoRecreio("LIMITE_DE_DADOS");
        [conflito] = await tx
          .insert(versions)
          .values({
            dataId: key.id,
            profileId: sessao.perfilId,
            gameId: sessao.jogo,
            baseRevision: pedido.revisao,
            kind: "conflict",
            bytes,
            digest,
          })
          .returning();
        if (!conflito) throw new ErroDoRecreio("INDISPONIVEL");
        await auditar("recreio.profile_data_conflict", conflito.id, key.revision);
      }
      if (!conflito) throw new ErroDoRecreio("INDISPONIVEL");
      return { conflito: true as const, versaoId: conflito.id, revisaoAtual: key.revision };
    }
    if (key.revision >= 2_147_483_646) throw new ErroDoRecreio("LIMITE_DE_DADOS");
    const revisao = key.revision + 1;
    const [nova] = await tx
      .insert(versions)
      .values({
        dataId: key.id,
        profileId: sessao.perfilId,
        gameId: sessao.jogo,
        baseRevision: key.revision,
        revision: revisao,
        kind: "accepted",
        bytes,
        digest,
      })
      .returning();
    await tx.update(keys).set({ revision: revisao, updatedAt: AGORA }).where(eq(keys.id, key.id));
    if (escolhida) await tx.delete(versions).where(eq(versions.id, escolhida.id));
    const antigas = linhas
      .filter((linha) => linha.kind === "accepted")
      .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))
      .slice(LIMITES_DOS_DADOS.anteriores);
    if (antigas.length)
      await tx.delete(versions).where(
        inArray(
          versions.id,
          antigas.map((linha) => linha.id),
        ),
      );
    if (!nova) throw new ErroDoRecreio("INDISPONIVEL");
    await auditar("recreio.profile_data_updated", nova.id, revisao);
    return { revisao };
  });
}

export async function registrarConquista(sessao: SessaoDeJogoAtiva, id: string, chaveIdem: string) {
  return comAutoridade(sessao, async (tx, contaId) => {
    const doPerfil = and(
      eq(achievements.profileId, sessao.perfilId),
      eq(achievements.gameId, sessao.jogo),
    );
    const keyHash = hash(chaveIdem);
    const [recibo] = await tx
      .select()
      .from(achievements)
      .where(and(doPerfil, eq(achievements.keyHash, keyHash)));
    if (recibo && recibo.achievementId !== id) throw new ErroDoRecreio("FATO_DUPLICADO");
    let [obtida] = await tx
      .select()
      .from(achievements)
      .where(and(doPerfil, eq(achievements.achievementId, id)));
    if (obtida && obtida.keyHash !== keyHash) throw new ErroDoRecreio("FATO_DUPLICADO");
    if (!obtida) {
      [obtida] = await tx
        .insert(achievements)
        .values({ profileId: sessao.perfilId, gameId: sessao.jogo, achievementId: id, keyHash })
        .returning();
      if (!obtida) throw new ErroDoRecreio("INDISPONIVEL");
      await logAuditEventStrict(
        "recreio.achievement_unlocked",
        contaId,
        { app: "recreio", profileId: sessao.perfilId, gameId: sessao.jogo, achievementId: id },
        { writer: tx },
      );
    }
    if (!obtida) throw new ErroDoRecreio("INDISPONIVEL");
    return { id: obtida.achievementId, obtidaEm: obtida.earnedAt.toISOString() };
  });
}
