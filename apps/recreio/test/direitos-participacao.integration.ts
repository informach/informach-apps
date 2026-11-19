import { randomBytes, randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGroups as groups,
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
  recreioProfiles as profiles,
  sessions,
  users,
} from "@informach/db/schema";
import { GrupoIdSchema } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
} from "@/features/account/autoridade-repository";
import { consultarMinhaParticipacaoNoRecreio } from "@/features/account/participacao-service";
import { prepararIdentidadeDoJogo } from "@/features/autoridade-de-jogo/aparelho-repository";
import { VERSAO_DA_COMPRA } from "@/features/cobranca/constantes";
import {
  encerrarCompraNaoEnviadaNoBanco,
  prepararCompraNoBanco,
} from "@/features/cobranca/repository";
import { consultarMinhaCobranca } from "@/features/cobranca/service";
import { capturarDadosPessoaisDaConta } from "@/features/direitos/captura-conta-repository";
import { criarAssinaturaDoLivro, resumoDoRegistro } from "@/features/direitos/livro/assinatura";
import { prepararPedidoDeDireitos } from "@/features/direitos/service";
import { prepararCadastroDeMenor } from "@/features/familia/repository";
import { admitirGrupoParaAceite } from "@/features/grupo/autoridade-repository";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import { travarGrupoDoTeste } from "@/features/grupo/teste-repository";
import { criarPerfilProprio } from "@/features/perfis/service";
import { trocarContextoComPin } from "@/features/protecao/troca-repository";
import { resolverAtor } from "@/features/sessao/service";
import { VERSAO_DO_TESTE } from "@/features/teste/constantes";
import { registrarConsentimentoNoBanco } from "@/features/teste/repository";
import { codigoDoBanco, loginReal, novaConta, sinal } from "./apoio";

async function adulto(comPerfil = false) {
  const conta = await novaConta(),
    login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Native fixture absent");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const perfil = comPerfil
    ? (await criarPerfilProprio(autor, { apelido: "Perfil barreira", avatar: "padrao" })).perfil
    : null;
  return { conta, autor, perfil };
}
type Adulto = Awaited<ReturnType<typeof adulto>>;

/** Fixture estrutural da origem da barreira. Não é consentimento público de
 * encerramento: a prévia v1 ainda não autoriza efeitos financeiros. */
async function operacaoEstrutural(
  f: Adulto,
  tipo: "encerrar_conta" | "retirar_perfil" = "encerrar_conta",
) {
  const previa = await prepararPedidoDeDireitos(f.autor, {
    pedidoId: randomUUID(),
    tipo,
    perfis: f.perfil ? [f.perfil.id] : [],
  });
  const assinatura = criarAssinaturaDoLivro({
    livroId: randomUUID(),
    chaveAtiva: "fixture",
    chaves: new Map([["fixture", randomBytes(32)]]),
  });
  try {
    const agora = new Date();
    const bytes = assinatura.assinarIntencao({
      formato: "recreio-intencao-direitos-v1",
      livroId: assinatura.livroId,
      operacaoId: previa.preparacaoId,
      revisao: 1,
      epoca: 0,
      tipo,
      contaId: f.conta.id,
      perfilIds: previa.plano.perfis.map((p) => p.id),
      planoSha256: previa.planoSha256,
      consentidaEm: agora.toISOString(),
      autenticadaEm: f.autor.login.criadoEm.toISOString(),
      fonte: "a".repeat(40),
    });
    await db.insert(operations).values({
      id: previa.preparacaoId,
      preparationId: previa.preparacaoId,
      requesterUserId: f.conta.id,
      planSha256: previa.planoSha256,
      kind: tipo,
      ledgerId: assinatura.livroId,
      ledgerEpoch: 0,
      signingKeyId: assinatura.chaveAtiva,
      source: "a".repeat(40),
      signedIntent: bytes,
      intentSha256: resumoDoRegistro(bytes),
      authenticatedAt: f.autor.login.criadoEm,
      consentedAt: agora,
      createdAt: agora,
      updatedAt: agora,
      nextAttemptAt: agora,
    });
    return { operacaoId: previa.preparacaoId, agora };
  } finally {
    assinatura.encerrar();
  }
}
async function fechar(f: Adulto, estado: "closing" | "closed" = "closing") {
  const op = await operacaoEstrutural(f);
  await db.insert(participations).values({
    userId: f.conta.id,
    state: estado,
    revision: estado === "closing" ? 2 : 3,
    operationId: op.operacaoId,
    closingAt: op.agora,
    closedAt: estado === "closed" ? op.agora : null,
    updatedAt: op.agora,
  });
  return op;
}

