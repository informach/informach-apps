import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { temCliente } from "@/features/jogar/registro";
import { prepararPaginaDoJogo } from "@/features/jogar/service";
import { revogar } from "../scripts/concessoes";
import { novoJogador } from "./apoio";
import { MORADA, mundoDe } from "./jogo-apoio";

/**
 * O que a página `/jogar/<jogo>` decide no servidor, com um jogo que o portal
 * sabe hospedar. Este ambiente roda com o jogo de teste desligado, então o
 * arquivo o liga do jeito que o build e o catálogo ligariam: a variável do
 * build antes de o registro carregar, e o manifesto no catálogo (o mesmo
 * recurso que os outros testes usam para ter um segundo jogo). O registro, os
 * serviços e o banco são os de verdade.
 */
const TESTE = "teste";
/** Um jogo que está no catálogo e não tem linha no registro dos clientes. */
const SEM_CLIENTE = "sem-cliente";

vi.hoisted(() => {
  process.env.RECREIO_CLIENTE_DE_TESTE = "1";
});

vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    { ...real.JOGOS[0], id: "teste", nome: "Jogo de teste", rota: "/jogar/teste" },
    { ...real.JOGOS[0], id: "sem-cliente", nome: "Sem cliente", rota: "/jogar/sem-cliente" },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((jogo) => jogo.id === id) ?? null,
    ehGameId: (id: string) => jogos.some((jogo) => jogo.id === id),
  };
});

describe("página do jogo", () => {
  it("só o jogo com cliente no portal tem página", async () => {
    expect(temCliente(TESTE)).toBe(true);
    expect(temCliente(MORADA)).toBe(true);
    expect(temCliente(SEM_CLIENTE)).toBe(false);
    const lia = await novoJogador();
    // Um jogo do catálogo, que abre e tem mundo, mas sem cliente no portal: não tem página.
    const mundoSemCliente = await mundoDe(lia, SEM_CLIENTE);
    expect(await prepararPaginaDoJogo(lia.perfil.id, SEM_CLIENTE, mundoSemCliente)).toEqual({
      tipo: "inexistente",
    });
    // O Morada tem cliente: a página dele abre com o mundo dele.
    const mundoDoMorada = await mundoDe(lia, MORADA, "Casa da Lia");
    expect(await prepararPaginaDoJogo(lia.perfil.id, MORADA, mundoDoMorada)).toEqual({
      tipo: "pronto",
      jogo: { id: MORADA, nome: "Morada", origemDaArte: null },
      mundo: { id: mundoDoMorada, nome: "Casa da Lia" },
    });
  });

  it("entrega o jogo e o mundo, e nada de quem joga", async () => {
    const lia = await novoJogador();
    const mundo = await mundoDe(lia, TESTE, "Casa azul");
    const pagina = await prepararPaginaDoJogo(lia.perfil.id, TESTE, mundo);
    expect(pagina).toEqual({
      tipo: "pronto",
      jogo: { id: TESTE, nome: "Jogo de teste", origemDaArte: null },
      mundo: { id: mundo, nome: "Casa azul" },
    });
    const escrito = JSON.stringify(pagina);
    expect(escrito).not.toContain(lia.perfil.id);
    expect(escrito).not.toContain(lia.conta.id);
    expect(escrito).not.toContain(lia.conta.email);
    expect(escrito).not.toContain(lia.perfil.apelido);
  });

  it("sem o direito de jogar manda para a estante, antes de olhar o mundo", async () => {
    const semAcesso = await novoJogador({ comAcesso: false });
    const lia = await novoJogador();
    const mundo = await mundoDe(lia, TESTE);
    expect(await prepararPaginaDoJogo(semAcesso.perfil.id, TESTE, mundo)).toEqual({
      tipo: "sem_acesso",
    });
    expect(await prepararPaginaDoJogo(semAcesso.perfil.id, TESTE, undefined)).toEqual({
      tipo: "sem_acesso",
    });
    // Quem perdeu o acesso continua membro do mundo, mas não entra no jogo.
    await revogar({ email: lia.conta.email, motivo: "teste" });
    expect(await prepararPaginaDoJogo(lia.perfil.id, TESTE, mundo)).toEqual({
      tipo: "sem_acesso",
    });
  });

  it.each([undefined, "", ["a", "b"]])(
    "sem dizer o mundo (%j) volta para a estante",
    async (mundo) => {
      const lia = await novoJogador();
      expect(await prepararPaginaDoJogo(lia.perfil.id, TESTE, mundo)).toEqual({
        tipo: "sem_mundo",
      });
    },
  );

  it("mundo de outra pessoa, de outro jogo, inexistente ou com id sem forma: a mesma resposta", async () => {
    const lia = await novoJogador();
    const outra = await novoJogador({ apelido: "Rui" });
    const deOutraPessoa = await mundoDe(outra, TESTE);
    const deOutroJogo = await mundoDe(lia, MORADA);
    const respostas = await Promise.all(
      [deOutraPessoa, deOutroJogo, randomUUID(), "nao-e-um-id", "' or 1=1 --"].map((mundo) =>
        prepararPaginaDoJogo(lia.perfil.id, TESTE, mundo),
      ),
    );
    for (const resposta of respostas)
      expect(resposta).toEqual({
        tipo: "mundo_indisponivel",
        jogo: { id: TESTE, nome: "Jogo de teste" },
      });
  });
});
