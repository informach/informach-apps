import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioNativePins as pins,
  recreioProfiles as profiles,
  sessions,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { listarAparelhos } from "@/features/aparelhos/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { criarPerfilProprio, selecionarPerfil } from "@/features/perfis/service";
import {
  definirPinDaConta,
  definirPinDoMenor,
  escolhasDoAparelho,
  trocarPerfilComPin,
} from "@/features/protecao/service";
import { resolverAtor } from "@/features/sessao/service";
import { sairDaSessao } from "@/features/sessao-de-jogo/service";
import { conceder } from "../scripts/concessoes";
import { eventosCom, loginReal, novaConta, sinal } from "./apoio";
import { entrarNoJogo } from "./jogo-apoio";

async function familia() {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Login ausente");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const intencao = await prepararPerfilMenor(autor);
  const { perfil } = await cadastrarPerfilMenor(autor, {
    intencaoId: intencao.id,
    perfil: { apelido: "Protegido", avatar: "padrao" },
    nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
    assumoResponsabilidade: true,
    versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
  });
  await definirPinDaConta(autor, { pin: "593871" });
  await definirPinDoMenor(autor, { perfilId: perfil.id, pin: "396175" });
  return { conta, login, autor, perfil };
}
const gestao = { tipo: "gestao" };

