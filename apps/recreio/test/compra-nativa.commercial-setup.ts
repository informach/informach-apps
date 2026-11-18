import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  customers,
  recreioGroups as groups,
  recreioProfiles as profiles,
  recreioPurchaseAuthorizations as purchases,
  sessions,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { iniciarTentativaDeCompraLocked } from "@/features/cobranca/repository";
import {
  consultarMinhaCompra,
  encerrarCompraNaoEnviada,
  prepararMinhaCompra,
} from "@/features/cobranca/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { atualizarCobertura, consultarMeuGrupo } from "@/features/grupo/service";
import {
  aprovarPareamento,
  consultarPareamento,
  definirPinDaConta,
  definirPinDoMenor,
  prepararPareamento,
  trocarPerfilComPin,
} from "@/features/protecao/service";
import { autorizarExperimento, consultarMeuTeste } from "@/features/teste/service";
import { eventosCom } from "./apoio";
import { pedidoDaCompra } from "./compra-apoio";
import { pedidoDaCompraDoGrupo } from "./compra-grupo-apoio";
import { ingressoDe } from "./jogo-apoio";
import { adultoDoTeste, pedidoDeTeste } from "./teste-apoio";

describe("aceite financeiro nativo sem jogador ou Stripe", () => {
  it("Individual exige escolha explícita e replay conserva a seleção aceita", async () => {
    const p = await adultoDoTeste(true),
      intencao = await prepararPerfilMenor(p.autor);
    const { perfil } = await cadastrarPerfilMenor(p.autor, {
      intencaoId: intencao.id,
      perfil: { apelido: "Escolhido", avatar: "padrao" },
      nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
      assumoResponsabilidade: true,
      versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
    });
    const pedido = await pedidoDaCompraDoGrupo(p.autor);
    await expect(prepararMinhaCompra(p.autor, pedido)).rejects.toMatchObject({
      code: "LIMITE_DE_PERFIS",
    });
    expect(await db.select().from(purchases).where(eq(purchases.payerUserId, p.conta.id))).toEqual(
      [],
    );
    const escolhido = {
      ...pedido,
      perfis: pedido.perfis.map((a) => ({ ...a, cobrir: a.perfilId === perfil.id })),
    };
    const recibo = await prepararMinhaCompra(p.autor, escolhido);
    expect(recibo.perfis.filter((a) => a.cobrir).map((a) => a.perfilId)).toEqual([perfil.id]);
    expect(await prepararMinhaCompra(p.autor, escolhido)).toEqual(recibo);
    await expect(
      prepararMinhaCompra(p.autor, {
        ...escolhido,
        perfis: escolhido.perfis.map((a) => ({ ...a, cobrir: !a.cobrir })),
      }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
  });
  it("alteração nativa da cobertura depois do aceite impede a primeira tentativa", async () => {
    const p = await adultoDoTeste(true),
      pedido = await pedidoDaCompraDoGrupo(p.autor);
    const recibo = await prepararMinhaCompra(p.autor, pedido),
      grupo = await consultarMeuGrupo(p.autor);
    if (!grupo) throw new Error("Native group absent");
    await atualizarCobertura(p.autor, {
      grupoId: grupo.grupoId,
      perfis: grupo.perfis.map((a) => ({ perfilId: a.perfilId, versao: a.versao, cobrir: false })),
    });
    await expect(
      comCicloDeCobranca(p.conta.id, () => iniciarTentativaDeCompraLocked(p.autor, recibo.id)),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    expect((await consultarMinhaCompra(p.autor))?.tentativaIniciadaEm).toBeNull();
    expect(await db.select().from(customers).where(eq(customers.subjectId, p.conta.id))).toEqual(
      [],
    );
  });
  it("prepara uma oferta sem criar jogador, customer, concessão ou teste", async () => {
    const p = await adultoDoTeste(),
      pedido = pedidoDaCompra();
    const recibo = await prepararMinhaCompra(p.autor, pedido);
    expect(recibo).toMatchObject({
      id: pedido.pedidoId,
      produtoId: pedido.produtoId,
      valorCentavos: pedido.valorCentavos,
      intervalo: pedido.intervalo,
      tentativaIniciadaEm: null,
      resolucao: null,
      resolvidoEm: null,
      emConferencia: false,
    });
    expect(await consultarMinhaCompra(p.autor)).toEqual(recibo);
    expect(await db.select().from(profiles).where(eq(profiles.userId, p.conta.id))).toEqual([]);
    expect(await db.select().from(customers).where(eq(customers.subjectId, p.conta.id))).toEqual(
      [],
    );
    expect((await consultarMeuTeste(p.autor)).teste).toBeNull();
  });
  it("replay e concorrência conservam um aceite e um evento; outra oferta não substitui a atual", async () => {
    const p = await adultoDoTeste(),
      pedido = pedidoDaCompra();
    const [a, b] = await Promise.all([
      prepararMinhaCompra(p.autor, pedido),
      prepararMinhaCompra(p.autor, pedido),
    ]);
    expect(a).toEqual(b);
    expect(await prepararMinhaCompra(p.autor, pedidoDaCompra())).toEqual(a);
    await expect(
      prepararMinhaCompra(p.autor, pedidoDaCompra("recreio_family_monthly")),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    expect((await eventosCom("authorizationId", a.id)).map((e) => e.eventType)).toEqual([
      "recreio.purchase_authorization_recorded",
    ]);
  });
  it("preço adulterado não cria sequer o grupo", async () => {
    const p = await adultoDoTeste();
    await expect(
      prepararMinhaCompra(p.autor, { ...pedidoDaCompra(), valorCentavos: 1 }),
    ).rejects.toMatchObject({ code: "OFERTA" });
    expect(await db.select().from(groups).where(eq(groups.ownerUserId, p.conta.id))).toEqual([]);
  });
  it("UUID de outra conta não dá leitura, encerramento ou substituição", async () => {
    const a = await adultoDoTeste(),
      b = await adultoDoTeste(),
      pedido = pedidoDaCompra();
    const recibo = await prepararMinhaCompra(a.autor, pedido);
    expect(await consultarMinhaCompra(b.autor)).toBeNull();
    await expect(encerrarCompraNaoEnviada(b.autor, recibo.id)).rejects.toMatchObject({
      code: "COBRANCA",
    });
    await expect(prepararMinhaCompra(b.autor, pedido)).rejects.toMatchObject({ code: "CONFLITO" });
    expect(await consultarMinhaCompra(a.autor)).toEqual(recibo);
  });
  it("login antigo recusa aceite mas permite encerrar pedido nunca enviado", async () => {
    const p = await adultoDoTeste(),
      recibo = await prepararMinhaCompra(p.autor, pedidoDaCompra());
    const criadoEm = new Date(Date.now() - 11 * 60_000);
    await db
      .update(sessions)
      .set({ createdAt: criadoEm })
      .where(eq(sessions.id, p.autor.login.authSessionId));
    p.autor.login.criadoEm = criadoEm;
    await expect(prepararMinhaCompra(p.autor, pedidoDaCompra())).rejects.toMatchObject({
      code: "LOGIN_RECENTE",
    });
    const encerrado = await encerrarCompraNaoEnviada(p.autor, recibo.id);
    expect(encerrado.resolucao).toBe("not_started");
    expect(await encerrarCompraNaoEnviada(p.autor, recibo.id)).toEqual(encerrado);
  });
  it("encerrar não reabre recibo; um novo pedido exige novo aceite", async () => {
    const p = await adultoDoTeste(),
      pedido = pedidoDaCompra();
    const recibo = await prepararMinhaCompra(p.autor, pedido);
    const encerrado = await encerrarCompraNaoEnviada(p.autor, recibo.id);
    expect(await prepararMinhaCompra(p.autor, pedido)).toEqual(encerrado);
    const novo = await prepararMinhaCompra(p.autor, pedidoDaCompra());
    expect(novo.id).not.toBe(recibo.id);
    expect(novo.resolvidoEm).toBeNull();
  });
  it("autoridade nativa encerrada não lê recibo nem inicia tentativa", async () => {
    const p = await adultoDoTeste(),
      recibo = await prepararMinhaCompra(p.autor, pedidoDaCompra());
    await db.delete(sessions).where(eq(sessions.id, p.autor.login.authSessionId));
    await expect(consultarMinhaCompra(p.autor)).rejects.toMatchObject({ code: "AUTH" });
    await expect(
      comCicloDeCobranca(p.conta.id, () => iniciarTentativaDeCompraLocked(p.autor, recibo.id)),
    ).rejects.toMatchObject({ code: "AUTH" });
    expect(
      (await db.select().from(purchases).where(eq(purchases.id, recibo.id)))[0]?.requestStartedAt,
    ).toBeNull();
  });
  it("a marca anterior ao I/O é idempotente e não permite alegar que nada foi enviado", async () => {
    const p = await adultoDoTeste(),
      recibo = await prepararMinhaCompra(p.autor, pedidoDaCompra());
    const iniciar = () =>
      comCicloDeCobranca(p.conta.id, () => iniciarTentativaDeCompraLocked(p.autor, recibo.id));
    const tentativa = await iniciar();
    expect(tentativa.tentativaIniciadaEm).not.toBeNull();
    expect(await iniciar()).toEqual(tentativa);
    await expect(encerrarCompraNaoEnviada(p.autor, recibo.id)).rejects.toMatchObject({
      code: "COBRANCA",
    });
    expect(
      (await eventosCom("authorizationId", recibo.id)).filter(
        (e) => e.eventType === "recreio.purchase_attempt_started",
      ),
    ).toHaveLength(1);
  });
  it("aceite vencido antes do primeiro envio conserva pedido ainda não enviado", async () => {
    const p = await adultoDoTeste(),
      recibo = await prepararMinhaCompra(p.autor, pedidoDaCompra());
    await db
      .update(purchases)
      .set({ acceptedAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(purchases.id, recibo.id));
    await expect(
      comCicloDeCobranca(p.conta.id, () => iniciarTentativaDeCompraLocked(p.autor, recibo.id)),
    ).rejects.toMatchObject({ code: "OFERTA" });
    expect((await consultarMinhaCompra(p.autor))?.tentativaIniciadaEm).toBeNull();
    await expect(encerrarCompraNaoEnviada(p.autor, recibo.id)).resolves.toHaveProperty(
      "resolucao",
      "not_started",
    );
  });
  it("preparação ativa bloqueia primeiro teste sem customer; encerrar nunca enviado libera a elegibilidade original", async () => {
    const p = await adultoDoTeste(true);
    if (!p.jogador) throw new Error("Jogador ausente");
    await autorizarExperimento(p.autor, pedidoDeTeste());
    const compra = await prepararMinhaCompra(p.autor, await pedidoDaCompraDoGrupo(p.autor));
    await expect(ingressoDe(p.jogador)).rejects.toMatchObject({ codigo: "ACESSO_NEGADO" });
    expect((await consultarMeuTeste(p.autor)).teste).toBeNull();
    await encerrarCompraNaoEnviada(p.autor, compra.id);
    await expect(ingressoDe(p.jogador)).resolves.toEqual(expect.any(String));
    expect((await consultarMeuTeste(p.autor)).teste).toBeNull();
  });
  it.each(["compartilhado", "pareado"] as const)(
    "contexto infantil %s não autoriza, consulta ou encerra compra",
    async (tipo) => {
      const p = await adultoDoTeste(),
        recibo = await prepararMinhaCompra(p.autor, pedidoDaCompra());
      const intencao = await prepararPerfilMenor(p.autor);
      const { perfil } = await cadastrarPerfilMenor(p.autor, {
        intencaoId: intencao.id,
        perfil: { apelido: "Protegido", avatar: "padrao" },
        nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
        assumoResponsabilidade: true,
        versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
      });
      let dispositivo = p.autor.sessaoDeAparelhoId;
      if (tipo === "compartilhado") {
        await definirPinDaConta(p.autor, { pin: "593871" });
        await definirPinDoMenor(p.autor, { perfilId: perfil.id, pin: "396175" });
        await trocarPerfilComPin(p.autor, {
          destino: { tipo: "perfil", perfilId: perfil.id },
          pin: "396175",
        });
      } else {
        const pedido = await prepararPareamento("198.51.100.231");
        const pareado = await aprovarPareamento(p.autor, {
          perfilId: perfil.id,
          codigo: pedido.codigo,
        });
        await consultarPareamento(pedido.segredo);
        dispositivo = pareado.aparelhoId;
      }
      const indevido = { ...p.autor, sessaoDeAparelhoId: dispositivo };
      await expect(prepararMinhaCompra(indevido, pedidoDaCompra())).rejects.toMatchObject({
        code: "AUTH",
      });
      await expect(consultarMinhaCompra(indevido)).rejects.toMatchObject({ code: "AUTH" });
      await expect(encerrarCompraNaoEnviada(indevido, recibo.id)).rejects.toMatchObject({
        code: "AUTH",
      });
      expect(
        (await db.select().from(purchases).where(eq(purchases.id, recibo.id)))[0]?.resolvedAt,
      ).toBeNull();
    },
  );

  it("falha da auditoria desfaz aceite e grupo antes de qualquer I/O", async () => {
    const p = await adultoDoTeste();
    await db.execute(sql`create function audit.recusar_aceite_compra() returns trigger language plpgsql as $$
      begin if new.event_type='recreio.purchase_authorization_recorded' then raise exception 'fixture audit failure'; end if; return new; end $$`);
    await db.execute(
      sql`create trigger recusar_aceite_compra before insert on audit.events for each row execute function audit.recusar_aceite_compra()`,
    );
    try {
      await expect(prepararMinhaCompra(p.autor, pedidoDaCompra())).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(await db.select().from(groups).where(eq(groups.ownerUserId, p.conta.id))).toEqual([]);
      expect(
        await db.select().from(purchases).where(eq(purchases.payerUserId, p.conta.id)),
      ).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger recusar_aceite_compra on audit.events`);
      await db.execute(sql`drop function audit.recusar_aceite_compra()`);
    }
  });
});