describe("direitos: barreira da participação nativa", () => {
  it("legado ativo sem jogador não cria participação ou perfil artificial na leitura", async () => {
    const f = await adulto();
    expect(await consultarMinhaParticipacaoNoRecreio(f.autor)).toEqual({
      estado: "active",
      revisao: 0,
      iniciadaEm: null,
      encerradaEm: null,
    });
    expect(
      await db.select().from(participations).where(eq(participations.userId, f.conta.id)),
    ).toEqual([]);
    expect(await db.select().from(profiles).where(eq(profiles.userId, f.conta.id))).toEqual([]);
  });

  it.each(["closing", "closed"] as const)(
    "%s bloqueia perfil, cadastro infantil, novo teste e aceite de compra no servidor",
    async (estado) => {
      const f = await adulto();
      await fechar(f, estado);
      const recusa = { code: "PARTICIPACAO_ENCERRADA" };
      await expect(
        criarPerfilProprio(f.autor, { apelido: "Novo perfil", avatar: "padrao" }),
      ).rejects.toMatchObject(recusa);
      await expect(prepararCadastroDeMenor(f.autor)).rejects.toMatchObject(recusa);
      await expect(
        prepararPedidoDeDireitos(f.autor, {
          pedidoId: randomUUID(),
          tipo: "encerrar_conta",
          perfis: [],
        }),
      ).rejects.toMatchObject(recusa);
      await expect(
        registrarConsentimentoNoBanco(f.autor, {
          pedidoId: randomUUID(),
          souAdulto: true,
          aceitoExperimento: true,
          versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
          versaoDoTeste: VERSAO_DO_TESTE,
        }),
      ).rejects.toMatchObject(recusa);
      await expect(
        prepararCompraNoBanco(
          f.autor,
          {
            pedidoId: randomUUID(),
            produtoId: "recreio_individual_monthly",
            valorCentavos: 5990,
            moeda: "BRL",
            intervalo: "month",
            souAdulto: true,
            aceitoCobrancaRecorrente: true,
            versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
            versaoDasCondicoes: VERSAO_DA_COMPRA,
            perfis: [],
          },
          "dev",
        ),
      ).rejects.toMatchObject(recusa);
      expect(await db.select().from(profiles).where(eq(profiles.userId, f.conta.id))).toEqual([]);
      expect(await db.select().from(groups).where(eq(groups.ownerUserId, f.conta.id))).toEqual([]);
    },
  );

  it.each(["closing", "closed"] as const)(
    "%s conserva direitos pessoais e consulta financeira, sem liberar nova compra",
    async (estado) => {
      const f = await adulto(),
        outra = await adulto();
      await fechar(f, estado);
      expect(await consultarMinhaParticipacaoNoRecreio(f.autor)).toMatchObject({ estado });
      const copia = await capturarDadosPessoaisDaConta(f.autor);
      try {
        const texto = copia.bytes.toString("utf8");
        expect(texto).toContain('"tipo":"participacao_recreio"');
        expect(texto).toContain(`"estado":"${estado}"`);
        expect(texto).toContain(f.conta.email);
        expect(texto).not.toContain(outra.conta.email);
      } finally {
        copia.bytes.fill(0);
      }
      expect(await consultarMinhaCobranca(f.autor)).toMatchObject({
        modo: "off",
        financeiro: { podeContratar: false },
        compra: null,
        trocas: null,
        perfis: [],
      });
      await expect(
        consultarMinhaParticipacaoNoRecreio({ ...outra.autor, contaId: f.conta.id }),
      ).rejects.toMatchObject({ code: "AUTH" });
    },
  );

  it("kernel recusa aparelho antigo e convite não adiciona membro a grupo de titular em encerramento", async () => {
    const f = await adulto(true),
      destinatario = await adulto();
    if (!f.perfil) throw new Error("Profile fixture absent");
    const perfilId = f.perfil.id;
    await fechar(f);
    await expect(
      db.transaction((tx) =>
        prepararIdentidadeDoJogo(tx, {
          perfilId,
          sessaoDeAparelhoId: f.autor.sessaoDeAparelhoId,
        }),
      ),
    ).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
    await expect(
      trocarContextoComPin(f.autor, { tipo: "perfil", perfilId }, "0000"),
    ).rejects.toMatchObject({ code: "PARTICIPACAO_ENCERRADA" });
    const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, f.conta.id));
    if (!grupo) throw new Error("Group fixture absent");
    const pagante = await db.transaction((tx) =>
      travarGrupoDoTeste(
        tx,
        {
          perfilId,
          sessaoDeAparelhoId: f.autor.sessaoDeAparelhoId,
        },
        { grupoId: GrupoIdSchema.parse(grupo.id), paganteId: f.conta.id },
        f.conta.id,
      ),
    );
    expect(pagante.participacaoAtiva).toBe(false);
    await expect(
      db.transaction((tx) =>
        admitirGrupoParaAceite(tx, destinatario.autor, GrupoIdSchema.parse(grupo.id)),
      ),
    ).rejects.toMatchObject({ code: "PARTICIPACAO_ENCERRADA" });
    expect((await consultarMinhaParticipacaoNoRecreio(destinatario.autor)).estado).toBe("active");
  });

  it("a FK recusa operação alheia, retirada de perfil e estado fechado sem data", async () => {
    const a = await adulto(),
      b = await adulto(true);
    const propria = await operacaoEstrutural(a),
      retirada = await operacaoEstrutural(b, "retirar_perfil");
    const linha = {
      userId: b.conta.id,
      state: "closing" as const,
      revision: 2,
      operationId: propria.operacaoId,
      closingAt: propria.agora,
      updatedAt: propria.agora,
    };
    expect(await codigoDoBanco(db.insert(participations).values(linha))).toBe("23503");
    expect(
      await codigoDoBanco(
        db.insert(participations).values({ ...linha, operationId: retirada.operacaoId }),
      ),
    ).toBe("23503");
    expect(
      await codigoDoBanco(
        db
          .insert(participations)
          .values({ ...linha, userId: a.conta.id, state: "closed", revision: 3, closedAt: null }),
      ),
    ).toBe("23514");
  });

  it("admissão de escrita recusa snapshot antigo, sem transformar leitura de direitos em escrita", async () => {
    const f = await adulto();
    await expect(
      db.transaction((tx) => autorizarContaNativa(tx, f.autor), {
        isolationLevel: "repeatable read",
      }),
    ).rejects.toMatchObject({ code: "PARTICIPACAO_EM_CONFERENCIA" });
    const copia = await capturarDadosPessoaisDaConta(f.autor);
    copia.bytes.fill(0);
  });

  it("gestão financeira do próprio grupo continua disponível; contexto infantil não herda os acessos retidos", async () => {
    const f = await adulto(true);
    await fechar(f);
    expect(await consultarMinhaCobranca(f.autor)).toMatchObject({
      modo: "off",
      financeiro: { podeContratar: false },
      compra: null,
      trocas: { contrato: null, pedido: null },
      perfis: [],
    });
    await db
      .update(devices)
      .set({ minorContextGeneration: randomUUID() })
      .where(eq(devices.id, f.autor.sessaoDeAparelhoId));
    await expect(consultarMinhaParticipacaoNoRecreio(f.autor)).rejects.toMatchObject({
      code: "AUTH",
    });
    await expect(capturarDadosPessoaisDaConta(f.autor)).rejects.toMatchObject({ code: "AUTH" });
    await expect(consultarMinhaCobranca(f.autor)).rejects.toMatchObject({ code: "AUTH" });
  });

  it("conta em encerramento pode encerrar seu aceite de compra ainda não enviado, sem reabrir participação", async () => {
    const f = await adulto();
    const compra = await prepararCompraNoBanco(
      f.autor,
      {
        pedidoId: randomUUID(),
        produtoId: "recreio_individual_monthly",
        valorCentavos: 5990,
        moeda: "BRL",
        intervalo: "month",
        souAdulto: true,
        aceitoCobrancaRecorrente: true,
        versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
        versaoDasCondicoes: VERSAO_DA_COMPRA,
        perfis: [],
      },
      "dev",
    );
    await fechar(f);
    expect(await encerrarCompraNaoEnviadaNoBanco(f.autor, compra.id)).toMatchObject({
      id: compra.id,
      resolucao: "not_started",
      tentativaIniciadaEm: null,
    });
    expect((await consultarMinhaParticipacaoNoRecreio(f.autor)).estado).toBe("closing");
    expect((await consultarMinhaCobranca(f.autor)).compra).toMatchObject({
      id: compra.id,
      resolucao: "not_started",
    });
  });

  it("perfil que espera a identidade relê o encerramento confirmado antes de gravar", async () => {
    const f = await adulto(),
      op = await operacaoEstrutural(f),
      pronto = sinal<number>(),
      liberar = sinal<void>();
    const trava = db.transaction(async (tx) => {
      await tx.execute(sql`set local transaction_timeout='15s'`);
      await tx.select({ id: users.id }).from(users).where(eq(users.id, f.conta.id)).for("update");
      const [linha] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      if (!linha) throw new Error("Connection absent");
      pronto.concluir(linha.pid);
      await liberar.promessa;
      await tx.insert(participations).values({
        userId: f.conta.id,
        state: "closing",
        revision: 2,
        operationId: op.operacaoId,
        closingAt: op.agora,
        updatedAt: op.agora,
      });
    });
    void trava.catch(pronto.recusar);
    const pid = await pronto.promessa;
    const resultado = criarPerfilProprio(f.autor, {
      apelido: "Perfil tardio",
      avatar: "padrao",
    }).then(
      (valor) => ({ ok: true, valor }),
      (erro: unknown) => ({ ok: false, erro }),
    );
    try {
      await expect
        .poll(
          async () => {
            const [linha] = await db.execute<{ esperando: boolean }>(
              sql`select exists(select 1 from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))) as esperando`,
            );
            return linha?.esperando;
          },
          { interval: 20 },
        )
        .toBe(true);
      liberar.concluir(undefined);
      await trava;
      expect(await resultado).toMatchObject({
        ok: false,
        erro: { code: "PARTICIPACAO_ENCERRADA" },
      });
      expect(await db.select().from(profiles).where(eq(profiles.userId, f.conta.id))).toEqual([]);
    } finally {
      liberar.concluir(undefined);
      await trava;
      await resultado;
    }
  });
});
