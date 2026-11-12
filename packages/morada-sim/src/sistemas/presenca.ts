import type { FamiliaId, PerfilId, SessaoId } from "../dominio/ids";
import type { Permissao } from "../dominio/permissoes";
import { listar } from "../dominio/tabela";
import type {
  EstadoDoMundo,
  Morador,
  MotivoDeRecusa,
  Presenca,
  Sessao,
  Velocidade,
} from "../dominio/tipos";
import { type Contexto, tocarChave } from "./contexto";

/**
 * Presença: quem está conectado, quem dirige quem e o acordo de velocidade.
 * É estado de sessão. Nada daqui é gravado no morador nem na fotografia, e
 * tudo é refeito quando o mundo volta.
 *
 * Escolher um morador é pedir uma reserva curta. No máximo um jogador dirige
 * cada morador; quando a conexão cai, a reserva espera a volta por uma janela
 * e depois é liberada, e a autonomia segue com a fila intacta.
 */

export function permissoesDe(
  estado: EstadoDoMundo,
  perfilId: PerfilId,
  familiaId: FamiliaId | null,
): readonly Permissao[] {
  if (familiaId === null) return [];
  return (
    estado.acessos.find((acesso) => acesso.perfilId === perfilId && acesso.familiaId === familiaId)
      ?.permissoes ?? []
  );
}

export function temPermissao(
  estado: EstadoDoMundo,
  perfilId: PerfilId,
  familiaId: FamiliaId | null,
  permissao: Permissao,
): boolean {
  return permissoesDe(estado, perfilId, familiaId).includes(permissao);
}

export function sessaoDe(presenca: Presenca, sessaoId: SessaoId): Sessao | undefined {
  return presenca.sessoes.find((sessao) => sessao.sessaoId === sessaoId);
}

/** Perfis conectados agora, sem contar quem caiu e ainda pode voltar. */
export function perfisPresentes(presenca: Presenca): PerfilId[] {
  const perfis: PerfilId[] = [];
  for (const sessao of presenca.sessoes) {
    if (sessao.estado === "presente" && !perfis.includes(sessao.perfilId)) {
      perfis.push(sessao.perfilId);
    }
  }
  return perfis;
}

function definirVelocidade(ctx: Contexto, velocidade: Velocidade): void {
  if (ctx.estado.relogio.velocidade !== velocidade) {
    ctx.estado.relogio.velocidade = velocidade;
    tocarChave(ctx, "relogio");
  }
}

/** Refaz o acordo de velocidade depois que alguém entrou, saiu ou votou. */
function conferirVoto(ctx: Contexto): void {
  const presentes = perfisPresentes(ctx.presenca);
  const voto = ctx.presenca.voto;
  if (voto) {
    voto.aFavor = voto.aFavor.filter((perfil) => presentes.includes(perfil));
    if (presentes.length > 0 && presentes.every((perfil) => voto.aFavor.includes(perfil))) {
      definirVelocidade(ctx, voto.velocidade);
      ctx.presenca.voto = null;
    }
    tocarChave(ctx, "presenca");
  }
}

function removerSessao(ctx: Contexto, sessaoId: SessaoId): void {
  const antes = ctx.presenca.sessoes.length;
  ctx.presenca.sessoes = ctx.presenca.sessoes.filter((sessao) => sessao.sessaoId !== sessaoId);
  ctx.presenca.reservas = ctx.presenca.reservas.filter((reserva) => reserva.sessaoId !== sessaoId);
  if (ctx.presenca.sessoes.length !== antes) tocarChave(ctx, "presenca");
  conferirVoto(ctx);
}

export function sessaoEntrou(
  ctx: Contexto,
  sessaoId: SessaoId,
  perfilId: PerfilId,
  apelido?: string,
): void {
  // Um perfil tem uma conexão só: a nova toma o lugar da antiga.
  for (const antiga of [...ctx.presenca.sessoes]) {
    if (antiga.perfilId === perfilId && antiga.sessaoId !== sessaoId) {
      removerSessao(ctx, antiga.sessaoId);
    }
  }
  const existente = sessaoDe(ctx.presenca, sessaoId);
  if (existente) {
    existente.estado = "presente";
    existente.ateMs = null;
    if (apelido !== undefined) existente.apelido = apelido;
  } else {
    ctx.presenca.sessoes.push({
      sessaoId,
      perfilId,
      apelido: apelido ?? null,
      estado: "presente",
      ateMs: null,
    });
  }
  tocarChave(ctx, "presenca");

  // Quem chega não concordou com a velocidade em vigor: volta ao normal.
  if (perfisPresentes(ctx.presenca).length > 1 && ctx.estado.relogio.velocidade !== 1) {
    definirVelocidade(ctx, 1);
    ctx.presenca.voto = null;
  }

  // O preferido, se estiver livre, já vem com a pessoa.
  const jaDirige = ctx.presenca.reservas.some((reserva) => reserva.sessaoId === sessaoId);
  if (jaDirige) return;
  for (const morador of listar(ctx.estado.moradores)) {
    if (morador.preferidoDe !== perfilId) continue;
    if (reservar(ctx, sessaoId, morador) === null) break;
  }
}

