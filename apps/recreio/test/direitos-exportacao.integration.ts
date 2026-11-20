import { randomBytes, randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  customers,
  recreioDeviceSessions as devices,
  recreioPersonalExports as exports,
  recreioEntitlements as grants,
  recreioGroups as groups,
  recreioAccountParticipations as participations,
  recreioProfiles as profiles,
  sessions,
  subscriptions,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { capturarDadosPessoaisDaConta } from "@/features/direitos/captura-conta-repository";
import { capturarDadosPessoaisDoPerfil } from "@/features/direitos/captura-perfil-repository";
import {
  admitirDownloadPessoalNoBanco,
  carregarCopiaPessoalNoBanco,
  expurgarCopiasPessoaisVencidas,
  publicarCopiaPessoalNoBanco,
} from "@/features/direitos/exportacao-repository";
import {
  abrirArquivoPessoal,
  prepararArquivoPessoal,
  revogarArquivoPessoal,
} from "@/features/direitos/exportacao-service";
import { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import { criarPerfilProprio } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { loginReal, novaConta } from "./apoio";
import { livroDoEncerramento } from "./encerramento-financeiro-apoio";

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
    apelido: "Perfil exportado",
    avatar: "padrao",
  });
  return { conta, autor, perfil };
}

async function semJogador() {
  const conta = await novaConta(),
    login = await loginReal(conta),
    contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Native session absent");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  return { conta, autor };
}
async function cenario(
  executar: (
    f: Awaited<ReturnType<typeof adulto>> & { cifrador: ReturnType<typeof criarCifradorDeObjetos> },
  ) => Promise<void>,
) {
  const key = randomBytes(32),
    cifrador = criarCifradorDeObjetos({
      chaveAtiva: "fixture",
      chaves: new Map([["fixture", key]]),
      limiteBytes: 32 * 1024 * 1024,
    });
  key.fill(0);
  try {
    await executar({ ...(await adulto()), cifrador });
  } finally {
    cifrador.encerrar();
  }
}

