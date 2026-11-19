import { z } from "zod";
import { comandoDeEdicao } from "../comandos/identidade-da-edicao";
import { verificarInvariantes } from "../dominio/invariantes";
import { listar, obter } from "../dominio/tabela";
import type { EstadoDoMundo } from "../dominio/tipos";
import { FOTOGRAFIA_ABERTA_MAX_BYTES } from "../formatos/limites";
import { copiar } from "../nucleo/canonico";

/** Não é um perfil emitido pelo Recreio nem concede autoridade no jogo. O
 * recibo de fundação permanece para impedir fundar de novo o mesmo mundo. */
const AUTOR_RETIRADO = "perfil-retirado";
const COMANDO_RETIRADO = "fundacao-sem-autoria-pessoal";
const PerfilSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,44}$/)
  .refine((p) => p !== AUTOR_RETIRADO);
export class FalhaDaRetiradaDoMorada extends Error {
  constructor(
    readonly codigo: "INTEGRIDADE" | "LIMITE" | "TEXTOS_DA_FUNDACAO" | "REFERENCIA_REMANESCENTE",
  ) {
    super(`morada.privacy.${codigo}`);
  }
}
function conferir(estado: EstadoDoMundo) {
  if (estado.versao !== 3 || verificarInvariantes(estado).length)
    throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
}
function conferirAusencia(estado: EstadoDoMundo, perfis: readonly string[]) {
  // Detecção conservadora, nunca substituição genérica de UUID/texto. Campos
  // desconhecidos ou texto com referência não tratada impedem concluir.
  let texto: string;
  try {
    texto = JSON.stringify(estado);
  } catch {
    throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
  }
  if (texto.length > FOTOGRAFIA_ABERTA_MAX_BYTES) throw new FalhaDaRetiradaDoMorada("LIMITE");
  if (new RegExp(perfis.join("|")).test(texto))
    throw new FalhaDaRetiradaDoMorada("REFERENCIA_REMANESCENTE");
}
function edicaoDosPerfis(comandoId: string, perfis: ReadonlySet<string>): boolean {
  const partes = /^obra:([0-9a-z]+):([A-Za-z0-9_-]{1,44})$/.exec(comandoId);
  const perfilId = partes?.[2];
  if (!perfilId || !perfis.has(perfilId) || !partes?.[1]) return false;
  const sequencia = Number.parseInt(partes[1], 36);
  return (
    Number.isSafeInteger(sequencia) &&
    sequencia > 0 &&
    comandoDeEdicao(perfilId, sequencia) === comandoId
  );
}
function incrementar(versao: number): number {
  if (!Number.isSafeInteger(versao) || versao < 1 || versao >= Number.MAX_SAFE_INTEGER)
    throw new FalhaDaRetiradaDoMorada("LIMITE");
  return versao + 1;
}

/** Transformação pura de um estado já restaurado e validado. Não persiste,
 * toma posse, lê banco, revoga sessão nem autoriza tráfego. A composição deve
 * cercar o mundo e tratar fotografias/diário/objetos/backup antes de aplicar.
 * Textos de fundação exigem decisão explícita no plano consentido. */
export function prepararRetiradaPessoalDoMorada(
  estado: EstadoDoMundo,
  perfilBruto: string,
  politica: { retirarTextosDaFundacao: boolean },
) {
  return prepararRetiradaDePerfisDoMorada(estado, [perfilBruto], politica);
}

/** One bounded pass for the complete original selection. The set prevents
 * releasing a shared photo between successive profiles of the same closure. */
export function prepararRetiradaDePerfisDoMorada(
  estado: EstadoDoMundo,
  perfisBrutos: readonly string[],
  politica: { retirarTextosDaFundacao: boolean },
) {
  const ids = z.array(PerfilSchema).min(1).max(256).parse(perfisBrutos);
  const perfis = new Set(ids);
  if (perfis.size !== ids.length) throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
  conferir(estado);
  const novo = copiar(estado);
  const alterados = new Set<string>();
  const comandoDaFundacao =
    novo.fundacao && perfis.has(novo.fundacao.autor) ? novo.fundacao.comandoId : null;
  if (comandoDaFundacao !== null && !politica.retirarTextosDaFundacao)
    throw new FalhaDaRetiradaDoMorada("TEXTOS_DA_FUNDACAO");
  novo.acessos = novo.acessos.filter((a) => !perfis.has(a.perfilId));
  for (const morador of listar(novo.moradores)) {
    if (morador.preferidoDe !== undefined && perfis.has(morador.preferidoDe)) {
      delete morador.preferidoDe;
      alterados.add(morador.id);
    }
  }
  for (const pedido of listar(novo.pedidos))
    if (pedido.autor !== null && perfis.has(pedido.autor)) pedido.autor = null;
  novo.edicoes = novo.edicoes.filter((e) => !perfis.has(e.autor));
  novo.historicoDaCasa = novo.historicoDaCasa.filter((p) => !perfis.has(p.autor));
  novo.comandos = novo.comandos.filter(
    (c) => c.comandoId !== comandoDaFundacao && !edicaoDosPerfis(c.comandoId, perfis),
  );
  const fundacao = novo.fundacao;
  if (fundacao && perfis.has(fundacao.autor)) {
    const familia = obter(novo.familias, fundacao.familiaId);
    if (!familia) throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
    if (familia.nome !== "Família") {
      familia.nome = "Família";
      familia.versao = incrementar(familia.versao);
    }
    // O recibo durável relaciona os IDs originalmente nomeados pelo fundador;
    // mudança posterior de família não perde a proveniência desses nomes.
    for (const morador of listar(novo.moradores)) {
      if (!Object.hasOwn(fundacao.resultado.versoes, morador.id)) continue;
      const nome = `Morador ${morador.id.slice(4)}`;
      if (morador.nome !== nome) {
        morador.nome = nome;
        alterados.add(morador.id);
      }
    }
    fundacao.autor = AUTOR_RETIRADO;
    fundacao.comandoId = COMANDO_RETIRADO;
    fundacao.resultado.comandoId = COMANDO_RETIRADO;
  }
  for (const morador of listar(novo.moradores))
    if (alterados.has(morador.id)) morador.versao = incrementar(morador.versao);
  conferir(novo);
  conferirAusencia(novo, ids);
  return novo;
}
