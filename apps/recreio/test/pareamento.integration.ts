import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioPairedCredentials as credentials,
  recreioDeviceSessions as devices,
  recreioNativePins as pins,
  recreioProfileCreationRequests as profileRequests,
  recreioProfiles as profiles,
  recreioMinorProtection as protection,
  recreioPairingRequests as requests,
  sessions,
  users,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import {
  apagarIntencoesAntigas,
  LOTE_DE_INTENCOES_ANTIGAS,
} from "@/features/manutencao/repository";
import { aprovarPedidoDePareamento } from "@/features/protecao/repository";
import { hashDoSegredo } from "@/features/protecao/segredos";
import {
  aprovarPareamento,
  conferirCredencialPareada,
  consultarPareamento,
  definirPinDaConta,
  definirPinDoMenor,
  desconectarTodosDoMenor,
  prepararPareamento,
} from "@/features/protecao/service";
import { resolverAtor } from "@/features/sessao/service";
import { eventosCom, loginReal, novaConta } from "./apoio";

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
  return { conta, autor, perfil };
}
let ip = 1;
function preparar() {
  return prepararPareamento(`192.0.2.${ip++}`);
}

describe("pareamento e proteção do menor", () => {
  it("código público não é segredo de consulta; banco não guarda os dois em texto", async () => {
    const pedido = await preparar();
    expect(await consultarPareamento(pedido.segredo)).toMatchObject({ estado: "aguardando" });
    await expect(consultarPareamento(pedido.codigo)).rejects.toThrow();
    const dados = JSON.stringify(await db.select().from(requests));
    expect(dados).not.toContain(pedido.segredo);
    expect(dados).not.toContain(pedido.codigo);
    await expect(prepararPareamento(null)).rejects.toMatchObject({ code: "PAREAMENTO" });
  });

  it("adulto sem jogador aprova só o próprio vínculo e a repetição não cria aparelhos", async () => {
    const a = await familia();
    const b = await familia();
    const pedido = await preparar();
    await expect(
      aprovarPareamento(b.autor, { perfilId: a.perfil.id, codigo: pedido.codigo }),
    ).rejects.toMatchObject({ code: "PERFIL" });
    const respostas = await Promise.all(
      Array.from({ length: 5 }, () =>
        aprovarPareamento(a.autor, { perfilId: a.perfil.id, codigo: pedido.codigo }),
      ),
    );
    expect(new Set(respostas.map((r) => r.aparelhoId)).size).toBe(1);
    expect(
      await db.select().from(credentials).where(eq(credentials.profileId, a.perfil.id)),
    ).toHaveLength(1);
    const aparelhoId = respostas[0]?.aparelhoId;
    if (!aparelhoId) throw new Error("Aparelho ausente");
    const [aparelho] = await db.select().from(devices).where(eq(devices.id, aparelhoId));
    expect(aparelho).toMatchObject({
      kind: "paired_device",
      userId: null,
      authSessionId: null,
      activeProfileId: a.perfil.id,
    });
    const registro = await consultarPareamento(pedido.segredo);
    if (registro.estado !== "pareado") throw new Error("Pareamento ausente");
    expect(await consultarPareamento(pedido.segredo)).toMatchObject({
      credencial: registro.credencial,
      expiraEm: registro.expiraEm,
    });
    expect(await conferirCredencialPareada(registro.credencial)).toMatchObject({
      perfil: { id: a.perfil.id },
    });
    expect(await conferirCredencialPareada(`${aparelhoId}.${pedido.segredo}`)).toBeNull();
    const eventos = await eventosCom("deviceSessionId", aparelhoId);
    expect(eventos).toHaveLength(1);
    for (const secreto of [
      pedido.segredo,
      pedido.codigo,
      registro.credencial,
      "tokenHash",
      "pollHash",
      a.conta.email,
    ])
      expect(JSON.stringify(eventos)).not.toContain(secreto);
  });

  it("código aceito não troca para outro perfil, mesmo do próprio responsável", async () => {
    const r = await familia();
    const intencao = await prepararPerfilMenor(r.autor);
    const outro = await cadastrarPerfilMenor(r.autor, {
      intencaoId: intencao.id,
      perfil: { apelido: "Outro protegido", avatar: "padrao" },
      nascimento: { ano: new Date().getUTCFullYear() - 10, mes: 1 },
      assumoResponsabilidade: true,
      versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
    });
    const pedido = await preparar();
    await aprovarPareamento(r.autor, { perfilId: r.perfil.id, codigo: pedido.codigo });
    await expect(
      aprovarPareamento(r.autor, { perfilId: outro.perfil.id, codigo: pedido.codigo }),
    ).rejects.toMatchObject({ code: "PAREAMENTO" });
  });

  it("intenção vencida não aprova nem recupera a credencial", async () => {
    const r = await familia();
    const pedido = await preparar();
    await db
      .update(requests)
      .set({ createdAt: new Date(Date.now() - 600_000), expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(requests.codeHash, hashDoSegredo("codigo", pedido.codigo)));
    await expect(
      aprovarPareamento(r.autor, { perfilId: r.perfil.id, codigo: pedido.codigo }),
    ).rejects.toMatchObject({ code: "PAREAMENTO" });
    await expect(consultarPareamento(pedido.segredo)).rejects.toMatchObject({ code: "PAREAMENTO" });
    expect(
      await db.select().from(credentials).where(eq(credentials.profileId, r.perfil.id)),
    ).toEqual([]);
  });

  it("login removido, contexto infantil e banimento não aprovam ou configuram PIN", async () => {
    const r = await familia();
    const pedido = await preparar();
    await db
      .update(devices)
      .set({ activeProfileId: r.perfil.id })
      .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    await expect(
      aprovarPareamento(r.autor, { perfilId: r.perfil.id, codigo: pedido.codigo }),
    ).rejects.toMatchObject({ code: "AUTH" });
    await expect(definirPinDaConta(r.autor, { pin: "519483" })).rejects.toMatchObject({
      code: "AUTH",
    });
    await db
      .update(devices)
      .set({ activeProfileId: null })
      .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    await db.update(users).set({ banned: true }).where(eq(users.id, r.conta.id));
    await expect(
      aprovarPareamento(r.autor, { perfilId: r.perfil.id, codigo: pedido.codigo }),
    ).rejects.toMatchObject({ code: "AUTH" });
    await db.update(users).set({ banned: false }).where(eq(users.id, r.conta.id));
    await db.delete(sessions).where(eq(sessions.id, r.autor.login.authSessionId));
    await expect(
      aprovarPareamento(r.autor, { perfilId: r.perfil.id, codigo: pedido.codigo }),
    ).rejects.toMatchObject({ code: "AUTH" });
  });

  it("revogar geração encerra o aparelho e limpar revoked_at não reanima a credencial", async () => {
    const r = await familia();
    const pedido = await preparar();
    const { aparelhoId } = await aprovarPareamento(r.autor, {
      perfilId: r.perfil.id,
      codigo: pedido.codigo,
    });
    const registro = await consultarPareamento(pedido.segredo);
    if (registro.estado !== "pareado") throw new Error("Pareamento ausente");
    const { generation } = await desconectarTodosDoMenor(r.autor, r.perfil.id);
    expect(await conferirCredencialPareada(registro.credencial)).toBeNull();
    await db.update(devices).set({ revokedAt: null }).where(eq(devices.id, aparelhoId));
    expect(await conferirCredencialPareada(registro.credencial)).toBeNull();
    await expect(consultarPareamento(pedido.segredo)).rejects.toMatchObject({ code: "PAREAMENTO" });
    const [atual] = await db.select().from(protection).where(eq(protection.profileId, r.perfil.id));
    expect(atual?.accessGeneration).toBe(generation);
  });

  it("PIN e geração de acesso são distintos; não permite modificar PIN alheio", async () => {
    const a = await familia();
    const b = await familia();
    await definirPinDaConta(a.autor, { pin: "519483" });
    const [nativo] = await db.select().from(pins).where(eq(pins.userId, a.conta.id));
    expect(nativo?.hash).toMatch(/^scrypt-v1\$/);
    await expect(
      definirPinDoMenor(b.autor, { perfilId: a.perfil.id, pin: "396175" }),
    ).rejects.toMatchObject({ code: "PERFIL" });
    await definirPinDoMenor(a.autor, { perfilId: a.perfil.id, pin: "396175" });
    const [antes] = await db.select().from(protection).where(eq(protection.profileId, a.perfil.id));
    await definirPinDoMenor(a.autor, { perfilId: a.perfil.id, pin: "396176" });
    const [depois] = await db
      .select()
      .from(protection)
      .where(eq(protection.profileId, a.perfil.id));
    expect(depois?.accessGeneration).toBe(antes?.accessGeneration);
    expect(depois?.pinGeneration).not.toBe(antes?.pinGeneration);
    const eventos = await eventosCom("profileId", a.perfil.id);
    for (const privado of ["396175", "396176", "519483", "scrypt-v1$"])
      expect(JSON.stringify(eventos)).not.toContain(privado);
  });

  it("quota de aparelhos vale na transação sem ultrapassar dez", async () => {
    const r = await familia();
    // Aqui a concorrência do repository prova a quota de armazenamento; os limites HTTP continuam ativos nos outros casos.
    const pedidos = await Promise.all(Array.from({ length: 11 }, preparar));
    const resultados = await Promise.allSettled(
      pedidos.map((p) => aprovarPedidoDePareamento(r.autor, r.perfil.id, p.codigo)),
    );
    expect(resultados.filter((v) => v.status === "fulfilled")).toHaveLength(10);
    expect(resultados.filter((v) => v.status === "rejected")).toMatchObject([
      { reason: { code: "LIMITE_DE_APARELHOS" } },
    ]);
    expect(
      await db.select().from(credentials).where(eq(credentials.profileId, r.perfil.id)),
    ).toHaveLength(10);
  });

  it("suspensão do perfil e banimento atual do responsável impedem usar o aparelho", async () => {
    const r = await familia();
    const pedido = await preparar();
    await aprovarPareamento(r.autor, { perfilId: r.perfil.id, codigo: pedido.codigo });
    const registro = await consultarPareamento(pedido.segredo);
    if (registro.estado !== "pareado") throw new Error("Pareamento ausente");
    await db.update(profiles).set({ status: "suspended" }).where(eq(profiles.id, r.perfil.id));
    expect(await conferirCredencialPareada(registro.credencial)).toBeNull();
    await db.update(profiles).set({ status: "active" }).where(eq(profiles.id, r.perfil.id));
    await db.update(users).set({ banned: true }).where(eq(users.id, r.conta.id));
    expect(await conferirCredencialPareada(registro.credencial)).toBeNull();
  });

  it("auditoria indisponível não deixa aparelho ou aprovação pela metade", async () => {
    const r = await familia();
    const pedido = await preparar();
    await db.execute(
      sql`create function audit.recusar_pareamento_em_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.device_paired' then raise exception 'auditoria indisponível'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_pareamento_em_teste before insert on audit.events for each row execute function audit.recusar_pareamento_em_teste()`,
    );
    try {
      await expect(
        aprovarPareamento(r.autor, { perfilId: r.perfil.id, codigo: pedido.codigo }),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(
        await db.select().from(credentials).where(eq(credentials.profileId, r.perfil.id)),
      ).toEqual([]);
      expect(await consultarPareamento(pedido.segredo)).toMatchObject({ estado: "aguardando" });
    } finally {
      await db.execute(sql`drop trigger recusar_pareamento_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_pareamento_em_teste()`);
    }
    await aprovarPareamento(r.autor, { perfilId: r.perfil.id, codigo: pedido.codigo });
    expect(await consultarPareamento(pedido.segredo)).toMatchObject({ estado: "pareado" });
  });

  it("limpeza global remove recibos vencidos em lotes e conserva perfis e recibos atuais", async () => {
    await db.execute(
      sql`delete from recreio.profile_creation_requests where (consumed_at is null and expires_at <= now()) or consumed_at <= now()-interval '1 day'`,
    );
    const r = await familia();
    const [recibo] = await db
      .select()
      .from(profileRequests)
      .where(eq(profileRequests.profileId, r.perfil.id));
    if (!recibo) throw new Error("Recibo ausente");
    await db.insert(profileRequests).values(
      Array.from({ length: LOTE_DE_INTENCOES_ANTIGAS + 1 }, () => ({
        userId: r.conta.id,
        createdAt: new Date(Date.now() - 600_000),
        expiresAt: new Date(Date.now() - 300_000),
      })),
    );
    await db.insert(profileRequests).values({
      userId: r.conta.id,
      createdAt: new Date(Date.now() - 3 * 86_400_000),
      expiresAt: new Date(Date.now() - 3 * 86_400_000 + 300_000),
      consumedAt: new Date(Date.now() - 2 * 86_400_000),
      fingerprint: "a".repeat(64),
    });
    const primeira = await apagarIntencoesAntigas();
    expect(primeira).toMatchObject({
      cadastrosPendentesApagados: 500,
      recibosDeCadastroApagados: 1,
    });
    expect(await apagarIntencoesAntigas()).toMatchObject({
      cadastrosPendentesApagados: 1,
      recibosDeCadastroApagados: 0,
    });
    expect(await apagarIntencoesAntigas()).toMatchObject({
      cadastrosPendentesApagados: 0,
      recibosDeCadastroApagados: 0,
    });
    expect(await db.select().from(profiles).where(eq(profiles.id, r.perfil.id))).toHaveLength(1);
    expect(
      await db.select().from(profileRequests).where(eq(profileRequests.id, recibo.id)),
    ).toHaveLength(1);
  });

  it("expirar pareamento fecha somente aparelho que nunca confirmou o segredo", async () => {
    await db.execute(sql`delete from recreio.pairing_requests where expires_at <= now()`);
    const r = await familia();
    const confirmado = await preparar();
    const naoConfirmado = await preparar();
    const a = await aprovarPareamento(r.autor, {
      perfilId: r.perfil.id,
      codigo: confirmado.codigo,
    });
    const b = await aprovarPareamento(r.autor, {
      perfilId: r.perfil.id,
      codigo: naoConfirmado.codigo,
    });
    const registro = await consultarPareamento(confirmado.segredo);
    if (registro.estado !== "pareado") throw new Error("Pareamento ausente");
    for (const [pedido, claimedAt] of [
      [confirmado, new Date(Date.now() - 480_000)],
      [naoConfirmado, null],
    ] as const) {
      await db
        .update(requests)
        .set({
          createdAt: new Date(Date.now() - 600_000),
          approvedAt: new Date(Date.now() - 540_000),
          claimedAt,
          expiresAt: new Date(Date.now() - 300_000),
        })
        .where(eq(requests.codeHash, hashDoSegredo("codigo", pedido.codigo)));
    }
    expect(await apagarIntencoesAntigas()).toMatchObject({
      pareamentosApagados: 2,
      aparelhosNaoConfirmadosEncerrados: 1,
    });
    expect(await conferirCredencialPareada(registro.credencial)).toMatchObject({
      sessaoDeAparelhoId: a.aparelhoId,
    });
    expect(
      (await db.select().from(devices).where(eq(devices.id, b.aparelhoId)))[0]?.revokedAt,
    ).toBeInstanceOf(Date);
    expect(await apagarIntencoesAntigas()).toMatchObject({
      pareamentosApagados: 0,
      aparelhosNaoConfirmadosEncerrados: 0,
    });
  });
});