describe("direitos: artefato temporário pessoal", () => {
  it("copia datas e tipos das próprias ações Recreio, pagina microssegundos e não carrega payloads ou outros atores/apps", async () => {
    const a = await semJogador(),
      b = await semJogador();
    await db.execute(sql`insert into audit.events (id,event_type,actor_id,payload,created_at)
      select gen_random_uuid()::text,'recreio.copy_fixture',${a.conta.id},
        jsonb_build_object('app','recreio','conteudo','PAYLOAD_PRIVADO_NAO_EXPORTAR'),
        '2025-01-01T00:00:00.123456Z'::timestamptz from generate_series(1,205)`);
    await db.execute(sql`insert into audit.events (id,event_type,actor_id,payload,created_at) values
      (gen_random_uuid()::text,'recreio.fixture_outro_ator',${b.conta.id},'{"app":"recreio"}',now()),
      (gen_random_uuid()::text,'cozya.fixture_outro_app',${a.conta.id},'{"app":"recreio"}',now()),
      (gen_random_uuid()::text,'recreio.fixture_escopo_divergente',${a.conta.id},'{"app":"cozya"}',now()),
      (gen_random_uuid()::text,'recreio.fixture_sem_ator',null,'{"app":"recreio"}',now())`);
    const captura = await capturarDadosPessoaisDaConta(a.autor);
    try {
      const texto = captura.bytes.toString("utf8");
      const proprias = texto
        .split("\n")
        .filter(
          (l) =>
            l.startsWith('{"tipo":"acao_propria_auditada"') &&
            l.includes('"evento":"recreio.copy_fixture"'),
        );
      expect(proprias).toHaveLength(205);
      expect(
        proprias.every((l) => l.includes('"registradaEm":"2025-01-01T00:00:00.123456Z"')),
      ).toBe(true);
      for (const proibido of [
        "PAYLOAD_PRIVADO_NAO_EXPORTAR",
        "recreio.fixture_outro_ator",
        "cozya.fixture_outro_app",
        "recreio.fixture_escopo_divergente",
        "recreio.fixture_sem_ator",
        b.conta.id,
        b.conta.email,
      ])
        expect(texto).not.toContain(proibido);
    } finally {
      captura.bytes.fill(0);
    }
  });
  it("inclui todas as concessões do próprio grupo mesmo sem jogador, sem emitir dados da equipe ou de outro grupo", async () =>
    cenario(async (f) => {
      const a = await semJogador(),
        b = await semJogador();
      const [ga] = await db.insert(groups).values({ ownerUserId: a.conta.id }).returning();
      const [gb] = await db.insert(groups).values({ ownerUserId: b.conta.id }).returning();
      if (!ga || !gb) throw new Error("Commercial group absent");
      const [alheia] = await db
        .insert(grants)
        .values({
          groupId: gb.id,
          kind: "courtesy",
          tier: "family",
          startsAt: new Date("2020-01-01T00:00:00Z"),
          endsAt: new Date("2021-01-01T00:00:00Z"),
          reasonCode: "foreign_internal",
        })
        .returning();
      await db.insert(grants).values(
        Array.from({ length: 105 }, (_, n) => ({
          groupId: ga.id,
          kind: n === 0 ? ("trial" as const) : ("courtesy" as const),
          tier: "individual" as const,
          startsAt: new Date("2020-01-01T00:00:00Z"),
          endsAt: new Date("2021-01-01T00:00:00Z"),
          reasonCode: "internal_fixture",
          grantedByUserId: b.conta.id,
          ...(n === 0
            ? {
                revokedAt: new Date("2020-06-01T00:00:00Z"),
                revokedByUserId: b.conta.id,
                revokeReasonCode: "internal_revocation",
              }
            : {}),
        })),
      );
      if (!alheia) throw new Error("Foreign grant absent");
      const copia = await prepararArquivoPessoal(
        a.autor,
        { copiaId: randomUUID(), escopo: "account" },
        f.cifrador,
      );
      const bytes = await abrirArquivoPessoal(a.autor, { copiaId: copia.copiaId }, f.cifrador);
      try {
        const texto = bytes.toString("utf8"),
          linhas = texto.split("\n").filter((l) => l.startsWith('{"tipo":"concessao_propria"'));
        expect(linhas).toHaveLength(105);
        expect(texto).toContain('"revogadaEm":"2020-06-01T00:00:00.000Z"');
        for (const privado of [
          b.conta.id,
          b.conta.email,
          alheia.id,
          ga.id,
          gb.id,
          "internal_fixture",
          "foreign_internal",
          "internal_revocation",
          "grantedByUserId",
          "revokedByUserId",
        ])
          expect(texto).not.toContain(privado);
      } finally {
        bytes.fill(0);
      }
      expect(await db.select().from(profiles).where(eq(profiles.userId, a.conta.id))).toHaveLength(
        0,
      );
    }));
  it("encerramento invalida cópia anterior e publicação em voo, sem impedir nova cópia dos direitos", async () =>
    cenario(async (f) => {
      const a = await semJogador();
      const antiga = await prepararArquivoPessoal(
        a.autor,
        { copiaId: randomUUID(), escopo: "account" },
        f.cifrador,
      );
      const captura = await capturarDadosPessoaisDaConta(a.autor),
        copiaId = randomUUID();
      const cifrada = f.cifrador.cifrar({ tipo: "exportacao", id: copiaId }, captura.bytes);
      const livro = await livroDoEncerramento(a.autor, () => {
        throw new Error("No customer");
      });
      try {
        expect(captura.revisaoDaParticipacao).toBe(0);
        await expect(
          publicarCopiaPessoalNoBanco(a.autor, copiaId, captura, cifrada),
        ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
        expect(await db.select().from(exports).where(eq(exports.id, copiaId))).toEqual([]);
        await expect(
          abrirArquivoPessoal(a.autor, { copiaId: antiga.copiaId }, f.cifrador),
        ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
        const atual = await prepararArquivoPessoal(
          a.autor,
          { copiaId: randomUUID(), escopo: "account" },
          f.cifrador,
        );
        expect(
          (await db.select().from(exports).where(eq(exports.id, atual.copiaId)))[0],
        ).toMatchObject({ participationRevision: 2 });
        const bytes = await abrirArquivoPessoal(a.autor, { copiaId: atual.copiaId }, f.cifrador);
        try {
          expect(bytes.toString("utf8")).toContain('"estado":"closing"');
        } finally {
          bytes.fill(0);
        }
      } finally {
        captura.bytes.fill(0);
        cifrada.bytes.fill(0);
        await livro.fechar();
      }
    }));

  it("mudança para closed entre abertura e admissão recusa bytes antigos e conserva cópia nova", async () =>
    cenario(async (f) => {
      const a = await semJogador();
      const livro = await livroDoEncerramento(a.autor, () => {
        throw new Error("No customer");
      });
      let corpo: Buffer | undefined;
      try {
        const recibo = await prepararArquivoPessoal(
          a.autor,
          { copiaId: randomUUID(), escopo: "account" },
          f.cifrador,
        );
        const envelope = await carregarCopiaPessoalNoBanco(a.autor, recibo.copiaId);
        try {
          corpo = f.cifrador.abrir(envelope.referencia, envelope.bytes);
        } finally {
          envelope.bytes.fill(0);
        }
        // Structural state transition solely tests the export fence. This is
        // not proof that account-domain cleanup or closure has completed.
        await db
          .update(participations)
          .set({
            state: "closed",
            revision: 3,
            closedAt: sql`clock_timestamp()`,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(eq(participations.userId, a.conta.id));
        await expect(
          admitirDownloadPessoalNoBanco(a.autor, recibo.copiaId, envelope.referencia),
        ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
        const nova = await prepararArquivoPessoal(
          a.autor,
          { copiaId: randomUUID(), escopo: "account" },
          f.cifrador,
        );
        const bytes = await abrirArquivoPessoal(a.autor, { copiaId: nova.copiaId }, f.cifrador);
        try {
          expect(bytes.toString("utf8")).toContain('"estado":"closed"');
        } finally {
          bytes.fill(0);
        }
      } finally {
        corpo?.fill(0);
        await livro.fechar();
      }
    }));
  it("conta sem jogador exporta só o próprio histórico Recreio, sem misturar outro adulto ou aplicativo", async () =>
    cenario(async (f) => {
      const a = await semJogador(),
        b = await semJogador();
      const clientes = await db
        .insert(customers)
        .values([
          {
            provider: "stripe" as const,
            providerCustomerId: `cus_${randomUUID()}`,
            subjectType: "user" as const,
            subjectId: a.conta.id,
            app: "recreio",
            email: "fiscal-proprio@example.test",
          },
          {
            provider: "stripe" as const,
            providerCustomerId: `cus_${randomUUID()}`,
            subjectType: "user" as const,
            subjectId: b.conta.id,
            app: "recreio",
            email: "fiscal-alheio@example.test",
          },
          {
            provider: "stripe" as const,
            providerCustomerId: `cus_${randomUUID()}`,
            subjectType: "user" as const,
            subjectId: a.conta.id,
            app: "cozya",
            email: "fiscal-outro-app@example.test",
          },
        ])
        .returning({ id: customers.id });
      await db.insert(subscriptions).values(
        clientes.map((cliente, i) => ({
          customerId: cliente.id,
          provider: "stripe" as const,
          providerSubscriptionId: `sub_${randomUUID()}`,
          productId: i === 0 ? "recreio_individual_monthly" : "produto-que-nao-pode-aparecer",
          providerPriceId: `price_${randomUUID()}`,
          status: "active" as const,
          currentPeriodStart: new Date("2026-11-01T00:00:00Z"),
          currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
          metadata: { privado: "METADADO_LIVRE_NAO_EXPORTAR" },
        })),
      );
      const pedido = { copiaId: randomUUID(), escopo: "account" as const };
      const recibo = await prepararArquivoPessoal(a.autor, pedido, f.cifrador);
      expect(recibo.escopo).toBe("account");
      expect(await prepararArquivoPessoal(a.autor, pedido, f.cifrador)).toEqual(recibo);
      const [linha] = await db.select().from(exports).where(eq(exports.id, pedido.copiaId));
      expect(linha).toMatchObject({
        scope: "account",
        profileId: null,
        profileKind: null,
        policyVersion: null,
        guardianReference: null,
      });
      const bytes = await abrirArquivoPessoal(a.autor, { copiaId: pedido.copiaId }, f.cifrador);
      try {
        const texto = bytes.toString("utf8");
        expect(texto).toContain(a.conta.email);
        expect(texto).toContain("fiscal-proprio@example.test");
        expect(texto).toContain("recreio_individual_monthly");
        for (const privado of [
          b.conta.email,
          "fiscal-alheio@example.test",
          "fiscal-outro-app@example.test",
          "produto-que-nao-pode-aparecer",
          "METADADO_LIVRE_NAO_EXPORTAR",
          a.autor.login.authSessionId,
          a.autor.sessaoDeAparelhoId,
        ])
          expect(texto).not.toContain(privado);
      } finally {
        bytes.fill(0);
      }
      expect(await db.select().from(profiles).where(eq(profiles.userId, a.conta.id))).toHaveLength(
        0,
      );
      await expect(
        abrirArquivoPessoal(b.autor, { copiaId: pedido.copiaId }, f.cifrador),
      ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
    }));
  it("escopo de conta não pode ser reaproveitado como perfil e continua negado ao contexto infantil", async () =>
    cenario(async (f) => {
      const pedido = { copiaId: randomUUID(), escopo: "account" as const };
      await prepararArquivoPessoal(f.autor, pedido, f.cifrador);
      await expect(
        prepararArquivoPessoal(
          f.autor,
          { copiaId: pedido.copiaId, perfilId: f.perfil.id },
          f.cifrador,
        ),
      ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
      await db
        .update(devices)
        .set({ minorContextGeneration: randomUUID() })
        .where(eq(devices.id, f.autor.sessaoDeAparelhoId));
      await expect(capturarDadosPessoaisDaConta(f.autor)).rejects.toMatchObject({ code: "AUTH" });
      await expect(
        abrirArquivoPessoal(f.autor, { copiaId: pedido.copiaId }, f.cifrador),
      ).rejects.toMatchObject({ code: "AUTH" });
    }));
  it("guarda somente envelope cifrado e repete o mesmo arquivo; UUID não concede acesso a outro adulto", async () =>
    cenario(async (f) => {
      const pedido = { copiaId: randomUUID(), perfilId: f.perfil.id },
        outra = await adulto();
      const recibo = await prepararArquivoPessoal(f.autor, pedido, f.cifrador);
      const [linha] = await db.select().from(exports).where(eq(exports.id, pedido.copiaId));
      expect(linha?.encryptedBytes?.includes(Buffer.from("Perfil exportado"))).toBe(false);
      expect(await prepararArquivoPessoal(f.autor, pedido, f.cifrador)).toEqual(recibo);
      expect(
        (await db.select().from(exports).where(eq(exports.id, pedido.copiaId)))[0]?.encryptedBytes,
      ).toEqual(linha?.encryptedBytes);
      const bytes = await abrirArquivoPessoal(f.autor, { copiaId: pedido.copiaId }, f.cifrador);
      try {
        expect(bytes.toString("utf8")).toContain("Perfil exportado");
        expect(bytes.toString("utf8")).not.toContain(f.autor.login.authSessionId);
      } finally {
        bytes.fill(0);
      }
      await expect(
        abrirArquivoPessoal(outra.autor, { copiaId: pedido.copiaId }, f.cifrador),
      ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
      await expect(
        prepararArquivoPessoal(f.autor, { ...pedido, perfilId: outra.perfil.id }, f.cifrador),
      ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
    }));
  it("revogar durante a abertura impede admitir a resposta e apaga o envelope", async () =>
    cenario(async (f) => {
      const pedido = { copiaId: randomUUID(), perfilId: f.perfil.id };
      await prepararArquivoPessoal(f.autor, pedido, f.cifrador);
      const envelope = await carregarCopiaPessoalNoBanco(f.autor, pedido.copiaId),
        bytes = f.cifrador.abrir(envelope.referencia, envelope.bytes);
      try {
        await revogarArquivoPessoal(f.autor, { copiaId: pedido.copiaId });
        await expect(
          admitirDownloadPessoalNoBanco(f.autor, pedido.copiaId, envelope.referencia),
        ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
        expect(
          (await db.select().from(exports).where(eq(exports.id, pedido.copiaId)))[0],
        ).toMatchObject({ state: "revoked", encryptedBytes: null, reference: null });
      } finally {
        envelope.bytes.fill(0);
        bytes.fill(0);
      }
    }));
  it("mudança de política após a captura recusa a publicação sem armazenar bytes", async () =>
    cenario(async (f) => {
      const captura = await capturarDadosPessoaisDoPerfil(f.autor, f.perfil.id),
        copiaId = randomUUID(),
        cifrada = f.cifrador.cifrar({ tipo: "exportacao", id: copiaId }, captura.bytes);
      try {
        await db
          .update(profiles)
          .set({ policyVersion: sql`${profiles.policyVersion}+1` })
          .where(eq(profiles.id, f.perfil.id));
        await expect(
          publicarCopiaPessoalNoBanco(f.autor, copiaId, captura, cifrada),
        ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
        expect(await db.select().from(exports).where(eq(exports.id, copiaId))).toHaveLength(0);
      } finally {
        captura.bytes.fill(0);
        cifrada.bytes.fill(0);
      }
    }));
  it("contexto infantil e prazo vencido impedem download; manutenção retira os bytes", async () =>
    cenario(async (f) => {
      const pedido = { copiaId: randomUUID(), perfilId: f.perfil.id };
      await prepararArquivoPessoal(f.autor, pedido, f.cifrador);
      await db
        .update(devices)
        .set({ minorContextGeneration: randomUUID() })
        .where(eq(devices.id, f.autor.sessaoDeAparelhoId));
      await expect(
        abrirArquivoPessoal(f.autor, { copiaId: pedido.copiaId }, f.cifrador),
      ).rejects.toMatchObject({ code: "AUTH" });
      await db
        .update(devices)
        .set({ minorContextGeneration: null })
        .where(eq(devices.id, f.autor.sessaoDeAparelhoId));
      await db
        .update(exports)
        .set({
          capturedAt: sql`${exports.capturedAt}-interval '11 minutes'`,
          expiresAt: sql`${exports.expiresAt}-interval '11 minutes'`,
          createdAt: sql`${exports.createdAt}-interval '11 minutes'`,
        })
        .where(eq(exports.id, pedido.copiaId));
      await expect(
        abrirArquivoPessoal(f.autor, { copiaId: pedido.copiaId }, f.cifrador),
      ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
      expect((await expurgarCopiasPessoaisVencidas()).expiradas).toBeGreaterThanOrEqual(1);
      expect(
        (await db.select().from(exports).where(eq(exports.id, pedido.copiaId)))[0],
      ).toMatchObject({ state: "expired", encryptedBytes: null, reference: null });
    }));
  it("falha de auditoria ao substituir mantém o arquivo anterior e não publica o novo", async () =>
    cenario(async (f) => {
      const primeiro = { copiaId: randomUUID(), perfilId: f.perfil.id },
        segundo = { copiaId: randomUUID(), perfilId: f.perfil.id };
      await prepararArquivoPessoal(f.autor, primeiro, f.cifrador);
      await db.execute(
        sql`create function audit.recusar_exportacao_fixture() returns trigger language plpgsql as $$ begin if new.event_type='recreio.personal_export_published' then raise exception 'fixture'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_exportacao_fixture before insert on audit.events for each row execute function audit.recusar_exportacao_fixture()`,
      );
      try {
        await expect(prepararArquivoPessoal(f.autor, segundo, f.cifrador)).rejects.toBeInstanceOf(
          AuditPersistenceError,
        );
      } finally {
        await db.execute(sql`drop trigger recusar_exportacao_fixture on audit.events`);
        await db.execute(sql`drop function audit.recusar_exportacao_fixture()`);
      }
      expect(
        (await db.select().from(exports).where(eq(exports.id, primeiro.copiaId)))[0]?.state,
      ).toBe("ready");
      expect(await db.select().from(exports).where(eq(exports.id, segundo.copiaId))).toHaveLength(
        0,
      );
    }));
});
