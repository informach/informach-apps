import { createHash, randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioProfileDataKeys as keys,
  recreioRightsOperations as operations,
  recreioProfiles as profiles,
  sessions,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { expect } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { confirmarRetiradaDePerfil } from "@/features/direitos/consentimento-service";
import type { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import type { criarAssinaturaDoLivro } from "@/features/direitos/livro/assinatura";
import { prepararPedidoDeDireitos } from "@/features/direitos/service";
import { criarPerfilProprio } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { eventosCom, loginReal, novaConta } from "./apoio";

export class FalhaDaFixtureDaImagem extends Error {
  constructor(
    readonly etapa: string,
    readonly codigo: string,
  ) {
    super("RIGHTS_IMAGE_NATIVE_FIXTURE_FAILED");
    this.name = "FalhaDaFixtureDaImagem";
  }
}
function classificar(error: unknown): string {
  if (!(error instanceof Error)) return "UNKNOWN";
  if (error.name === "AssertionError") return "ASSERTION";
  if (error.name === "ZodError") return "VALIDATION";
  if (
    "code" in error &&
    typeof error.code === "string" &&
    [
      "INDISPONIVEL",
      "CONSENTIMENTO",
      "PERFIL",
      "DIREITOS_LIVRO",
      "DIREITOS_INTEGRIDADE",
      "APARELHO",
      "POLITICA",
      "42501",
      "23502",
      "23514",
      "23503",
      "23505",
    ].includes(error.code)
  )
    return error.code;
  if (
    "cause" in error &&
    error.cause instanceof Error &&
    "code" in error.cause &&
    typeof error.cause.code === "string" &&
    ["42501", "23502", "23514", "23503", "23505"].includes(error.cause.code)
  )
    return error.cause.code;
  return "UNCLASSIFIED";
}

/** Synthetic identities and native consent in the disposable source only.
 * The image receives neither login/email secrets nor the runner environment. */
export async function prepararRetiradaParaImagem(config: {
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
  fonte: string;
}) {
  let etapa = "registration";
  try {
    const adultos = [];
    for (let i = 0; i < 2; i++) {
      etapa = "registration";
      const conta = await novaConta(),
        login = await loginReal(conta),
        contexto = await resolverAtor(login);
      const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
      if (!contexto || !sessao) throw new Error("RIGHTS_IMAGE_NATIVE_SESSION");
      const autor: AutorNativoRecente = {
        ...contexto.ator,
        login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
      };
      etapa = "profile";
      const { perfil } = await criarPerfilProprio(autor, {
        apelido: "Pessoa da imagem",
        avatar: "padrao",
      });
      etapa = "data_key";
      const [key] = await db
        .insert(keys)
        .values({ profileId: perfil.id, gameId: "morada", key: "progresso", revision: 1 })
        .returning();
      if (!key) throw new Error("RIGHTS_IMAGE_NATIVE_DATA");
      const bytes = Buffer.from(`SYNTHETIC_OPAQUE_PROGRESS_${i}`);
      etapa = "data_version";
      const version: typeof versions.$inferInsert = {
        dataId: key.id,
        profileId: perfil.id,
        gameId: "morada",
        baseRevision: 0,
        revision: 1,
        kind: "accepted",
        bytes,
        digest: createHash("sha256").update(bytes).digest("hex"),
      };
      await db.insert(versions).values(version);
      bytes.fill(0);
      adultos.push({ autor, perfil });
    }
    const [alvo, outro] = adultos;
    if (!alvo || !outro) throw new Error("RIGHTS_IMAGE_NATIVE_FIXTURE");
    const retratoDoOutro = async () => ({
      perfil: (await db.select().from(profiles).where(eq(profiles.id, outro.perfil.id)))[0],
      dados: await db.select().from(versions).where(eq(versions.profileId, outro.perfil.id)),
    });
    const preservado = await retratoDoOutro();
    etapa = "preview";
    const previa = await prepararPedidoDeDireitos(alvo.autor, {
      pedidoId: randomUUID(),
      tipo: "retirar_perfil",
      perfis: [alvo.perfil.id],
    });
    etapa = "consent";
    const confirmacao = await confirmarRetiradaDePerfil(
      alvo.autor,
      {
        preparacaoId: previa.preparacaoId,
        planoSha256: previa.planoSha256,
        confirmoRetirada: true,
      },
      config,
    );
    const estado = async () =>
      (await db.select().from(operations).where(eq(operations.id, confirmacao.operacaoId)))[0];
    etapa = "consent_state";
    expect((await estado())?.state).toBe("publishing");
    return {
      estado,
      async verificar() {
        expect(await estado()).toMatchObject({
          state: "completed",
          leaseToken: null,
          leaseUntil: null,
        });
        expect((await estado())?.completedAt).toBeInstanceOf(Date);
        const [perfil] = await db.select().from(profiles).where(eq(profiles.id, alvo.perfil.id));
        expect(perfil).toMatchObject({
          status: "archived",
          userId: null,
          rightsOperationId: confirmacao.operacaoId,
        });
        expect(
          await db.select().from(versions).where(eq(versions.profileId, alvo.perfil.id)),
        ).toHaveLength(0);
        expect(await db.select().from(keys).where(eq(keys.profileId, alvo.perfil.id))).toHaveLength(
          0,
        );
        expect(await retratoDoOutro()).toEqual(preservado);
        const eventos = await eventosCom("operationId", confirmacao.operacaoId);
        expect(
          eventos.filter((e) => e.eventType === "recreio.rights_withdrawal_completed"),
        ).toHaveLength(1);
        const [identidades] = await db.execute<{
          n: number;
        }>(sql`select count(*)::int as n from core.users
        where id in (${alvo.autor.contaId},${outro.autor.contaId})`);
        expect(identidades?.n).toBe(2);
      },
    };
  } catch (error) {
    throw new FalhaDaFixtureDaImagem(etapa, classificar(error));
  }
}
