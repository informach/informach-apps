import { createHash, randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioProfileDataKeys as keys,
  recreioRightsOperations as operations,
  sessions,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { retirarProximosDadosPessoais } from "@/features/direitos/dados-retirada-repository";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { conferirPrefixoDoLivro } from "@/features/direitos/livro/leitura";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import { consentirRetiradaNoBanco } from "@/features/direitos/retirada-consentimento-repository";
import { prepararPedidoDeDireitos } from "@/features/direitos/service";
import { criarPerfilProprio } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { loginReal, novaConta } from "./apoio";
import { fixtureDoLivro } from "./livro-apoio";
import { criarBucketDoLivro } from "./livro-s3-apoio";

async function adulto() {
  const conta = await novaConta(),
    login = await loginReal(conta),
    contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Native session absent");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const { perfil } = await criarPerfilProprio(autor, {
    apelido: "Pessoa privada",
    avatar: "padrao",
  });
  return { autor, perfil };
}
async function dados(perfilId: string, quantidade: number, comConquista = false) {
  const [chave] = await db
    .insert(keys)
    .values({
      profileId: perfilId,
      gameId: "historico-privado",
      key: "progresso",
      revision: quantidade,
    })
    .returning();
  if (!chave) throw new Error("Data key absent");
  if (quantidade)
    await db.insert(versions).values(
      Array.from({ length: quantidade }, (_, i) => {
        const bytes = Buffer.from(`conteudo pessoal ${i + 1}`);
        return {
          dataId: chave.id,
          profileId: perfilId,
          gameId: "historico-privado",
          baseRevision: i,
          revision: i + 1,
          kind: "accepted" as const,
          bytes,
          digest: createHash("sha256").update(bytes).digest("hex"),
        };
      }),
    );
  if (comConquista)
    await db.insert(achievements).values({
      profileId: perfilId,
      gameId: "historico-privado",
      achievementId: "primeiro",
      keyHash: "a".repeat(64),
    });
  return chave;
}

async function runtime() {
  const livro = fixtureDoLivro(),
    http = await criarBucketDoLivro();
  return { livro, http };
}
async function cenario(fn: (f: ReturnType<typeof compor>) => Promise<void>) {
  const r = await runtime();
  try {
    const f = compor(r);
    await f.storage.iniciarCabecalho(r.livro.assinatura.assinarCabecalho(r.livro.inicial));
    await fn(f);
  } finally {
    r.livro.encerrar();
    await r.http.fechar();
  }
}
function compor(r: Awaited<ReturnType<typeof runtime>>) {
  const assinatura = r.livro.assinatura,
    storage = criarArmazenamentoDoLivro({
      assinatura,
      cliente: r.http.cliente,
      bucket: "recreio-fixture",
      tempoLimiteMs: 2000,
    });
  return {
    storage,
    async criar(quantidade: number, conquista = false) {
      const a = await adulto(),
        chave = await dados(a.perfil.id, quantidade, conquista);
      const previa = await prepararPedidoDeDireitos(a.autor, {
        pedidoId: randomUUID(),
        tipo: "retirar_perfil",
        perfis: [a.perfil.id],
      });
      const op = await consentirRetiradaNoBanco(
        a.autor,
        {
          preparacaoId: previa.preparacaoId,
          planoSha256: previa.planoSha256,
          confirmoRetirada: true,
        },
        { assinatura, epoca: 0, fonte: "a".repeat(40) },
      );
      await publicarProximoConsentimento({ assinatura, storage });
      return { ...a, chave, op };
    },
    async executar() {
      const prova = await conferirPrefixoDoLivro({
        storage,
        maxEntradas: 100,
        tempoLimiteMs: 2000,
      });
      return retirarProximosDadosPessoais({ assinatura, prova });
    },
  };
}

describe("retirada paginada de conteúdo pessoal", () => {
  it("remove lotes de no máximo 100 sem carregar ou apagar conteúdo de outro perfil", async () =>
    cenario(async (f) => {
      const a = await f.criar(103, true),
        outro = await adulto(),
        preservada = await dados(outro.perfil.id, 1, true);
      expect(await f.executar()).toMatchObject({
        situacao: "dados_removidos",
        dominio: "versions",
        quantidade: 100,
      });
      expect(await f.executar()).toMatchObject({
        situacao: "dados_removidos",
        dominio: "versions",
        quantidade: 3,
      });
      expect(await f.executar()).toMatchObject({
        situacao: "dados_removidos",
        dominio: "keys",
        quantidade: 1,
      });
      expect(await f.executar()).toMatchObject({
        situacao: "dados_removidos",
        dominio: "achievements",
        quantidade: 1,
      });
      expect(await f.executar()).toEqual({ situacao: "ociosa" });
      expect(
        (
          await db
            .select({ id: versions.id })
            .from(versions)
            .where(eq(versions.profileId, a.perfil.id))
        ).length,
      ).toBe(0);
      expect((await db.select().from(keys).where(eq(keys.id, preservada.id))).length).toBe(1);
      expect(
        (await db.select().from(achievements).where(eq(achievements.profileId, outro.perfil.id)))
          .length,
      ).toBe(1);
      expect(
        (await db.select().from(operations).where(eq(operations.id, a.op.operacaoId)))[0]
          ?.completedAt,
      ).toBeNull();
    }));

  it("erro individual reverte o lote, conserva o erro e atende o próximo pedido", async () =>
    cenario(async (f) => {
      const a = await f.criar(0),
        b = await f.criar(1);
      await db.execute(
        sql`create function audit.recusar_chaves_retirada_fixture() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_profile_data_removed' and new.payload->>'domain'='keys' then raise exception 'auditoria indisponivel'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_chaves_retirada_fixture before insert on audit.events for each row execute function audit.recusar_chaves_retirada_fixture()`,
      );
      try {
        await expect(f.executar()).rejects.toBeInstanceOf(AuditPersistenceError);
        expect((await db.select().from(keys).where(eq(keys.id, a.chave.id))).length).toBe(1);
        expect(await f.executar()).toMatchObject({
          situacao: "dados_removidos",
          operacaoId: b.op.operacaoId,
          dominio: "versions",
          quantidade: 1,
        });
      } finally {
        await db.execute(sql`drop trigger recusar_chaves_retirada_fixture on audit.events`);
        await db.execute(sql`drop function audit.recusar_chaves_retirada_fixture()`);
      }
      const [adiada] = await db
        .select()
        .from(operations)
        .where(and(eq(operations.id, a.op.operacaoId), eq(operations.state, "running")));
      expect(adiada?.leaseToken).toBeNull();
      expect(adiada?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    }));
});
