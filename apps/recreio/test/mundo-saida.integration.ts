import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioEntitlements as entitlements,
  events,
  recreioGameSessions as games,
  recreioSpaceMembers as members,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { type MundoId, MundoIdSchema, SessaoDeJogoIdSchema } from "@informach/recreio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sairDoMundo } from "@/features/mundos/saida";
import { aceitarConvite, criarConvite, detalheDoMundo } from "@/features/mundos/service";
import { verificarEntradaNoMundo } from "@/features/posse/repository";
import { AppError } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { aposentarInstancias, codigoDoBanco, type Jogador, novoJogador, sinal } from "./apoio";
import { abrirPelaRota, entrarNoJogo, mundoDe, novaInstancia } from "./jogo-apoio";

const autorDe = (p: Jogador) => ({
  contaId: p.conta.id,
  perfilId: p.perfil.id,
  sessaoDeAparelhoId: p.ator.sessaoDeAparelhoId,
});
async function convidar(dono: Jogador, convidado: Jogador, mundoId: MundoId) {
  const convite = await criarConvite(
    { perfilId: dono.perfil.id, sessaoDeAparelhoId: dono.ator.sessaoDeAparelhoId, jogo: null },
    mundoId,
    {
      forma: "member",
    },
  );
  await aceitarConvite(
    { perfilId: convidado.perfil.id, sessaoDeAparelhoId: convidado.ator.sessaoDeAparelhoId },
    { codigo: convite.codigo },
  );
}
async function cenario() {
  const dono = await novoJogador();
  const convidado = await novoJogador();
  const mundoId = await mundoDe(dono);
  await convidar(dono, convidado, mundoId);
  return { dono, convidado, mundoId };
}
async function partida(p: Jogador, mundoId: MundoId | null) {
  const sid = SessaoDeJogoIdSchema.parse(randomUUID());
  await db.insert(games).values({
    id: sid,
    profileId: p.perfil.id,
    deviceSessionId: p.ator.sessaoDeAparelhoId,
    gameId: "morada",
    spaceId: mundoId,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return sid;
}
async function membro(p: Jogador, mundoId: MundoId) {
  const [linha] = await db
    .select()
    .from(members)
    .where(and(eq(members.profileId, p.perfil.id), eq(members.spaceId, mundoId)));
  if (!linha) throw new Error("Participação ausente");
  return linha;
}
async function sessao(sid: string) {
  const [linha] = await db.select().from(games).where(eq(games.id, sid));
  return linha;
}
function auditoria(p: Jogador, tipo = "recreio.space_member_left") {
  return db
    .select()
    .from(events)
    .where(and(eq(events.actorId, p.conta.id), eq(events.eventType, tipo)));
}
async function emExecucao() {
  await aposentarInstancias();
  const base = await cenario();
  const dono = await entrarNoJogo(base.dono);
  const instancia = await novaInstancia();
  expect((await abrirPelaRota(dono, base.mundoId)).status).toBe(200);
  const posse = await instancia.cliente.reivindicarPosse(base.mundoId);
  const sid = await partida(base.convidado, null);
  const pedido = {
    mundoId: base.mundoId,
    jogo: "morada",
    instanciaId: instancia.instanciaId,
    cerca: posse.cerca,
    perfilId: base.convidado.perfil.id,
    sid,
  };
  return { ...base, pedido, sid };
}

/** Barreira real: a fila da linha do mundo determina quem foi admitido primeiro. */
async function segurar(operacao: (tx: Transacao) => Promise<unknown>) {
  const pronto = sinal<number>();
  const fim = sinal<void>();
  const transacao = db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '10s'`);
    await operacao(tx);
    const [linha] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    if (!linha) throw new Error("Conexão ausente");
    pronto.concluir(linha.pid);
    await fim.promessa;
  });
  void transacao.catch(pronto.recusar);
  const pid = await pronto.promessa;
  return {
    pid,
    async liberar() {
      fim.concluir(undefined);
      await transacao;
    },
  };
}
const travarMundo = (mundoId: MundoId) =>
  segurar(async (tx) => {
    await tx.execute(sql`select id from recreio.spaces where id=${mundoId} for update`);
  });
async function temEspera(pid: number) {
  const [linha] = await db.execute<{ esperando: boolean }>(sql`
    select exists(select 1 from pg_stat_activity
    where ${pid} = any(pg_blocking_pids(pid))) as esperando`);
  return linha?.esperando === true;
}

// This disposable-database fixture releases its implicit transaction INSIDE
// PostgreSQL after a real wait/expiry. A Node polling delay must not hold the
// row past the application's one-second lock timeout and mask the AUTH check.
beforeAll(async () => {
  await db.execute(sql`create function recreio.segurar_saida_ate_vencer_fixture(
    tipo text, mundo uuid, partida uuid, aparelho uuid, etiqueta text
  ) returns boolean language plpgsql as $$
  declare iniciou timestamptz := clock_timestamp(); prazo timestamptz;
  begin
    if tipo='mundo' then
      perform id from recreio.spaces where id=mundo for update;
    elsif tipo='encerramentos' then
      perform pg_advisory_xact_lock(hashtextextended('recreio:game_sessions:encerramento',0));
    elsif tipo='partida' then
      perform id from recreio.game_sessions where id=partida for update;
    else raise exception 'Unknown expiry fixture gate'; end if;
    perform set_config('application_name',etiqueta,true);
    loop
      perform pg_stat_clear_snapshot();
      exit when exists(select 1 from pg_stat_activity a where a.datname=current_database()
        and pg_backend_pid()=any(pg_blocking_pids(a.pid)));
      if clock_timestamp()>iniciou+interval '10 seconds' then
        raise exception 'No actual waiter reached the expiry fixture';
      end if;
      perform pg_sleep(0.005);
    end loop;
    select expires_at into prazo from recreio.device_sessions where id=aparelho;
    if prazo is null then raise exception 'Expiry fixture device absent'; end if;
    perform pg_sleep_until(prazo+interval '1 millisecond');
    return clock_timestamp()>prazo;
  end $$`);
});
afterAll(async () => {
  await db.execute(
    sql`drop function recreio.segurar_saida_ate_vencer_fixture(text,uuid,uuid,uuid,text)`,
  );
});

describe("saída voluntária de um mundo", () => {
  it("encerra só a partida do convidado, conserva o mundo e o responsável e audita uma vez", async () => {
    const { dono, convidado, mundoId } = await cenario();
    const [antes] = await db.select().from(spaces).where(eq(spaces.id, mundoId));
    const participacao = await membro(convidado, mundoId);
    const sid = await partida(convidado, mundoId);
    const sidDoDono = await partida(dono, mundoId);
    const resultados = await Promise.all(
      Array.from({ length: 4 }, () => sairDoMundo(autorDe(convidado), mundoId)),
    );
    expect(resultados.filter((r) => r.saiu)).toHaveLength(1);
    expect(await membro(convidado, mundoId)).toMatchObject({
      id: participacao.id,
      state: "former",
      leftAt: expect.any(Date),
    });
    expect(await sessao(sid)).toMatchObject({
      endedAt: expect.any(Date),
      endedSeq: expect.any(Number),
      endReason: "left",
    });
    expect(await sessao(sidDoDono)).toMatchObject({ endedAt: null, endedSeq: null });
    expect((await db.select().from(spaces).where(eq(spaces.id, mundoId)))[0]).toEqual(antes);
    expect(await detalheDoMundo(convidado.perfil.id, mundoId)).toBeNull();
    expect((await detalheDoMundo(dono.perfil.id, mundoId))?.membros).toHaveLength(1);
    const registros = await auditoria(convidado);
    expect(registros).toHaveLength(1);
    expect(registros[0]?.payload).toEqual({
      app: "recreio",
      spaceId: mundoId,
      profileId: convidado.perfil.id,
      memberId: participacao.id,
    });
    expect(await auditoria(convidado, "recreio.game_session_ended")).toHaveLength(1);
  });

  it("permite sair sem cobertura comercial, inclusive como coadministrador", async () => {
    const { convidado, mundoId } = await cenario();
    const grupoId = convidado.perfil.grupoId;
    if (!grupoId) throw new Error("Grupo do perfil ausente");
    await db
      .update(entitlements)
      .set({ revokedAt: new Date() })
      .where(eq(entitlements.groupId, grupoId));
    await db
      .update(members)
      .set({ role: "coadmin", state: "no_access" })
      .where(and(eq(members.spaceId, mundoId), eq(members.profileId, convidado.perfil.id)));
    expect(await sairDoMundo(autorDe(convidado), mundoId)).toEqual({ saiu: true });
    expect((await membro(convidado, mundoId)).state).toBe("former");
  });

  it("não encerra a partida do mesmo perfil em outro mundo", async () => {
    const { convidado, mundoId } = await cenario();
    const outro = await mundoDe(convidado);
    const sid = await partida(convidado, outro);
    await sairDoMundo(autorDe(convidado), mundoId);
    expect(await sessao(sid)).toMatchObject({ spaceId: outro, endedAt: null });
  });

  it("recusa a saída do responsável sem mudar participação ou mundo", async () => {
    const { dono, mundoId } = await cenario();
    await expect(sairDoMundo(autorDe(dono), mundoId)).rejects.toMatchObject({
      code: "RESPONSAVEL",
    });
    expect(await membro(dono, mundoId)).toMatchObject({ role: "steward", state: "active" });
    expect(await auditoria(dono)).toEqual([]);
  });

  it("não distingue identificador inválido, mundo ausente e mundo alheio", async () => {
    const { mundoId } = await cenario();
    const pessoa = await novoJogador({ comAcesso: false });
    const recusas = [];
    for (const id of ["inválido", MundoIdSchema.parse(randomUUID()), mundoId]) {
      const erro = await sairDoMundo(autorDe(pessoa), id).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(AppError);
      if (!(erro instanceof AppError)) throw new Error("Recusa ausente");
      recusas.push({ code: erro.code, message: erro.message });
    }
    expect(recusas).toEqual(Array(3).fill({ code: "MUNDO", message: "Mundo indisponível." }));
  });

  it.each(["revogado", "vencido", "sem_perfil", "suspenso", "pareado", "outra_conta"])(
    "revalida autoridade: %s",
    async (caso) => {
      const { dono, convidado, mundoId } = await cenario();
      const autor = autorDe(convidado);
      if (caso === "outra_conta") autor.contaId = dono.conta.id;
      else if (caso === "suspenso")
        await db.execute(
          sql`update recreio.profiles set status='suspended' where id=${autor.perfilId}`,
        );
      else
        await db
          .update(devices)
          .set(
            caso === "revogado"
              ? { revokedAt: new Date() }
              : caso === "vencido"
                ? { expiresAt: new Date(Date.now() - 60_000) }
                : caso === "pareado"
                  ? { kind: "paired_device" }
                  : { activeProfileId: null },
          )
          .where(eq(devices.id, autor.sessaoDeAparelhoId));
      await expect(sairDoMundo(autor, mundoId)).rejects.toMatchObject({ code: "AUTH" });
      expect((await membro(convidado, mundoId)).state).toBe("active");
      expect(await auditoria(convidado)).toEqual([]);
    },
  );

  it("falha real de auditoria reverte saída e encerramento e permite repetir", async () => {
    const { convidado, mundoId } = await cenario();
    const sid = await partida(convidado, mundoId);
    await db.execute(sql`create function audit.recusar_saida_em_teste() returns trigger language plpgsql as $$
      begin if new.event_type='recreio.space_member_left' then raise exception 'indisponível (teste)'; end if; return new; end $$`);
    await db.execute(sql`create trigger recusar_saida_em_teste before insert on audit.events
      for each row execute function audit.recusar_saida_em_teste()`);
    try {
      await expect(sairDoMundo(autorDe(convidado), mundoId)).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(await membro(convidado, mundoId)).toMatchObject({ state: "active", leftAt: null });
      expect(await sessao(sid)).toMatchObject({ endedAt: null, endedSeq: null });
      expect(await auditoria(convidado, "recreio.game_session_ended")).toEqual([]);
      expect(await auditoria(convidado)).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger recusar_saida_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_saida_em_teste()`);
    }
    expect(await sairDoMundo(autorDe(convidado), mundoId)).toEqual({ saiu: true });
  });

  it("convite novo conserva a participação sem ressuscitar a sessão encerrada", async () => {
    const base = await emExecucao();
    await verificarEntradaNoMundo(base.pedido);
    const antes = await membro(base.convidado, base.mundoId);
    await sairDoMundo(autorDe(base.convidado), base.mundoId);
    await convidar(base.dono, base.convidado, base.mundoId);
    expect(await membro(base.convidado, base.mundoId)).toMatchObject({
      id: antes.id,
      state: "active",
      leftAt: null,
    });
    await expect(verificarEntradaNoMundo(base.pedido)).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
    });
    expect((await sessao(base.sid))?.endedAt).toBeInstanceOf(Date);
  });

  it.each(["entrada_primeiro", "saida_primeiro"])("serializa a corrida real: %s", async (ordem) => {
    const base = await emExecucao();
    const trava = await travarMundo(base.mundoId);
    const entrar = () => verificarEntradaNoMundo(base.pedido);
    const sair = () => sairDoMundo(autorDe(base.convidado), base.mundoId);
    // Guardar rejeições desde o início, inclusive se a observação falhar.
    const primeiro = (ordem === "entrada_primeiro" ? entrar() : sair()).then(
      (valor) => ({ ok: true, valor }),
      (erro: unknown) => ({ ok: false, erro }),
    );
    try {
      await expect.poll(() => temEspera(trava.pid), { interval: 20 }).toBe(true);
      const segundo = (ordem === "entrada_primeiro" ? sair() : entrar()).then(
        (valor) => ({ ok: true, valor }),
        (erro: unknown) => ({ ok: false, erro }),
      );
      await trava.liberar();
      const resultados = await Promise.all([primeiro, segundo]);
      expect(resultados[0]?.ok).toBe(true);
      if (ordem === "entrada_primeiro") {
        expect(resultados[1]?.ok).toBe(true);
        expect(await sessao(base.sid)).toMatchObject({
          endedAt: expect.any(Date),
          endReason: "left",
        });
      } else {
        expect(resultados[1]).toMatchObject({ ok: false, erro: { codigo: "NAO_MEMBRO" } });
        expect((await sessao(base.sid))?.spaceId).toBeNull();
      }
      expect((await membro(base.convidado, base.mundoId)).state).toBe("former");
    } finally {
      await trava.liberar();
      await primeiro;
    }
  });

  it("contenção tem limite, conserva autoridade e pode ser retomada", async () => {
    const { convidado, mundoId } = await cenario();
    const trava = await travarMundo(mundoId);
    try {
      expect(await codigoDoBanco(sairDoMundo(autorDe(convidado), mundoId))).toBe("55P03");
      expect((await membro(convidado, mundoId)).state).toBe("active");
    } finally {
      await trava.liberar();
    }
    expect(await sairDoMundo(autorDe(convidado), mundoId)).toEqual({ saiu: true });
  });

  it.each(["mundo", "encerramentos", "partida"])(
    "recusa a autoridade que vence enquanto espera %s",
    async (caso) => {
      const { convidado, mundoId } = await cenario();
      const sid = await partida(convidado, mundoId);
      const etiqueta = `expiry-fixture-${randomUUID()}`;
      // No explicit transaction: PostgreSQL commits/releases at statement end,
      // independently from when the Node event loop resumes this promise.
      const barreira = db
        .execute<{ venceu: boolean }>(sql`
        select recreio.segurar_saida_ate_vencer_fixture(${caso},${mundoId},${sid},${convidado.ator.sessaoDeAparelhoId},${etiqueta}) as venceu
      `)
        .then(
          (valor) => ({ ok: true as const, valor }),
          (erro: unknown) => ({ ok: false as const, erro }),
        );
      let resultado: Promise<unknown> | undefined;
      try {
        await expect
          .poll(
            async () => {
              const [linha] = await db.execute<{ pronta: boolean }>(sql`
          select exists(select 1 from pg_stat_activity where datname=current_database()
            and application_name=${etiqueta} and state='active') as pronta`);
              return linha?.pronta;
            },
            { interval: 20 },
          )
          .toBe(true);
        await db
          .update(devices)
          .set({ expiresAt: sql`clock_timestamp() + interval '800ms'` })
          .where(eq(devices.id, convidado.ator.sessaoDeAparelhoId));
        resultado = sairDoMundo(autorDe(convidado), mundoId).then(
          (valor) => ({ ok: true, valor }),
          (erro: unknown) => ({ ok: false, erro }),
        );
        const liberada = await barreira;
        expect(liberada.ok).toBe(true);
        if (!liberada.ok) throw liberada.erro;
        expect(liberada.valor[0]?.venceu).toBe(true);
        expect(await resultado).toMatchObject({ ok: false, erro: { code: "AUTH" } });
        expect((await membro(convidado, mundoId)).state).toBe("active");
        expect((await sessao(sid))?.endedAt).toBeNull();
        expect(await auditoria(convidado)).toEqual([]);
      } finally {
        await db.execute(sql`select pg_cancel_backend(pid) from pg_stat_activity
          where datname=current_database() and application_name=${etiqueta} and state='active'`);
        await barreira;
        await resultado;
      }
    },
  );
});
