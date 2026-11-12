import { and, db, eq } from "@informach/db";
import {
  recreioSpaceInvites as invites,
  recreioSpaceMembers as members,
  rateLimit,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { type MundoId, normalizarCodigoDeConvite, PerfilIdSchema } from "@informach/recreio";
import {
  ConviteCriadoSchema,
  ListaDeMundosSchema,
  MundoRefSchema,
} from "@informach/recreio/contrato";
import { describe, expect, it } from "vitest";
import {
  aceitarConvite,
  criarConvite,
  criarMundo,
  detalheDoMundo,
  mundosDoPerfil,
} from "@/features/mundos/service";
import { revogar } from "../scripts/concessoes";
import { eventosCom, type Jogador, novoJogador } from "./apoio";
import { entrarNoJogo, MORADA, mundoDe } from "./jogo-apoio";
import { pedir } from "./rotas";

const quem = (jogador: Jogador) => ({ perfilId: jogador.perfil.id });

/** O código de um convite novo do responsável, como a tela dele mostra. */
async function conviteDe(steward: Jogador, mundoId: MundoId, participacao?: string) {
  const convite = await criarConvite({ ...quem(steward), jogo: null }, mundoId, {
    forma: "member",
    ...(participacao ? { participacao } : {}),
  });
  return ConviteCriadoSchema.parse(convite).codigo;
}

function membrosDe(mundoId: MundoId) {
  return db
    .select({
      id: members.id,
      profileId: members.profileId,
      role: members.role,
      state: members.state,
      participation: members.participation,
      invitedByMemberId: members.invitedByMemberId,
    })
    .from(members)
    .where(eq(members.spaceId, mundoId))
    .orderBy(members.joinedAt, members.id);
}

async function codigoDaRecusa(operacao: Promise<unknown>): Promise<string> {
  const erro = await operacao.then(
    () => null,
    (motivo: unknown) => motivo,
  );
  if (!erro || typeof erro !== "object" || !("codigo" in erro)) throw new Error("Esperava recusa");
  return String(erro.codigo);
}

describe("criar e listar mundos", () => {
  it("cria o mundo hibernando, com quem criou como responsável e a política padrão do jogo", async () => {
    const lia = await novoJogador();
    const sessao = await entrarNoJogo(lia);
    const criado = await pedir("POST", "/api/sdk/v1/mundos", {
      token: sessao.token,
      corpo: { nome: "  Casa da Lia  " },
    });
    expect(criado.status).toBe(200);
    const mundo = MundoRefSchema.parse(criado.corpo);
    expect(mundo.nome).toBe("Casa da Lia");

    const [linha] = await db.select().from(spaces).where(eq(spaces.id, mundo.id));
    expect(linha).toMatchObject({
      gameId: MORADA,
      status: "hibernating",
      contentPolicy: "todas_as_idades",
      stewardProfileId: lia.perfil.id,
      createdByProfileId: lia.perfil.id,
      revision: 0,
      journalSeq: 0,
      leaseEpoch: 0,
    });
    expect(await membrosDe(mundo.id)).toMatchObject([
      { profileId: lia.perfil.id, role: "steward", state: "active", participation: null },
    ]);

    const lista = await pedir("GET", `/api/sdk/v1/mundos?jogo=${MORADA}`, { token: sessao.token });
    expect(ListaDeMundosSchema.parse(lista.corpo).mundos).toMatchObject([
      {
        id: mundo.id,
        nome: "Casa da Lia",
        papel: "steward",
        estado: "hibernating",
        membros: 1,
        politicaDeConteudo: "todas_as_idades",
        abertoAgora: false,
        resumo: null,
      },
    ]);

    const [evento] = await eventosCom("spaceId", mundo.id);
    expect(evento).toMatchObject({
      eventType: "recreio.space_created",
      actorId: lia.conta.id,
      payload: { app: "recreio", gameId: MORADA, profileId: lia.perfil.id },
    });
    // O nome do mundo é conteúdo de quem joga e fica fora da auditoria.
    expect(JSON.stringify(evento?.payload)).not.toContain("Casa");
    expect(evento?.payload).not.toHaveProperty("targetId");
  });

  it("aceita uma política que o jogo oferece e cai na padrão com uma que ele não oferece", async () => {
    const lia = await novoJogador();
    const completo = await criarMundo(
      { ...quem(lia), jogo: MORADA },
      { nome: "Completo", politicaDeConteudo: "completo" },
    );
    const inventada = await criarMundo(
      { ...quem(lia), jogo: MORADA },
      { nome: "Inventada", politicaDeConteudo: "sem_regras" },
    );
    const politicas = await db
      .select({ id: spaces.id, contentPolicy: spaces.contentPolicy })
      .from(spaces)
      .where(eq(spaces.createdByProfileId, lia.perfil.id));
    expect(politicas.find((linha) => linha.id === completo.id)?.contentPolicy).toBe("completo");
    expect(politicas.find((linha) => linha.id === inventada.id)?.contentPolicy).toBe(
      "todas_as_idades",
    );
  });

  it("recusa nome fora do tamanho e campo a mais", async () => {
    const lia = await novoJogador();
    const sessao = await entrarNoJogo(lia);
    for (const corpo of [
      { nome: "a" },
      { nome: "x".repeat(41) },
      { nome: "Casa", dono: "x" },
      {},
    ]) {
      expect(await pedir("POST", "/api/sdk/v1/mundos", { token: sessao.token, corpo })).toEqual({
        status: 400,
        corpo: { codigo: "ENTRADA_INVALIDA" },
      });
    }
  });

  it("sob concorrência, o perfil cria no máximo três mundos do jogo", async () => {
    const lia = await novoJogador();
    const resultados = await Promise.allSettled(
      Array.from({ length: 8 }, (_, n) =>
        criarMundo({ ...quem(lia), jogo: MORADA }, { nome: `Mundo ${n + 1}` }),
      ),
    );
    expect(resultados.filter((resultado) => resultado.status === "fulfilled")).toHaveLength(3);
    for (const resultado of resultados) {
      if (resultado.status === "rejected")
        expect(resultado.reason).toMatchObject({ codigo: "LIMITE_DE_MUNDOS" });
    }
    expect(await mundosDoPerfil(lia.perfil.id, MORADA)).toHaveLength(3);
    // Mundo apagado não conta para o teto.
    const [primeiro] = await mundosDoPerfil(lia.perfil.id, MORADA);
    if (!primeiro) throw new Error("Esperava um mundo");
    await db.update(spaces).set({ status: "deleted" }).where(eq(spaces.id, primeiro.id));
    await expect(
      criarMundo({ ...quem(lia), jogo: MORADA }, { nome: "Depois" }),
    ).resolves.toMatchObject({ nome: "Depois" });
    expect((await mundosDoPerfil(lia.perfil.id, MORADA)).map((mundo) => mundo.nome)).not.toContain(
      primeiro.nome,
    );
  });

  it("sem o direito de jogar não cria, não convida e não aceita", async () => {
    const lia = await novoJogador();
    const mundoId = await mundoDe(lia);
    const codigo = await conviteDe(lia, mundoId);
    const semAcesso = await novoJogador({ comAcesso: false });
    expect(
      await codigoDaRecusa(criarMundo({ ...quem(semAcesso), jogo: MORADA }, { nome: "X1" })),
    ).toBe("ACESSO_NEGADO");
    expect(await codigoDaRecusa(aceitarConvite(quem(semAcesso), { codigo }))).toBe("ACESSO_NEGADO");

    await revogar({ email: lia.conta.email, motivo: "teste" });
    expect(
      await codigoDaRecusa(
        criarConvite({ ...quem(lia), jogo: null }, mundoId, { forma: "member" }),
      ),
    ).toBe("ACESSO_NEGADO");
    // O mundo continua sendo dela, e a estante o mostra mesmo sem acesso.
    expect(await mundosDoPerfil(lia.perfil.id, MORADA)).toHaveLength(1);
  });
});

describe("convites", () => {
  it("o código aparece uma vez, no formato de leitura, e o banco guarda só o resumo", async () => {
    const lia = await novoJogador();
    const mundoId = await mundoDe(lia);
    const sessao = await entrarNoJogo(lia);
    const resposta = await pedir("POST", `/api/sdk/v1/mundos/${mundoId}/convites`, {
      token: sessao.token,
      corpo: { forma: "member", participacao: "familia:fam_1" },
    });
    expect(resposta.status).toBe(200);
    const convite = ConviteCriadoSchema.parse(resposta.corpo);
    expect(convite.codigo).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const validade = Date.parse(convite.expiraEm) - Date.now();
    expect(validade).toBeGreaterThan(23.9 * 3_600_000);
    expect(validade).toBeLessThanOrEqual(24 * 3_600_000);

    const [linha] = await db.select().from(invites).where(eq(invites.spaceId, mundoId));
    expect(linha).toMatchObject({ form: "member", state: "sent", participation: "familia:fam_1" });
    expect(linha?.codeHash).toMatch(/^[0-9a-f]{64}$/);
    const cru = normalizarCodigoDeConvite(convite.codigo) ?? "";
    expect(JSON.stringify(linha)).not.toContain(cru);
    expect(JSON.stringify(linha)).not.toContain(convite.codigo);

    const eventos = await eventosCom("spaceId", mundoId);
    expect(eventos.at(-1)).toMatchObject({
      eventType: "recreio.space_invite_created",
      actorId: lia.conta.id,
      payload: { inviteId: linha?.id, form: "member" },
    });
    expect(JSON.stringify(eventos)).not.toContain(cru);
    expect(JSON.stringify(eventos)).not.toContain(linha?.codeHash);
    expect(JSON.stringify(eventos)).not.toContain("familia:fam_1");
  });

  it("só o responsável convida; quem não é membro recebe a mesma recusa de um mundo que não existe", async () => {
    const lia = await novoJogador();
    const bruno = await novoJogador({ apelido: "Bruno" });
    const estranho = await novoJogador({ apelido: "Caio" });
    const mundoId = await mundoDe(lia);
    await aceitarConvite(quem(bruno), { codigo: await conviteDe(lia, mundoId) });

    const pedirConvite = async (
      jogador: Jogador,
      id: string,
      corpo: unknown = { forma: "member" },
    ) =>
      pedir("POST", `/api/sdk/v1/mundos/${id}/convites`, {
        token: (await entrarNoJogo(jogador, MORADA, { continuarAqui: true })).token,
        corpo,
      });

    expect(await pedirConvite(bruno, mundoId)).toEqual({
      status: 403,
      corpo: { codigo: "SEM_PERMISSAO" },
    });
    const deFora = await pedirConvite(estranho, mundoId);
    const inexistente = await pedirConvite(estranho, crypto.randomUUID());
    const semForma = await pedirConvite(estranho, "nao-e-um-id");
    expect(deFora).toEqual({ status: 403, corpo: { codigo: "NAO_MEMBRO" } });
    expect(inexistente).toEqual(deFora);
    expect(semForma.status).toBe(400);
    // Convite de visita ainda não existe, nem para o responsável.
    expect(await pedirConvite(lia, mundoId, { forma: "visit" })).toEqual({
      status: 403,
      corpo: { codigo: "SEM_PERMISSAO" },
    });
    expect(await db.select().from(invites).where(eq(invites.spaceId, mundoId))).toHaveLength(1);
  });

  it("quem aceita entra como membro, com a participação do convite", async () => {
    const lia = await novoJogador();
    const bruno = await novoJogador({ apelido: "Bruno" });
    const mundoId = await mundoDe(lia);
    const codigo = await conviteDe(lia, mundoId, "familia:fam_1");

    // Como a pessoa digita: minúsculas, sem hífen, com espaço.
    const aceito = await aceitarConvite(quem(bruno), {
      codigo: ` ${codigo.replace("-", "").toLowerCase()} `,
    });
    expect(aceito).toMatchObject({ mundoId, nome: "Casa de teste", jogo: MORADA });

    const [responsavel, convidado] = await membrosDe(mundoId);
    expect(convidado).toMatchObject({
      profileId: bruno.perfil.id,
      role: "member",
      state: "active",
      participation: "familia:fam_1",
      invitedByMemberId: responsavel?.id,
    });
    const [convite] = await db.select().from(invites).where(eq(invites.spaceId, mundoId));
    expect(convite).toMatchObject({ state: "accepted", acceptedByProfileId: bruno.perfil.id });
    expect(convite?.acceptedAt).not.toBeNull();

    const eventos = (await eventosCom("spaceId", mundoId)).filter(
      (evento) => evento.actorId === bruno.conta.id,
    );
    // Os dois entram na mesma transação, com o mesmo instante.
    expect(eventos.map((evento) => evento.eventType).sort()).toEqual([
      "recreio.space_invite_accepted",
      "recreio.space_member_joined",
    ]);
    expect(
      eventos.find((evento) => evento.eventType === "recreio.space_member_joined")?.payload,
    ).toMatchObject({
      memberId: convidado?.id,
      profileId: bruno.perfil.id,
      role: "member",
    });
    expect(JSON.stringify(eventos)).not.toMatch(/Bruno|Casa de teste|familia:fam_1/);

    // Os dois veem o mundo, com dois membros, e a página do mundo lista os apelidos.
    expect(await mundosDoPerfil(bruno.perfil.id, MORADA)).toMatchObject([
      { id: mundoId, papel: "member", membros: 2 },
    ]);
    const detalhe = await detalheDoMundo(bruno.perfil.id, mundoId);
    expect(detalhe?.membros.map((membro) => [membro.apelido, membro.papel])).toEqual([
      ["Lia", "steward"],
      ["Bruno", "member"],
    ]);
  });

  it("um código entra uma vez só, mesmo com dois aceites ao mesmo tempo", async () => {
    const lia = await novoJogador();
    const mundoId = await mundoDe(lia);
    const codigo = await conviteDe(lia, mundoId);
    const candidatos = await Promise.all(Array.from({ length: 4 }, () => novoJogador()));
    const resultados = await Promise.allSettled(
      candidatos.map((candidato) => aceitarConvite(quem(candidato), { codigo })),
    );
    expect(resultados.filter((resultado) => resultado.status === "fulfilled")).toHaveLength(1);
    for (const resultado of resultados) {
      if (resultado.status === "rejected")
        expect(resultado.reason).toMatchObject({ codigo: "CONVITE_INVALIDO" });
    }
    expect(await membrosDe(mundoId)).toHaveLength(2);
  });

  it("código errado, mal formado, vencido, usado ou revogado dão a mesma recusa", async () => {
    const lia = await novoJogador();
    const bruno = await novoJogador();
    const caio = await novoJogador();
    const mundoId = await mundoDe(lia);

    const vencido = await conviteDe(lia, mundoId);
    const revogado = await conviteDe(lia, mundoId);
    const usado = await conviteDe(lia, mundoId);
    const [linhaVencida, linhaRevogada] = await db
      .select({ id: invites.id })
      .from(invites)
      .where(eq(invites.spaceId, mundoId))
      .orderBy(invites.createdAt, invites.id);
    if (!linhaVencida || !linhaRevogada) throw new Error("Esperava os convites");
    await db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invites.id, linhaVencida.id));
    await db.update(invites).set({ state: "revoked" }).where(eq(invites.id, linhaRevogada.id));
    await aceitarConvite(quem(bruno), { codigo: usado });

    const recusas = new Set<string>();
    for (const codigo of [vencido, revogado, usado, "ABCDE-FGHJK", "curto", "0000000000"]) {
      recusas.add(await codigoDaRecusa(aceitarConvite(quem(caio), { codigo })));
    }
    expect([...recusas]).toEqual(["CONVITE_INVALIDO"]);
    expect(await membrosDe(mundoId)).toHaveLength(2);
  });

  it("pela rota: a sessão de jogo aceita para o próprio perfil, e pedido sem token de outra origem é recusado", async () => {
    const lia = await novoJogador();
    const bruno = await novoJogador();
    const mundoId = await mundoDe(lia);
    const codigo = await conviteDe(lia, mundoId);

    // Sem token o caminho é o do cookie, que só atende a própria origem.
    expect(await pedir("POST", "/api/sdk/v1/convites/aceitar", { corpo: { codigo } })).toEqual({
      status: 403,
      corpo: { codigo: "ACESSO_NEGADO", motivo: "origem" },
    });
    expect(
      await pedir("POST", "/api/sdk/v1/convites/aceitar", {
        corpo: { codigo },
        headers: { origin: "https://outro.example" },
      }),
    ).toMatchObject({ status: 403 });
    expect(await membrosDe(mundoId)).toHaveLength(1);

    const sessao = await entrarNoJogo(bruno);
    // O corpo leva só o código: um perfil a mais no pedido é recusado, não obedecido.
    expect(
      await pedir("POST", "/api/sdk/v1/convites/aceitar", {
        token: sessao.token,
        corpo: { codigo, perfilId: lia.perfil.id },
      }),
    ).toEqual({ status: 400, corpo: { codigo: "ENTRADA_INVALIDA" } });
    expect(
      await pedir("POST", "/api/sdk/v1/convites/aceitar", {
        token: sessao.token,
        corpo: { codigo },
      }),
    ).toEqual({ status: 200, corpo: { id: mundoId, nome: "Casa de teste" } });
    expect((await membrosDe(mundoId)).map((membro) => membro.profileId)).toEqual([
      lia.perfil.id,
      bruno.perfil.id,
    ]);
  });

  it("quem já participa recebe JA_MEMBRO e o convite continua valendo para outra pessoa", async () => {
    const lia = await novoJogador();
    const bruno = await novoJogador();
    const mundoId = await mundoDe(lia);
    const codigo = await conviteDe(lia, mundoId);
    expect(await codigoDaRecusa(aceitarConvite(quem(lia), { codigo }))).toBe("JA_MEMBRO");
    await expect(aceitarConvite(quem(bruno), { codigo })).resolves.toMatchObject({ mundoId });
    // Quem perdeu o acesso continua membro e não entra duas vezes.
    await db
      .update(members)
      .set({ state: "no_access" })
      .where(and(eq(members.spaceId, mundoId), eq(members.profileId, bruno.perfil.id)));
    expect(
      await codigoDaRecusa(aceitarConvite(quem(bruno), { codigo: await conviteDe(lia, mundoId) })),
    ).toBe("JA_MEMBRO");
  });

  it("quem saiu do mundo volta pelo convite na mesma linha de membro", async () => {
    const lia = await novoJogador();
    const bruno = await novoJogador();
    const mundoId = await mundoDe(lia);
    await aceitarConvite(quem(bruno), { codigo: await conviteDe(lia, mundoId) });
    const [, antes] = await membrosDe(mundoId);
    await db
      .update(members)
      .set({ state: "former", leftAt: new Date() })
      .where(eq(members.id, antes?.id ?? ""));
    expect(await detalheDoMundo(bruno.perfil.id, mundoId)).toBeNull();

    await aceitarConvite(quem(bruno), { codigo: await conviteDe(lia, mundoId, "familia:nova") });
    const depois = await membrosDe(mundoId);
    expect(depois).toHaveLength(2);
    expect(depois.find((membro) => membro.profileId === bruno.perfil.id)).toMatchObject({
      id: antes?.id,
      state: "active",
      role: "member",
      participation: "familia:nova",
    });
  });

  it("mundo cheio não recebe mais ninguém, e o convite não é gasto", async () => {
    const lia = await novoJogador();
    const mundoId = await mundoDe(lia);
    // O Morada aceita oito membros: a responsável e mais sete.
    for (let n = 0; n < 7; n++) {
      await aceitarConvite(quem(await novoJogador()), { codigo: await conviteDe(lia, mundoId) });
    }
    const codigo = await conviteDe(lia, mundoId);
    const nono = await novoJogador();
    expect(await codigoDaRecusa(aceitarConvite(quem(nono), { codigo }))).toBe("MUNDO_CHEIO");
    expect(await membrosDe(mundoId)).toHaveLength(8);
    // Abriu uma vaga: o mesmo código ainda serve.
    const [, alguem] = await membrosDe(mundoId);
    await db
      .update(members)
      .set({ state: "former" })
      .where(eq(members.id, alguem?.id ?? ""));
    await expect(aceitarConvite(quem(nono), { codigo })).resolves.toMatchObject({ mundoId });
  });

  it("mundo arquivado não aceita convite novo nem aceite", async () => {
    const lia = await novoJogador();
    const bruno = await novoJogador();
    const mundoId = await mundoDe(lia);
    const codigo = await conviteDe(lia, mundoId);
    await db.update(spaces).set({ status: "archived" }).where(eq(spaces.id, mundoId));
    expect(await codigoDaRecusa(aceitarConvite(quem(bruno), { codigo }))).toBe("CONVITE_INVALIDO");
    expect(
      await codigoDaRecusa(
        criarConvite({ ...quem(lia), jogo: null }, mundoId, { forma: "member" }),
      ),
    ).toBe("MUNDO_INDISPONIVEL");
  });

  it("as tentativas de aceitar são contadas por perfil", async () => {
    const curioso = await novoJogador();
    const outro = await novoJogador();
    const codigos: string[] = [];
    for (let n = 0; n < 12; n++) {
      codigos.push(await codigoDaRecusa(aceitarConvite(quem(curioso), { codigo: "ABCDE-FGHJK" })));
    }
    expect(codigos.slice(0, 10)).toEqual(Array(10).fill("CONVITE_INVALIDO"));
    expect(codigos.slice(10)).toEqual(["MUITAS_TENTATIVAS", "MUITAS_TENTATIVAS"]);
    // O limite é de quem tentou: outro perfil segue normalmente.
    expect(await codigoDaRecusa(aceitarConvite(quem(outro), { codigo: "ABCDE-FGHJK" }))).toBe(
      "CONVITE_INVALIDO",
    );
    // A chave do contador leva o perfil, nunca o código digitado.
    const contadores = await db.select({ key: rateLimit.key }).from(rateLimit);
    expect(contadores.map((linha) => linha.key)).toContain(`recreio:convite:${curioso.perfil.id}`);
    expect(JSON.stringify(contadores)).not.toContain("ABCDE");
  });
});

describe("página do mundo", () => {
  it("só existe para quem é membro ativo", async () => {
    const lia = await novoJogador();
    const estranho = await novoJogador();
    const mundoId = await mundoDe(lia);
    expect(await detalheDoMundo(lia.perfil.id, mundoId)).toMatchObject({
      id: mundoId,
      nome: "Casa de teste",
      papel: "steward",
    });
    expect(await detalheDoMundo(estranho.perfil.id, mundoId)).toBeNull();
    expect(await detalheDoMundo(lia.perfil.id, crypto.randomUUID())).toBeNull();
    expect(await detalheDoMundo(lia.perfil.id, "nao-e-um-id")).toBeNull();
    // O id da conta no lugar do id do perfil não acha nada.
    expect(await detalheDoMundo(PerfilIdSchema.parse(lia.conta.id), mundoId)).toBeNull();
  });
});
