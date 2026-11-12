import { and, db, eq, isNull } from "@informach/db";
import { recreioSpaceLeases as leases } from "@informach/db/schema";
import {
  type InstanciaId,
  type MundoId,
  MundoIdSchema,
  type SessaoDeJogoId,
  SessaoDeJogoIdSchema,
} from "@informach/recreio";
import {
  CABECALHO_DA_INSTANCIA,
  CABECALHO_DO_JOGO,
  type ClienteDoHost,
  SessaoAbertaSchema,
} from "@informach/recreio/contrato";
import { criarClienteDoHost } from "@informach/recreio/host";
import { origensDoJogo, segredoDoHost } from "@/features/jogos/config";
import { criarMundo } from "@/features/mundos/service";
import { emitirIngresso } from "@/features/sessao-de-jogo/service";
import type { Jogador } from "./apoio";
import { despachar, ORIGEM, pedir } from "./rotas";

/**
 * Apoio dos testes de sessão de jogo, mundos e posse: os passos que o
 * navegador e o servidor de um jogo dão, feitos pelas rotas de verdade.
 */

export const MORADA = "morada";
/** O segundo jogo dos testes: tem segredo e origem no ambiente e entra no catálogo por `vi.mock`. */
export const OUTRO_JOGO = "jogo-de-teste";

/** As claims de um token, sem conferir a assinatura: só para o teste olhar o que vai dentro. */
export function claimsDe(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
}

/** O ingresso do perfil ativo, como `POST /api/sdk/v1/ingresso` o emitiria com o cookie. */
export async function ingressoDe(jogador: Jogador, jogo = MORADA): Promise<string> {
  return (await emitirIngresso(jogador.ator, { jogo })).ingresso;
}

export type SessaoDeTeste = { token: string; sid: SessaoDeJogoId };

/** Ingresso e troca pela rota: a sessão de jogo como o SDK a recebe. */
export async function entrarNoJogo(
  jogador: Jogador,
  jogo = MORADA,
  opcoes: { continuarAqui?: boolean } = {},
): Promise<SessaoDeTeste> {
  const resposta = await pedir("POST", "/api/sdk/v1/sessao", {
    corpo: { ingresso: await ingressoDe(jogador, jogo), ...opcoes },
  });
  if (resposta.status !== 200)
    throw new Error(`A troca do ingresso falhou: ${JSON.stringify(resposta)}`);
  const aberta = SessaoAbertaSchema.parse(resposta.corpo);
  return { token: aberta.token, sid: SessaoDeJogoIdSchema.parse(claimsDe(aberta.token).sid) };
}

/** Um mundo criado pelo jogador, pelo serviço que o portal e o SDK usam. */
export async function mundoDe(jogador: Jogador, jogo = MORADA, nome = "Casa de teste") {
  const mundo = await criarMundo({ perfilId: jogador.perfil.id, jogo }, { nome });
  return MundoIdSchema.parse(mundo.id);
}

function segredo(jogo: string): string {
  const valor = segredoDoHost(jogo);
  if (!valor) throw new Error(`Jogo sem segredo no ambiente de teste: ${jogo}`);
  return valor;
}

/** O endereço público configurado para as instâncias do jogo. */
export function enderecoDo(jogo: string): string {
  const origens = origensDoJogo(jogo);
  if (!origens) throw new Error(`Jogo sem origem no ambiente de teste: ${jogo}`);
  return origens.ws;
}

/** O cliente HTTP de verdade, com as rotas chamadas no processo. */
export function clienteDoHost(jogo = MORADA): ClienteDoHost {
  return criarClienteDoHost({ baseUrl: ORIGEM, jogo, segredo: segredo(jogo), fetch: despachar });
}

export type InstanciaDeTeste = { cliente: ClienteDoHost; instanciaId: InstanciaId; jogo: string };

/** Uma instância registrada no endereço configurado do jogo. */
export async function novaInstancia(jogo = MORADA, capacidade = 10): Promise<InstanciaDeTeste> {
  const cliente = clienteDoHost(jogo);
  const { instanciaId } = await cliente.registrar({
    urlPublica: enderecoDo(jogo),
    versao: "teste",
    capacidade,
  });
  return { cliente, instanciaId, jogo };
}

/** Os cabeçalhos de um pedido cru à API das instâncias. */
export function cabecalhosDoHost(
  jogo: string,
  instanciaId?: string,
  outroSegredo?: string,
): Record<string, string> {
  return {
    authorization: `Bearer ${outroSegredo ?? segredo(jogo)}`,
    [CABECALHO_DO_JOGO]: jogo,
    ...(instanciaId === undefined ? {} : { [CABECALHO_DA_INSTANCIA]: instanciaId }),
  };
}

/** Abre o mundo pela rota do SDK, com a sessão de jogo. */
export function abrirPelaRota(sessao: SessaoDeTeste, mundoId: string) {
  return pedir("POST", `/api/sdk/v1/mundos/${mundoId}/abrir`, { token: sessao.token });
}

/** As posses abertas de um mundo: tem de ser no máximo uma. */
export function possesAbertas(mundoId: MundoId) {
  return db
    .select({
      id: leases.id,
      fence: leases.fence,
      instanceId: leases.instanceId,
      state: leases.state,
      playerSeconds: leases.playerSeconds,
      peakPlayers: leases.peakPlayers,
    })
    .from(leases)
    .where(and(eq(leases.spaceId, mundoId), isNull(leases.releasedAt)));
}

/** Espera um evento gravado fora da transação (as recusas) aparecer. */
export async function esperar<T>(buscar: () => Promise<T[]>, minimo = 1): Promise<T[]> {
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const achados = await buscar();
    if (achados.length >= minimo) return achados;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return buscar();
}