/** A conexão caiu sem aviso. A reserva espera a volta por uma janela. */
export function sessaoCaiu(ctx: Contexto, sessaoId: SessaoId, agoraMs: number): void {
  const sessao = sessaoDe(ctx.presenca, sessaoId);
  if (!sessao || sessao.estado === "em_graca") return;
  sessao.estado = "em_graca";
  sessao.ateMs = agoraMs + ctx.estado.regras.janelaDeGracaMs;
  tocarChave(ctx, "presenca");
  conferirVoto(ctx);
}

export function sessaoVoltou(ctx: Contexto, sessaoId: SessaoId, apelido?: string): boolean {
  const sessao = sessaoDe(ctx.presenca, sessaoId);
  if (!sessao) return false;
  sessao.estado = "presente";
  sessao.ateMs = null;
  if (apelido !== undefined) sessao.apelido = apelido;
  tocarChave(ctx, "presenca");
  return true;
}

export function sessaoSaiu(ctx: Contexto, sessaoId: SessaoId): void {
  removerSessao(ctx, sessaoId);
}

/** Libera as reservas de quem caiu e não voltou a tempo. As filas ficam como estão. */
export function expirarSessoes(ctx: Contexto, agoraMs: number): void {
  for (const sessao of [...ctx.presenca.sessoes]) {
    if (sessao.estado === "em_graca" && sessao.ateMs !== null && sessao.ateMs <= agoraMs) {
      removerSessao(ctx, sessao.sessaoId);
    }
  }
}

/** Reserva o controle de um morador para a sessão. Devolve o motivo se não puder. */
export function reservar(
  ctx: Contexto,
  sessaoId: SessaoId,
  morador: Morador,
): MotivoDeRecusa | null {
  const sessao = sessaoDe(ctx.presenca, sessaoId);
  if (!sessao) return "sem_sessao";
  if (!temPermissao(ctx.estado, sessao.perfilId, morador.familiaId, "comandar"))
    return "sem_acesso";
  const atual = ctx.presenca.reservas.find((reserva) => reserva.moradorId === morador.id);
  if (atual && atual.sessaoId !== sessaoId) return "reservado_por_outro";
  // Uma sessão dirige um morador por vez: escolher outro solta o anterior.
  ctx.presenca.reservas = ctx.presenca.reservas.filter((reserva) => reserva.sessaoId !== sessaoId);
  ctx.presenca.reservas.push({ moradorId: morador.id, perfilId: sessao.perfilId, sessaoId });
  tocarChave(ctx, "presenca");
  return null;
}

export function liberar(ctx: Contexto, sessaoId: SessaoId): void {
  const antes = ctx.presenca.reservas.length;
  ctx.presenca.reservas = ctx.presenca.reservas.filter((reserva) => reserva.sessaoId !== sessaoId);
  if (ctx.presenca.reservas.length !== antes) tocarChave(ctx, "presenca");
}

/**
 * Voto de velocidade. Sozinho, pausar e acelerar valem na hora. Com mais
 * gente presente, precisam do acordo de todos. Voltar ao ritmo normal nunca
 * precisa de acordo.
 */
export function votarVelocidade(
  ctx: Contexto,
  sessaoId: SessaoId,
  velocidade: Velocidade,
): MotivoDeRecusa | null {
  const sessao = sessaoDe(ctx.presenca, sessaoId);
  if (sessao?.estado !== "presente") return "sem_sessao";
  const presentes = perfisPresentes(ctx.presenca);
  if (velocidade === 1 || presentes.length <= 1) {
    definirVelocidade(ctx, velocidade);
    if (ctx.presenca.voto) {
      ctx.presenca.voto = null;
      tocarChave(ctx, "presenca");
    }
    return null;
  }
  const voto = ctx.presenca.voto;
  if (voto && voto.velocidade === velocidade) {
    if (!voto.aFavor.includes(sessao.perfilId)) voto.aFavor.push(sessao.perfilId);
  } else {
    ctx.presenca.voto = { velocidade, aFavor: [sessao.perfilId] };
  }
  tocarChave(ctx, "presenca");
  conferirVoto(ctx);
  // O voto foi registrado. Se ainda falta alguém concordar, ele fica à vista de
  // todos em `presenca.voto` e a velocidade só muda quando o acordo fechar.
  return null;
}