describe("PIN e contexto do aparelho compartilhado", () => {
  it("escolhas mostram só destinos vinculados e não expõem identidade ou segredos na área restrita", async () => {
    const r = await familia();
    const outro = await familia();
    expect(await escolhasDoAparelho(r.autor)).toEqual({
      restrito: false,
      atualId: null,
      pinDaContaDefinido: true,
      adulto: null,
      menores: [{ id: r.perfil.id, apelido: r.perfil.apelido, avatar: r.perfil.avatar }],
    });
    await trocarPerfilComPin(r.autor, {
      destino: { tipo: "perfil", perfilId: r.perfil.id },
      pin: "396175",
    });
    const restrito = await escolhasDoAparelho(r.autor);
    expect(restrito).toMatchObject({ restrito: true, atualId: r.perfil.id });
    for (const segredo of [
      r.conta.email,
      r.conta.id,
      "scrypt-v1$",
      "593871",
      "396175",
      "birthYear",
      "birthMonth",
      outro.perfil.id,
    ])
      expect(JSON.stringify(restrito)).not.toContain(segredo);
    await expect(
      escolhasDoAparelho({
        contaId: outro.conta.id,
        sessaoDeAparelhoId: r.autor.sessaoDeAparelhoId,
      }),
    ).rejects.toMatchObject({ code: "AUTH" });
  });
  it("não troca de perfil durante a partida; só depois da saída confirmada", async () => {
    const r = await familia();
    const adulto = await criarPerfilProprio(r.autor, { apelido: "Responsável", avatar: "padrao" });
    await selecionarPerfil(r.autor, adulto.perfil.id);
    await conceder({ email: r.conta.email, tier: "family", dias: 30, motivo: "teste" });
    const sessao = await entrarNoJogo({
      conta: r.conta,
      login: r.login,
      perfil: adulto.perfil,
      ator: { ...r.autor, perfil: adulto.perfil },
    });
    const pedido = { destino: { tipo: "perfil", perfilId: r.perfil.id }, pin: "396175" };
    await expect(trocarPerfilComPin(r.autor, pedido)).rejects.toMatchObject({
      code: "JOGO_ABERTO",
    });
    expect(
      (await db.select().from(devices).where(eq(devices.id, r.autor.sessaoDeAparelhoId)))[0],
    ).toMatchObject({ activeProfileId: adulto.perfil.id, minorContextGeneration: null });
    await sairDaSessao(sessao.token);
    expect(await trocarPerfilComPin(r.autor, pedido)).toMatchObject({ tipo: "minor" });
  });

  it("falha de auditoria não confirma a troca ou a trava infantil pela metade", async () => {
    const r = await familia();
    await db.execute(
      sql`create function audit.recusar_troca_em_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.device_context_changed' then raise exception 'auditoria indisponível'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_troca_em_teste before insert on audit.events for each row execute function audit.recusar_troca_em_teste()`,
    );
    const pedido = { destino: { tipo: "perfil", perfilId: r.perfil.id }, pin: "396175" };
    try {
      await expect(trocarPerfilComPin(r.autor, pedido)).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(
        (await db.select().from(devices).where(eq(devices.id, r.autor.sessaoDeAparelhoId)))[0],
      ).toMatchObject({ activeProfileId: null, minorContextGeneration: null });
    } finally {
      await db.execute(sql`drop trigger recusar_troca_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_troca_em_teste()`);
    }
    expect(await trocarPerfilComPin(r.autor, pedido)).toMatchObject({ tipo: "minor" });
  });
  it("adulto sem jogador entra no menor e só o PIN nativo devolve a gestão", async () => {
    const r = await familia();
    expect(
      await trocarPerfilComPin(r.autor, {
        destino: { tipo: "perfil", perfilId: r.perfil.id },
        pin: "396175",
      }),
    ).toMatchObject({ tipo: "minor", perfil: { id: r.perfil.id } });
    const [restrito] = await db
      .select()
      .from(devices)
      .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    expect(restrito?.minorContextGeneration).toBeTypeOf("string");
    expect(await resolverAtor(r.login)).toBeNull();
    await expect(listarAparelhos(r.autor)).rejects.toMatchObject({ code: "AUTH" });
    await expect(
      trocarPerfilComPin(r.autor, { destino: gestao, pin: "396175" }),
    ).rejects.toMatchObject({ code: "PIN" });
    expect(
      (await db.select().from(devices).where(eq(devices.id, r.autor.sessaoDeAparelhoId)))[0]
        ?.minorContextGeneration,
    ).toBe(restrito?.minorContextGeneration);
    expect(await trocarPerfilComPin(r.autor, { destino: gestao, pin: "593871" })).toEqual({
      perfil: null,
      tipo: "management",
    });
    expect((await listarAparelhos(r.autor)).atual.id).toBe(r.autor.sessaoDeAparelhoId);
    expect((await resolverAtor(r.login))?.ator.perfil).toBeNull();
    const eventos = await eventosCom("deviceSessionId", r.autor.sessaoDeAparelhoId);
    expect(eventos.filter((e) => e.eventType === "recreio.device_context_changed")).toHaveLength(2);
    for (const segredo of ["396175", "593871", "scrypt-v1", r.conta.email])
      expect(JSON.stringify(eventos)).not.toContain(segredo);
  });

  it("seleção legada não escapa do menor; o PIN nativo escolhe somente o adulto da conta", async () => {
    const r = await familia();
    const outro = await familia();
    const proprio = await criarPerfilProprio(r.autor, { apelido: "Adulto", avatar: "padrao" });
    const alheio = await criarPerfilProprio(outro.autor, {
      apelido: "Outro adulto",
      avatar: "padrao",
    });
    await trocarPerfilComPin(r.autor, {
      destino: { tipo: "perfil", perfilId: r.perfil.id },
      pin: "396175",
    });
    await expect(selecionarPerfil(r.autor, proprio.perfil.id)).rejects.toMatchObject({
      code: "PERFIL",
    });
    await expect(
      trocarPerfilComPin(r.autor, {
        destino: { tipo: "perfil", perfilId: alheio.perfil.id },
        pin: "593871",
      }),
    ).rejects.toMatchObject({ code: "PERFIL" });
    await expect(
      trocarPerfilComPin(r.autor, {
        destino: { tipo: "perfil", perfilId: outro.perfil.id },
        pin: "396175",
      }),
    ).rejects.toMatchObject({ code: "PERFIL" });
    expect(
      await trocarPerfilComPin(r.autor, {
        destino: { tipo: "perfil", perfilId: proprio.perfil.id },
        pin: "593871",
      }),
    ).toMatchObject({ tipo: "adult", perfil: { id: proprio.perfil.id } });
    expect((await resolverAtor(r.login))?.ator.perfil?.id).toBe(proprio.perfil.id);
  });

  it("a exclusão do menor conserva a trava até o retorno explícito pelo PIN nativo", async () => {
    const r = await familia();
    await trocarPerfilComPin(r.autor, {
      destino: { tipo: "perfil", perfilId: r.perfil.id },
      pin: "396175",
    });
    await db.delete(profiles).where(eq(profiles.id, r.perfil.id));
    expect(await resolverAtor(r.login)).toBeNull();
    await expect(definirPinDaConta(r.autor, { pin: "111333" })).rejects.toMatchObject({
      code: "AUTH",
    });
    expect(await trocarPerfilComPin(r.autor, { destino: gestao, pin: "593871" })).toEqual({
      tipo: "management",
      perfil: null,
    });
    expect((await listarAparelhos(r.autor)).atual.id).toBe(r.autor.sessaoDeAparelhoId);
  });

  it("PIN errado não devolve a tentativa por rollback", async () => {
    const r = await familia();
    for (let n = 0; n < 5; n++)
      await expect(
        trocarPerfilComPin(r.autor, { destino: gestao, pin: "000000" }),
      ).rejects.toMatchObject({ code: "PIN" });
    await expect(
      trocarPerfilComPin(r.autor, { destino: gestao, pin: "593871" }),
    ).rejects.toMatchObject({ codigo: "MUITAS_TENTATIVAS" });
    const eventos = await eventosCom("deviceSessionId", r.autor.sessaoDeAparelhoId);
    expect(eventos.filter((e) => e.eventType === "recreio.device_context_changed")).toEqual([]);
  });

  it("validade que termina enquanto espera o PIN não desbloqueia o contexto", async () => {
    const r = await familia();
    await trocarPerfilComPin(r.autor, {
      destino: { tipo: "perfil", perfilId: r.perfil.id },
      pin: "396175",
    });
    const pronto = sinal<number>();
    const liberar = sinal<void>();
    const trava = db.transaction(async (tx) => {
      await tx.execute(sql`set local transaction_timeout='15s'`);
      await tx.select().from(pins).where(eq(pins.userId, r.conta.id)).for("update");
      const [conexao] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      if (!conexao) throw new Error("Conexão ausente");
      pronto.concluir(conexao.pid);
      await liberar.promessa;
    });
    void trava.catch(pronto.recusar);
    const pid = await pronto.promessa;
    const resultado = trocarPerfilComPin(r.autor, { destino: gestao, pin: "593871" }).then(
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
      await db
        .update(devices)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
      liberar.concluir(undefined);
      await trava;
      expect(await resultado).toMatchObject({ ok: false, erro: { code: "AUTH" } });
      expect(
        (await db.select().from(devices).where(eq(devices.id, r.autor.sessaoDeAparelhoId)))[0]
          ?.minorContextGeneration,
      ).not.toBeNull();
    } finally {
      liberar.concluir(undefined);
      await trava;
      await resultado;
    }
  });

  it("troca e alteração do PIN são serializadas; não aplica uma base antiga", async () => {
    const r = await familia();
    const resultados = await Promise.allSettled([
      trocarPerfilComPin(r.autor, {
        destino: { tipo: "perfil", perfilId: r.perfil.id },
        pin: "396175",
      }),
      definirPinDoMenor(r.autor, { perfilId: r.perfil.id, pin: "396176" }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const recusado = resultados.find((r) => r.status === "rejected");
    if (recusado?.status !== "rejected") throw new Error("Recusa ausente");
    expect(["AUTH", "PIN"]).toContain(recusado.reason.code);
  });
});
