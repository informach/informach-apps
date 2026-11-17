import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, desc, eq, inArray } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioProfileDataKeys as keys,
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
import { comSessaoDeJogoAutoritativa } from "@/features/autoridade-de-jogo/repository";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { reportError } from "@/lib/observability";
import { AGORA, type Transacao, travar } from "@/lib/repository";

/** A mesma autoridade dos jogos, com o mutex dos dados antes do aparelho. */
function comAutoridade<T>(
  sessao: SessaoDeJogoAtiva,
  executar: (tx: Transacao, contaId: string | null) => Promise<T>,
): Promise<T> {
  return comSessaoDeJogoAutoritativa(
    sessao,
    (tx) => travar(tx, `dados-perfil:${sessao.perfilId}:${sessao.jogo}`),
    executar,
  );
}

const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
function conferirIntegridade(linha: typeof versions.$inferSelect): void {
  if (hash(linha.bytes) !== linha.digest) {
    reportError(new Error("profile_data.integrity_failed"), crypto.randomUUID());
    throw new ErroDoRecreio("INDISPONIVEL");
  }
}
const escopo = (sessao: SessaoDeJogoAtiva) =>
  and(eq(keys.profileId, sessao.perfilId), eq(keys.gameId, sessao.jogo));
const versaoHttp = (linha: typeof versions.$inferSelect): VersaoDeDadosHttp => {
  conferirIntegridade(linha);
  return {
    id: linha.id,
    revisaoBase: linha.baseRevision,
    revisao: linha.revision,
    estado: linha.kind,
    conteudo: bytesParaBase64(linha.bytes),
    criadoEm: linha.createdAt.toISOString(),
  };
};

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
  return comAutoridade(sessao, (tx, contaId) => mutarDadosNaTransacao(tx, sessao, contaId, pedido));
}

/** Exige autoridade e mutex de dados já admitidos; compartilhado com a finalização restrita. */
export async function mutarDadosNaTransacao(
  tx: Transacao,
  sessao: SessaoDeJogoAtiva,
  contaId: string | null,
  pedido: MutacaoDeDados,
): Promise<ResultadoDeMutacao> {
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
  const linhas = await tx.select().from(versions).where(eq(versions.dataId, key.id)).limit(8);
  if (linhas.length > 7) throw new ErroDoRecreio("INDISPONIVEL");
  for (const linha of linhas) conferirIntegridade(linha);
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
    pedido.operacao === "gravar" ? Buffer.from(base64ParaBytes(pedido.conteudo)) : escolhida?.bytes;
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
      if (linhas.filter((linha) => linha.kind === "conflict").length >= LIMITES_DOS_DADOS.conflitos)
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
