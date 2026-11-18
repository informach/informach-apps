import { db, eq } from "@informach/db";
import { recreioDirectedSpaceInvites as invites } from "@informach/db/schema";
import { criarRecreio } from "@informach/recreio/sdk";
import { expect, it, vi } from "vitest";
import { emitirConviteDirigido } from "@/features/mundos/convites-dirigidos-service";
import { emitirIngresso } from "@/features/sessao-de-jogo/service";
import {
  aceitarAmizade,
  emitirCodigoDeAmigo,
  pedirAmizade,
  protegerContato,
} from "@/features/social/service";
import { eventosCom, type Jogador, novoJogador } from "./apoio";
import { mundoDe } from "./jogo-apoio";
import { despachar, ORIGEM, pedir } from "./rotas";
import { referenciaSocial as ref } from "./social-apoio";

// Segundo título só para comprovar isolamento do SID; não altera o Morada real.
vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "escopo-convites",
      nome: "Escopo interno",
      rota: "/jogar/escopo-convites",
    },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((j) => j.id === id) ?? null,
  };
});
async function abrir(jogador: Jogador, convitesDirigidos = true, buscar = despachar) {
  const sdk = await criarRecreio({
    baseUrl: ORIGEM,
    jogo: "morada",
    social: true,
    convitesDirigidos,
    obterIngresso: async () => (await emitirIngresso(jogador.ator, { jogo: "morada" })).ingresso,
    fetch: buscar,
    agendar: () => () => {},
  });
  return sdk;
}
async function preparar() {
  const a = await novoJogador(),
    b = await novoJogador();
  const codigo = await emitirCodigoDeAmigo(ref(b));
  const amizade = await pedirAmizade(ref(a), {
    codigo: codigo.codigo,
    pedidoId: crypto.randomUUID(),
  });
  await aceitarAmizade(ref(b), amizade.pedidoId);
  const mundoId = await mundoDe(a);
  return {
    a,
    b,
    mundoId,
    pedido: { mundoId, perfilId: b.perfil.id, pedidoId: crypto.randomUUID() },
  };
}

it("capacidade é opt-in e dois SIDs reais emitem, consultam e aceitam sem expor fatos privados", async () => {
  const c = await preparar(),
    antigo = await novoJogador(),
    sdkAntigo = await abrir(antigo, false);
  expect(sdkAntigo.social?.convitesDeMundo).toBeUndefined();
  const a = await abrir(c.a),
    b = await abrir(c.b),
    origem = a.social?.convitesDeMundo,
    destino = b.social?.convitesDeMundo;
  if (!origem || !destino) throw new Error("Capacidade não negociada");
  const criado = await origem.emitir(c.pedido),
    caixa = await destino.listar();
  expect(caixa).toMatchObject({
    convites: [
      {
        conviteId: criado.conviteId,
        perfilId: c.a.perfil.id,
        direcao: "recebido",
        estado: "pending",
      },
    ],
    proximo: null,
  });
  expect(JSON.stringify(caixa)).not.toMatch(
    /requestHash|accessGeneration|policyVersion|nickname|userId|guardian|accountId/,
  );
  expect(await destino.consultar(criado.conviteId)).toEqual(criado);
  expect(await destino.conferir(criado.conviteId)).toMatchObject({
    convite: criado,
    nomeDoMundo: "Casa de teste",
    origem: { apelido: c.a.perfil.apelido },
    destino: { apelido: c.b.perfil.apelido },
  });
  expect((await destino.responder(criado.conviteId, "aceitar")).estado).toBe("accepted");
  await expect(destino.conferir(criado.conviteId)).rejects.toMatchObject({
    codigo: "NAO_ENCONTRADO",
  });
  await expect(origem.emitir({ ...c.pedido, pedidoId: crypto.randomUUID() })).rejects.toMatchObject(
    { codigo: "JA_MEMBRO" },
  );
  for (const sdk of [a, b, sdkAntigo]) await sdk.sessao.sair();
});

