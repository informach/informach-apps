import { MundoIdSchema } from "@informach/recreio";
import { criarRecreio, type RecreioGameContext } from "@informach/recreio/sdk";
import { expect, type Page, test } from "@playwright/test";
import WebSocket from "ws";
import { z } from "zod";
import {
  comecarVigia,
  convidar,
  criarMundo,
  fecharAparelhos,
  novaPessoa,
  vigia,
} from "../e2e/apoio";
import { servidorDoContador } from "../e2e/servidor-apoio";
import {
  type DoServidor,
  DoServidorSchema,
  lerQuadro,
} from "../src/features/jogo-de-teste/protocolo";

const servidor = servidorDoContador();
test.beforeEach(() => {
  comecarVigia();
  servidor.limparLog();
});
test.afterEach(async () => {
  await fecharAparelhos();
  await servidor.parar();
  if (test.info().status !== test.info().expectedStatus)
    await test
      .info()
      .attach("servidor-do-contador.log", { body: servidor.log(), contentType: "text/plain" });
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

async function contextoDe(page: Page) {
  const origem = new URL(page.url()).origin;
  return criarRecreio({
    baseUrl: origem,
    jogo: "teste",
    salvamentoRestrito: true,
    obterIngresso: async () => {
      const resposta = await page.request.post("/api/sdk/v1/ingresso", {
        headers: { origin: origem },
        data: { jogo: "teste" },
      });
      expect(resposta.status()).toBe(200);
      return z.object({ ingresso: z.string() }).parse(await resposta.json()).ingresso;
    },
  });
}

function esperarQuadro(
  socket: WebSocket,
  aceitar: (quadro: DoServidor) => boolean,
): Promise<DoServidor> {
  return new Promise((resolve, reject) => {
    const prazo = setTimeout(() => {
      limpar();
      reject(new Error("A instância não confirmou o quadro"));
    }, 15_000);
    function limpar() {
      clearTimeout(prazo);
      socket.off("message", ler);
      socket.off("error", falhar);
    }
    function falhar(erro: Error) {
      limpar();
      reject(erro);
    }
    function ler(bytes: WebSocket.RawData) {
      const quadro = lerQuadro(DoServidorSchema, bytes.toString());
      if (!quadro) {
        limpar();
        reject(new Error("Quadro inválido da instância"));
      } else if (aceitar(quadro)) {
        limpar();
        resolve(quadro);
      }
    }
    socket.on("message", ler);
    socket.on("error", falhar);
  });
}

async function conectar(contexto: RecreioGameContext, mundoId: string, origem: string) {
  const mundo = await contexto.mundos.abrir(MundoIdSchema.parse(mundoId));
  const socket = new WebSocket(mundo.endereco, { origin: origem });
  const estado = esperarQuadro(socket, (quadro) => quadro.t === "estado");
  socket.once("open", () =>
    socket.send(
      JSON.stringify({ t: "entrar", token: contexto.sessao.token(), mundoId, salvamento: true }),
    ),
  );
  await estado;
  return socket;
}

test("SDK e instância concluem após queda real de conexão e outro morador continua", async ({
  browser,
}) => {
  const pessoa = await novaPessoa(browser, "Salvamento da instância");
  const visita = await novaPessoa(browser, "Morador que continua");
  const mundo = await criarMundo(pessoa.page, "Jogo de teste", "Mundo da margem");
  await convidar(pessoa.page, visita.page, mundo);
  await servidor.iniciar();
  const contexto = await contextoDe(pessoa.page);
  let socket: WebSocket | null = null;
  try {
    socket = await conectar(contexto, mundo, new URL(pessoa.page.url()).origin);
    const somado = esperarQuadro(
      socket,
      (quadro) => quadro.t === "estado" && quadro.contador === 1,
    );
    socket.send(JSON.stringify({ t: "somar", id: crypto.randomUUID() }));
    await somado;
    await visita.page.goto(`/jogar/teste?mundo=${mundo}`);
    await expect(visita.page.getByLabel("Valor do contador")).toHaveText("1");
    socket.close(1000);
    const recibo = contexto.sessao.salvamento;
    if (!recibo) throw new Error("Capacidade negociada ausente");
    await expect
      .poll(async () => (await recibo.estado()).estado, { timeout: 20_000 })
      .toBe("completed");
    await visita.page.getByRole("button", { name: "Somar 1" }).click();
    await expect(visita.page.getByLabel("Valor do contador")).toHaveText("2");
    await expect(contexto.mundos.listar()).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
  } finally {
    socket?.terminate();
    await contexto.sessao.sair();
  }
});
