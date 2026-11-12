import "server-only";
import type { LimitesDoJogo } from "@informach/config/jogos";
import { ErroDoRecreio } from "@informach/recreio";
import { env } from "@/lib/env";
import { catalogoDosJogos, type ManifestoDoJogo, manifestoNoCatalogo } from "./catalogo";

export type { ManifestoDoJogo } from "./catalogo";

/**
 * O que o Recreio sabe de cada jogo na hora de atender um pedido: o manifesto
 * do catálogo (`@informach/config/jogos`) e a configuração do deploy (segredo
 * da API das instâncias e origens). Sessões, mundos e posse perguntam aqui, e
 * não ao catálogo ou ao ambiente direto.
 *
 * Com `RECREIO_JOGO_DE_TESTE=1` (nunca em produção) o catálogo ganha o jogo de
 * teste de `catalogo.ts`. Sem a variável ele não existe para ninguém: ingresso,
 * mundos, instâncias e `/jogar/teste` respondem como a um jogo desconhecido.
 */

const COM_JOGO_DE_TESTE = env.RECREIO_JOGO_DE_TESTE === "1";

/** Estados de publicação em que o jogo não abre para ninguém. */
const FECHADOS: readonly ManifestoDoJogo["estado"][] = ["em_breve", "manutencao", "aposentado"];

/** Os jogos deste deploy, na ordem do catálogo. */
export function jogosDoCatalogo(): readonly ManifestoDoJogo[] {
  return catalogoDosJogos(COM_JOGO_DE_TESTE);
}

export function manifestoDoJogo(jogo: string): ManifestoDoJogo | null {
  return manifestoNoCatalogo(jogo, COM_JOGO_DE_TESTE);
}

/** O manifesto de um jogo que existe, ou `JOGO_INDISPONIVEL`. */
export function jogoDoCatalogo(jogo: string): ManifestoDoJogo {
  const manifesto = manifestoDoJogo(jogo);
  if (!manifesto) throw new ErroDoRecreio("JOGO_INDISPONIVEL");
  return manifesto;
}

/**
 * O jogo existe e está num estado em que abre. Isto não é direito de jogar:
 * quem decide se o perfil joga é `avaliarAcesso`.
 */
export function jogoQueAbre(jogo: string): ManifestoDoJogo {
  const manifesto = jogoDoCatalogo(jogo);
  if (FECHADOS.includes(manifesto.estado)) throw new ErroDoRecreio("JOGO_INDISPONIVEL");
  return manifesto;
}

/** Se o jogo existe e abre, sem lançar: para as telas decidirem o que mostrar. */
export function jogoAbre(jogo: string): boolean {
  const manifesto = manifestoDoJogo(jogo);
  return manifesto !== null && !FECHADOS.includes(manifesto.estado);
}

export function limitesDoJogo(jogo: string): LimitesDoJogo {
  return jogoDoCatalogo(jogo).limites;
}

/** A política de mundo pedida, se o jogo a oferece; senão a padrão do manifesto. */
export function politicaDeMundo(manifesto: ManifestoDoJogo, pedida: string | undefined): string {
  const politicas = manifesto.politicasDeMundo ?? [];
  const escolhida =
    politicas.find((politica) => politica.id === pedida) ??
    politicas.find((politica) => politica.padrao) ??
    politicas[0];
  return escolhida?.id ?? "padrao";
}

/** O segredo do jogo na API das instâncias, ou `null` se o jogo não tem instâncias configuradas. */
export function segredoDoHost(jogo: string): string | null {
  return Object.hasOwn(env.RECREIO_HOST_SECRETS, jogo)
    ? (env.RECREIO_HOST_SECRETS[jogo] ?? null)
    : null;
}

export function origensDoJogo(jogo: string): { ws: string; assets?: string } | null {
  return Object.hasOwn(env.RECREIO_GAME_ORIGINS, jogo)
    ? (env.RECREIO_GAME_ORIGINS[jogo] ?? null)
    : null;
}

/** Esquema e host de um endereço sem caminho, ou `null` se não for um. */
function origem(url: string): string | null {
  try {
    const lida = new URL(url);
    if (lida.pathname !== "/" || lida.search || lida.hash) return null;
    return `${lida.protocol}//${lida.host}`;
  } catch {
    return null;
  }
}

/**
 * Uma instância só se registra com o endereço público configurado para o jogo
 * (`RECREIO_GAME_ORIGINS[jogo].ws`): é para lá que o Recreio manda o navegador
 * de quem abre um mundo.
 */
export function enderecoDaInstanciaAceito(jogo: string, urlPublica: string): boolean {
  const configurada = origensDoJogo(jogo)?.ws;
  const pedida = origem(urlPublica);
  return configurada !== undefined && pedida !== null && pedida === origem(configurada);
}
