import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioAdultDeclarations as declarations,
  recreioDeviceSessions as devices,
  recreioGroups as groups,
  recreioGuardianLinks as guardians,
  recreioMinorProfiles as minors,
  recreioProfiles as profiles,
  recreioProfileCreationRequests as requests,
  sessions,
  users,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import {
  cadastrarPerfilMenor,
  cancelarPerfilMenor,
  listarPerfisMenores,
  prepararPerfilMenor,
} from "@/features/familia/service";
import { criarPerfilProprio } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { codigoDoBanco, eventosCom, loginReal, novaConta, RESTRICAO, sinal } from "./apoio";

async function responsavel() {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Login nativo ausente");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  return { conta, autor };
}
async function pedido(autor: AutorNativoRecente, apelido = "Menor privado") {
  const intencao = await prepararPerfilMenor(autor);
  return {
    intencaoId: intencao.id,
    perfil: { apelido, avatar: "padrao" },
    nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
    assumoResponsabilidade: true as const,
    versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
  };
}

describe("cadastro sob responsabilidade declarada", () => {
  it("lista somente responsabilidades explícitas e não devolve nascimento nem identidade", async () => {
    const a = await responsavel();
    const b = await responsavel();
    const primeiro = await cadastrarPerfilMenor(a.autor, await pedido(a.autor));
    await cadastrarPerfilMenor(b.autor, await pedido(b.autor, "Outro grupo"));
    const pagina = await listarPerfisMenores(a.autor);
    expect(pagina.itens).toHaveLength(1);
    expect(pagina.itens[0]).toMatchObject({
      perfil: { id: primeiro.perfil.id },
      faixas: { social: "ate_12", classificacao: "6" },
    });
    expect(pagina.proximo).toBeNull();
    for (const privado of [
      "birthMonth",
      "birthYear",
      "nascimento",
      "guardianUserId",
      a.conta.email,
    ]) {
      expect(JSON.stringify(pagina)).not.toContain(privado);
    }
    const [declaracaoDeB] = await db
      .select()
      .from(declarations)
      .where(eq(declarations.userId, b.conta.id));
    if (!declaracaoDeB) throw new Error("Declaração de B ausente");
    await db
      .update(guardians)
      .set({
        guardianUserId: b.conta.id,
        declarationId: declaracaoDeB.id,
      })
      .where(eq(guardians.profileId, primeiro.perfil.id));
    expect((await listarPerfisMenores(a.autor)).itens).toEqual([]);
    expect((await listarPerfisMenores(b.autor)).itens).toHaveLength(2);
  });

  it("cancelamento não alcança intenção alheia e não apaga recibo confirmado", async () => {
    const a = await responsavel();
    const b = await responsavel();
    const entrada = await pedido(a.autor);
    await cancelarPerfilMenor(b.autor, entrada.intencaoId);
    const criado = await cadastrarPerfilMenor(a.autor, entrada);
    await cancelarPerfilMenor(a.autor, entrada.intencaoId);
    expect((await cadastrarPerfilMenor(a.autor, entrada)).perfil.id).toBe(criado.perfil.id);
    const cancelado = await pedido(a.autor);
    await cancelarPerfilMenor(a.autor, cancelado.intencaoId);
    await cancelarPerfilMenor(a.autor, cancelado.intencaoId);
    await expect(cadastrarPerfilMenor(a.autor, cancelado)).rejects.toMatchObject({
      code: "CADASTRO",
    });
    expect((await listarPerfisMenores(a.autor)).itens).toHaveLength(1);
    await expect(cancelarPerfilMenor(a.autor, "invalido")).rejects.toThrow();
  });

  it("gestão dos menores recusa login removido e aparelho infantil", async () => {
    const r = await responsavel();
    const entrada = await pedido(r.autor);
    const criado = await cadastrarPerfilMenor(r.autor, entrada);
    await db
      .update(devices)
      .set({ activeProfileId: criado.perfil.id })
      .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    await expect(listarPerfisMenores(r.autor)).rejects.toMatchObject({ code: "AUTH" });
    await expect(cancelarPerfilMenor(r.autor, entrada.intencaoId)).rejects.toMatchObject({
      code: "AUTH",
    });
    await db
      .update(devices)
      .set({ activeProfileId: null })
      .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    await db.delete(sessions).where(eq(sessions.id, r.autor.login.authSessionId));
    await expect(listarPerfisMenores(r.autor)).rejects.toMatchObject({ code: "AUTH" });
    await expect(cancelarPerfilMenor(r.autor, entrada.intencaoId)).rejects.toMatchObject({
      code: "AUTH",
    });
  });

  it("pagante sem jogador cria um menor, com vínculo explícito e sem verificação fictícia", async () => {
    const r = await responsavel();
    const resultado = await cadastrarPerfilMenor(r.autor, await pedido(r.autor));
    expect(resultado).toMatchObject({
      criado: true,
      perfil: { tipo: "minor", apelido: "Menor privado" },
    });
    expect(await db.select().from(profiles).where(eq(profiles.userId, r.conta.id))).toEqual([]);
    const [vinculo] = await db
      .select()
      .from(guardians)
      .where(eq(guardians.profileId, resultado.perfil.id));
    expect(vinculo?.guardianUserId).toBe(r.conta.id);
    expect(
      await db.select().from(declarations).where(eq(declarations.userId, r.conta.id)),
    ).toHaveLength(1);
    const eventos = await eventosCom("profileId", resultado.perfil.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.payload).toMatchObject({
      kind: "minor",
      declarationVersion: VERSAO_DA_RESPONSABILIDADE,
    });
    const auditoria = JSON.stringify(eventos);
    for (const privado of [
      "Menor privado",
      r.conta.email,
      "birthMonth",
      "birthYear",
      "nascimento",
      "fingerprint",
    ])
      expect(auditoria).not.toContain(privado);
    expect(resultado.perfil).not.toHaveProperty("nascimento");
  });

  it("duas confirmações do mesmo pedido devolvem um único perfil e evento", async () => {
    const r = await responsavel();
    const entrada = await pedido(r.autor);
    const resultados = await Promise.all([
      cadastrarPerfilMenor(r.autor, entrada),
      cadastrarPerfilMenor(r.autor, entrada),
    ]);
    expect(new Set(resultados.map((item) => item.perfil.id)).size).toBe(1);
    expect(resultados.filter((item) => item.criado)).toHaveLength(1);
    expect(await eventosCom("profileId", resultados[0]?.perfil.id ?? "ausente")).toHaveLength(1);
    await expect(
      cadastrarPerfilMenor(r.autor, {
        ...entrada,
        perfil: { ...entrada.perfil, apelido: "Outro menor" },
      }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
  });

  it("ID desconhecido ou de outra conta não inicia cadastro nem revela o titular", async () => {
    const a = await responsavel();
    const b = await responsavel();
    const entrada = await pedido(a.autor);
    await expect(cadastrarPerfilMenor(b.autor, entrada)).rejects.toMatchObject({
      code: "CADASTRO",
    });
    await expect(
      cadastrarPerfilMenor(a.autor, { ...entrada, intencaoId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "CADASTRO" });
    expect(await db.select().from(groups).where(eq(groups.ownerUserId, b.conta.id))).toEqual([]);
    expect(
      await db.select().from(guardians).where(eq(guardians.guardianUserId, b.conta.id)),
    ).toEqual([]);
  });

  it("intenção vencida não cria perfil e recibo de perfil excluído não o recria", async () => {
    const r = await responsavel();
    const entrada = await pedido(r.autor);
    await db
      .update(requests)
      .set({
        createdAt: sql`clock_timestamp()-interval '20 minutes'`,
        expiresAt: sql`clock_timestamp()-interval '5 minutes'`,
      })
      .where(eq(requests.id, entrada.intencaoId));
    await expect(cadastrarPerfilMenor(r.autor, entrada)).rejects.toMatchObject({
      code: "CADASTRO_VENCIDO",
    });
    const outroPedido = await pedido(r.autor);
    const criado = await cadastrarPerfilMenor(r.autor, outroPedido);
    await db.delete(profiles).where(eq(profiles.id, criado.perfil.id));
    await expect(cadastrarPerfilMenor(r.autor, outroPedido)).rejects.toMatchObject({
      code: "CADASTRO_ENCERRADO",
    });
    expect(
      await db.select().from(guardians).where(eq(guardians.guardianUserId, r.conta.id)),
    ).toEqual([]);
    expect(
      (await db.select().from(requests).where(eq(requests.id, outroPedido.intencaoId)))[0],
    ).toMatchObject({ profileId: null });
  });

  it("criações concorrentes e perfil próprio respeitam quatro vagas no grupo", async () => {
    const r = await responsavel();
    const entradas = await Promise.all(
      Array.from({ length: 4 }, (_, i) => pedido(r.autor, `Menor ${i}`)),
    );
    const resultados = await Promise.allSettled([
      ...entradas.map((entrada) => cadastrarPerfilMenor(r.autor, entrada)),
      criarPerfilProprio(r.autor, { apelido: "Adulto", avatar: "padrao" }),
    ]);
    expect(resultados.filter((item) => item.status === "fulfilled")).toHaveLength(4);
    expect(resultados.filter((item) => item.status === "rejected")).toHaveLength(1);
    const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, r.conta.id));
    if (!grupo) throw new Error("Grupo ausente");
    expect(await db.select().from(profiles).where(eq(profiles.groupId, grupo.id))).toHaveLength(4);
  });

  it.each(["sem declaração", "versão antiga", "adulto", "futuro", "identidade no corpo"] as const)(
    "recusa cadastro inválido: %s",
    async (caso) => {
      const r = await responsavel();
      const entrada = await pedido(r.autor);
      const invalido =
        caso === "sem declaração"
          ? { ...entrada, assumoResponsabilidade: false }
          : caso === "versão antiga"
            ? { ...entrada, versaoDaDeclaracao: "antiga" }
            : caso === "adulto"
              ? { ...entrada, nascimento: { ano: 1980, mes: 1 } }
              : caso === "futuro"
                ? { ...entrada, nascimento: { ano: 9999, mes: 1 } }
                : { ...entrada, guardianUserId: crypto.randomUUID() };
      await expect(cadastrarPerfilMenor(r.autor, invalido)).rejects.toBeDefined();
      expect(
        await db.select().from(guardians).where(eq(guardians.guardianUserId, r.conta.id)),
      ).toEqual([]);
    },
  );

  it.each([
    "login removido",
    "conta suspensa",
    "aparelho revogado",
    "pareado",
    "contexto infantil",
  ] as const)("revalida a autoridade na confirmação: %s", async (caso) => {
    const r = await responsavel();
    const entrada = await pedido(r.autor);
    if (caso === "login removido")
      await db.delete(sessions).where(eq(sessions.id, r.autor.login.authSessionId));
    if (caso === "conta suspensa")
      await db.update(users).set({ banned: true }).where(eq(users.id, r.conta.id));
    if (caso === "aparelho revogado")
      await db
        .update(devices)
        .set({ revokedAt: new Date() })
        .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    if (caso === "pareado")
      await db
        .update(devices)
        .set({ kind: "paired_device" })
        .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    if (caso === "contexto infantil") {
      const [infantil] = await db
        .insert(profiles)
        .values({ kind: "minor", nickname: "Infantil" })
        .returning({ id: profiles.id });
      if (!infantil) throw new Error("Perfil ausente");
      await db
        .update(devices)
        .set({ activeProfileId: infantil.id })
        .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    }
    await expect(cadastrarPerfilMenor(r.autor, entrada)).rejects.toMatchObject({ code: "AUTH" });
    await expect(
      criarPerfilProprio(r.autor, { apelido: "Adulto indevido", avatar: "padrao" }),
    ).rejects.toMatchObject({ code: "AUTH" });
    expect(
      await db.select().from(guardians).where(eq(guardians.guardianUserId, r.conta.id)),
    ).toEqual([]);
  });

  it("as FKs vinculam menor, responsável e declaração da mesma conta", async () => {
    const a = await responsavel();
    const b = await responsavel();
    const criado = await cadastrarPerfilMenor(a.autor, await pedido(a.autor));
    const [declaracao] = await db
      .select()
      .from(declarations)
      .where(eq(declarations.userId, a.conta.id));
    if (!declaracao) throw new Error("Declaração ausente");
    const adulto = await criarPerfilProprio(b.autor, { apelido: "Adulto", avatar: "padrao" });
    expect(
      await codigoDoBanco(
        db.insert(minors).values({ profileId: adulto.perfil.id, birthYear: 2018, birthMonth: 1 }),
      ),
    ).toBe("23503");
    await db.delete(guardians).where(eq(guardians.profileId, criado.perfil.id));
    expect(
      await codigoDoBanco(
        db.insert(guardians).values({
          profileId: criado.perfil.id,
          guardianUserId: b.conta.id,
          declarationId: declaracao.id,
        }),
      ),
    ).toBe("23503");
    await db.insert(guardians).values({
      profileId: criado.perfil.id,
      guardianUserId: a.conta.id,
      declarationId: declaracao.id,
    });
    expect(RESTRICAO).toContain(
      await codigoDoBanco(db.delete(users).where(eq(users.id, a.conta.id))),
    );
    expect(
      await db.select().from(guardians).where(eq(guardians.profileId, criado.perfil.id)),
    ).toHaveLength(1);
  });

  it("auditoria indisponível reverte grupo, perfil, nascimento, vínculo e consumo da intenção", async () => {
    const r = await responsavel();
    const entrada = await pedido(r.autor);
    await db.execute(
      sql`create function audit.recusar_menor_em_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.profile_created' and new.payload->>'kind'='minor' then raise exception 'auditoria indisponível'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_menor_em_teste before insert on audit.events for each row execute function audit.recusar_menor_em_teste()`,
    );
    try {
      await expect(cadastrarPerfilMenor(r.autor, entrada)).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(await db.select().from(groups).where(eq(groups.ownerUserId, r.conta.id))).toEqual([]);
      expect(
        await db.select().from(declarations).where(eq(declarations.userId, r.conta.id)),
      ).toEqual([]);
      expect(
        (await db.select().from(requests).where(eq(requests.id, entrada.intencaoId)))[0]
          ?.consumedAt,
      ).toBeNull();
    } finally {
      await db.execute(sql`drop trigger recusar_menor_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_menor_em_teste()`);
    }
    expect(await cadastrarPerfilMenor(r.autor, entrada)).toMatchObject({ criado: true });
  });

  it("login que envelhece esperando o mutex não confirma o cadastro", async () => {
    const r = await responsavel();
    const entrada = await pedido(r.autor);
    const pronto = sinal<number>();
    const liberar = sinal<void>();
    const trava = db.transaction(async (tx) => {
      await tx.execute(sql`set local transaction_timeout='15s'`);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`recreio:cadastro-perfil:conta:${r.conta.id}`}, 0))`,
      );
      const [conexao] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      if (!conexao) throw new Error("Conexão ausente");
      pronto.concluir(conexao.pid);
      await liberar.promessa;
    });
    void trava.catch(pronto.recusar);
    const pid = await pronto.promessa;
    const criadoEm = new Date(Date.now() - 10 * 60_000 + 600);
    const resultado = cadastrarPerfilMenor(
      { ...r.autor, login: { ...r.autor.login, criadoEm } },
      entrada,
    ).then(
      (valor) => ({ ok: true, valor }),
      (erro: unknown) => ({ ok: false, erro }),
    );
    try {
      await expect
        .poll(
          async () =>
            (
              await db.execute<{ esperando: boolean }>(
                sql`select exists(select 1 from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))) as esperando`,
              )
            )[0]?.esperando,
          { interval: 20 },
        )
        .toBe(true);
      await expect
        .poll(() => Date.now() - criadoEm.getTime() >= 10 * 60_000, { interval: 20 })
        .toBe(true);
      liberar.concluir(undefined);
      await trava;
      expect(await resultado).toMatchObject({ ok: false, erro: { code: "LOGIN_RECENTE" } });
      expect(
        await db.select().from(guardians).where(eq(guardians.guardianUserId, r.conta.id)),
      ).toEqual([]);
    } finally {
      liberar.concluir(undefined);
      await trava;
      await resultado;
    }
  });
});