it("perder resposta após commit conserva o nonce, não repete automaticamente e recupera um único aceite", async () => {
  const c = await preparar();
  let emissoes = 0,
    aceites = 0;
  const buscar: typeof despachar = async (url, init) => {
    const resposta = await despachar(url, init);
    if (
      String(url).endsWith("/convites-dirigidos") &&
      init?.method === "POST" &&
      typeof init.body === "string"
    ) {
      const corpo: unknown = JSON.parse(init.body);
      if (corpo && typeof corpo === "object" && "operacao" in corpo) {
        if (corpo.operacao === "emitir" && ++emissoes === 1)
          throw new Error("ACK perdido após commit");
        if (corpo.operacao === "responder" && ++aceites === 1)
          throw new Error("ACK perdido após commit");
      }
    }
    return resposta;
  };
  const a = await abrir(c.a, true, buscar),
    b = await abrir(c.b, true, buscar),
    origem = a.social?.convitesDeMundo,
    destino = b.social?.convitesDeMundo;
  if (!origem || !destino) throw new Error("Capacidade ausente");
  await expect(origem.emitir(c.pedido)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  expect(emissoes).toBe(1);
  const criado = await origem.emitir(c.pedido);
  expect(emissoes).toBe(2);
  expect(
    await db.select().from(invites).where(eq(invites.clientKey, c.pedido.pedidoId)),
  ).toHaveLength(1);
  await expect(destino.responder(criado.conviteId, "aceitar")).rejects.toMatchObject({
    codigo: "INDISPONIVEL",
  });
  expect(aceites).toBe(1);
  expect((await destino.consultar(criado.conviteId)).estado).toBe("accepted");
  expect((await destino.responder(criado.conviteId, "aceitar")).estado).toBe("accepted");
  expect(aceites).toBe(2);
  expect(
    (await eventosCom("inviteId", criado.conviteId)).filter(
      (e) => e.eventType === "recreio.space_invite_accepted",
    ),
  ).toHaveLength(1);
  await a.sessao.sair();
  await b.sessao.sair();
});

it("HTTP recusa identidade na consulta, aprovação parental no corpo e SID encerrado", async () => {
  const c = await preparar(),
    sdk = await abrir(c.a),
    token = sdk.sessao.token();
  expect(
    await pedir("GET", `/api/sdk/v1/convites-dirigidos?perfilId=${c.b.perfil.id}`, { token }),
  ).toMatchObject({ status: 400, corpo: { codigo: "ENTRADA_INVALIDA" } });
  expect(
    await pedir("POST", "/api/sdk/v1/convites-dirigidos", {
      token,
      corpo: { operacao: "aprovar", perfilId: c.b.perfil.id, confirmo: true },
    }),
  ).toMatchObject({ status: 400 });
  expect(
    await pedir("GET", `/api/sdk/v1/convites-dirigidos?aposId=${crypto.randomUUID()}`, { token }),
  ).toMatchObject({ status: 400 });
  await sdk.sessao.sair();
  expect(await pedir("GET", "/api/sdk/v1/convites-dirigidos", { token })).toMatchObject({
    status: 403,
  });
});

it("SID de Morada não vê ou aceita o convite de outro jogo", async () => {
  const c = await preparar(),
    mundoId = await mundoDe(c.a, "escopo-convites");
  const criado = await emitirConviteDirigido(ref(c.a), { ...c.pedido, mundoId });
  const sdk = await abrir(c.b),
    api = sdk.social?.convitesDeMundo;
  if (!api) throw new Error("Capacidade ausente");
  expect((await api.listar()).convites).toHaveLength(0);
  await expect(api.consultar(criado.conviteId)).rejects.toMatchObject({
    codigo: "SESSAO_INVALIDA",
  });
  await expect(api.responder(criado.conviteId, "aceitar")).rejects.toMatchObject({
    codigo: "SESSAO_INVALIDA",
  });
  expect((await db.select().from(invites).where(eq(invites.id, criado.conviteId)))[0]?.state).toBe(
    "pending",
  );
  await sdk.sessao.sair();
});

it("caixa pagina dez recibos por timestamp e UUID sem duplicar ou usar seletor de identidade", async () => {
  const c = await preparar(),
    outro = await mundoDe(c.a);
  for (let i = 0; i < 12; i++)
    await emitirConviteDirigido(ref(c.a), {
      ...c.pedido,
      mundoId: i < 6 ? c.mundoId : outro,
      pedidoId: crypto.randomUUID(),
    });
  const sdk = await abrir(c.b),
    api = sdk.social?.convitesDeMundo;
  if (!api) throw new Error("Capacidade ausente");
  const primeira = await api.listar();
  expect(primeira.convites).toHaveLength(10);
  if (!primeira.proximo) throw new Error("Cursor ausente");
  const segunda = await api.listar(primeira.proximo);
  expect(segunda.convites).toHaveLength(2);
  expect(segunda.proximo).toBeNull();
  expect(new Set([...primeira.convites, ...segunda.convites].map((x) => x.conviteId)).size).toBe(
    12,
  );
  await sdk.sessao.sair();
});

it("bloqueio retira nomes e detalhes atuais, conservando recibo mínimo e recusa", async () => {
  const c = await preparar(),
    a = await abrir(c.a),
    b = await abrir(c.b),
    origem = a.social?.convitesDeMundo,
    destino = b.social?.convitesDeMundo;
  if (!origem || !destino) throw new Error("Capacidade ausente");
  const criado = await origem.emitir(c.pedido);
  expect((await destino.conferir(criado.conviteId)).nomeDoMundo).toBe("Casa de teste");
  await protegerContato(ref(c.a), { perfilId: c.b.perfil.id, bloqueado: true, silenciado: true });
  const r = await pedir("POST", "/api/sdk/v1/convites-dirigidos", {
    token: b.sessao.token(),
    corpo: { operacao: "conferir", conviteId: criado.conviteId },
  });
  expect(r).toMatchObject({ status: 404, corpo: { codigo: "NAO_ENCONTRADO" } });
  expect(JSON.stringify(r.corpo)).not.toContain("Casa de teste");
  const caixa = await destino.listar();
  expect(caixa.convites[0]?.conviteId).toBe(criado.conviteId);
  expect(JSON.stringify(caixa)).not.toContain("Casa de teste");
  expect((await destino.responder(criado.conviteId, "recusar")).estado).toBe("declined");
  await a.sessao.sair();
  await b.sessao.sair();
});
