import { GeracaoDaObraSchema, type ReferenciaDaTrava } from "../comandos/obra";
import type { FamiliaId, LoteId, ObjetoId, PerfilId, SessaoId } from "../dominio/ids";
import { canonico, copiar } from "../nucleo/canonico";

export const PRAZO_DA_TRAVA_DE_EDICAO_MS = 15_000;
export const TRAVAS_DE_EDICAO_POR_MUNDO = 16;

/** Derivado pelo host da operação/planta; nunca aceitar caixas livres do cliente. */
export type AlvoDaObra = {
  familiaId: FamiliaId;
  loteId: LoteId;
  peca: { id: ObjetoId; revisao: number } | null;
  regioes: readonly {
    andar: number;
    retangulo: readonly [number, number, number, number];
  }[];
};
export type EscopoDaObra = { perfilId: PerfilId; sessaoId: SessaoId };
export type { ReferenciaDaTrava } from "../comandos/obra";
export type ConcessaoPublicaDaObra = {
  referencia: ReferenciaDaTrava;
  alvo: AlvoDaObra;
  prazoMs: number;
};
export type TravaDaObra = EscopoDaObra & {
  referencia: ReferenciaDaTrava;
  alvo: AlvoDaObra;
  ateMs: number;
};
export type RegistroDeTravas = {
  geracao: string;
  numero: number;
  agoraMs: number;
  travas: TravaDaObra[];
};
export type ResultadoDaTrava =
  | { ok: true; mudou: boolean; concessao: TravaDaObra }
  | { ok: false; mudou: boolean; motivo: "ocupado" | "limite" | "trava_perdida" };

/** A geração vem do host em cada montagem; nada deste registro vai à fotografia. */
export function criarRegistroDeTravas(geracao: string): RegistroDeTravas {
  if (!GeracaoDaObraSchema.safeParse(geracao).success) throw new Error("Geração de obra inválida");
  return { geracao, numero: 0, agoraMs: 0, travas: [] };
}

function conferirEscopo(escopo: EscopoDaObra): void {
  if (
    !/^[A-Za-z0-9_-]{1,44}$/.test(escopo.perfilId) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(escopo.sessaoId)
  )
    throw new Error("Escopo de obra inválido");
}

function conferirAlvo(alvo: AlvoDaObra): void {
  if (
    !/^fam_[A-Za-z0-9_-]{1,64}$/.test(alvo.familiaId) ||
    !/^lote_[A-Za-z0-9_-]{1,64}$/.test(alvo.loteId) ||
    alvo.regioes.length < 1 ||
    alvo.regioes.length > 2
  )
    throw new Error("Alvo de obra inválido");
  if (
    alvo.peca &&
    (!/^obj_[A-Za-z0-9_-]{1,64}$/.test(alvo.peca.id) ||
      !Number.isSafeInteger(alvo.peca.revisao) ||
      alvo.peca.revisao < 1)
  )
    throw new Error("Peça de obra inválida");
  for (const regiao of alvo.regioes) {
    const [x0, y0, x1, y1] = regiao.retangulo;
    if (
      !Number.isInteger(regiao.andar) ||
      regiao.andar < 0 ||
      regiao.andar > 2 ||
      regiao.retangulo.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 1_000_000) ||
      x0 >= x1 ||
      y0 >= y1
    )
      throw new Error("Região de obra inválida");
  }
}

/** Tempo monotônico entregue pelo host; expira inclusive com o jogo pausado. */
export function expirarTravas(registro: RegistroDeTravas, agoraMs: number): boolean {
  if (!Number.isSafeInteger(agoraMs) || agoraMs < registro.agoraMs)
    throw new Error("Relógio monotônico de obra inválido");
  registro.agoraMs = agoraMs;
  const antes = registro.travas.length;
  registro.travas = registro.travas.filter((trava) => trava.ateMs > agoraMs);
  return antes !== registro.travas.length;
}

export function alvosDaObraConflitam(a: AlvoDaObra, b: AlvoDaObra): boolean {
  if (a.loteId !== b.loteId) return false;
  if (a.peca && b.peca && a.peca.id === b.peca.id) return true;
  return a.regioes.some((x) =>
    b.regioes.some((y) => {
      if (x.andar !== y.andar) return false;
      const [ax0, ay0, ax1, ay1] = x.retangulo;
      const [bx0, by0, bx1, by1] = y.retangulo;
      return ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1;
    }),
  );
}

function propria(trava: TravaDaObra, escopo: EscopoDaObra): boolean {
  return trava.perfilId === escopo.perfilId && trava.sessaoId === escopo.sessaoId;
}

function encontrar(registro: RegistroDeTravas, escopo: EscopoDaObra, ref: ReferenciaDaTrava) {
  return registro.travas.find(
    (trava) =>
      propria(trava, escopo) &&
      trava.referencia.geracao === ref.geracao &&
      trava.referencia.numero === ref.numero,
  );
}

/** Autorização e derivação do alvo pertencem ao chamador, antes desta admissão. */
export function adquirirTrava(
  registro: RegistroDeTravas,
  agoraMs: number,
  escopo: EscopoDaObra,
  alvo: AlvoDaObra,
): ResultadoDaTrava {
  conferirEscopo(escopo);
  conferirAlvo(alvo);
  const mudou = expirarTravas(registro, agoraMs);
  const anterior = registro.travas.find((trava) => trava.perfilId === escopo.perfilId);
  if (anterior && propria(anterior, escopo) && canonico(anterior.alvo) === canonico(alvo))
    return { ok: true, mudou, concessao: copiar(anterior) };
  if (
    registro.travas.some(
      (trava) => trava.perfilId !== escopo.perfilId && alvosDaObraConflitam(trava.alvo, alvo),
    )
  )
    return { ok: false, mudou, motivo: "ocupado" };
  const numero = registro.numero + 1;
  const ateMs = agoraMs + PRAZO_DA_TRAVA_DE_EDICAO_MS;
  if (
    !Number.isSafeInteger(numero) ||
    !Number.isSafeInteger(ateMs) ||
    (!anterior && registro.travas.length >= TRAVAS_DE_EDICAO_POR_MUNDO)
  )
    return { ok: false, mudou, motivo: "limite" };
  const concessao: TravaDaObra = {
    ...escopo,
    referencia: { geracao: registro.geracao, numero },
    alvo: copiar(alvo),
    ateMs,
  };
  registro.travas = registro.travas.filter((trava) => trava.perfilId !== escopo.perfilId);
  registro.travas.push(concessao);
  registro.numero = numero;
  return { ok: true, mudou: true, concessao: copiar(concessao) };
}

export function renovarTrava(
  registro: RegistroDeTravas,
  agoraMs: number,
  escopo: EscopoDaObra,
  referencia: ReferenciaDaTrava,
): ResultadoDaTrava {
  conferirEscopo(escopo);
  const mudou = expirarTravas(registro, agoraMs);
  const trava = encontrar(registro, escopo, referencia);
  if (!trava) return { ok: false, mudou, motivo: "trava_perdida" };
  const ateMs = agoraMs + PRAZO_DA_TRAVA_DE_EDICAO_MS;
  if (!Number.isSafeInteger(ateMs)) return { ok: false, mudou, motivo: "limite" };
  const renovou = trava.ateMs !== ateMs;
  trava.ateMs = ateMs;
  return { ok: true, mudou: mudou || renovou, concessao: copiar(trava) };
}

export function conferirTrava(
  registro: RegistroDeTravas,
  agoraMs: number,
  escopo: EscopoDaObra,
  referencia: ReferenciaDaTrava,
  alvo: AlvoDaObra,
): { valida: boolean; mudou: boolean } {
  conferirEscopo(escopo);
  conferirAlvo(alvo);
  const mudou = expirarTravas(registro, agoraMs);
  const trava = encontrar(registro, escopo, referencia);
  return { valida: !!trava && canonico(trava.alvo) === canonico(alvo), mudou };
}

export function liberarTrava(
  registro: RegistroDeTravas,
  escopo: EscopoDaObra,
  referencia: ReferenciaDaTrava,
): boolean {
  const trava = encontrar(registro, escopo, referencia);
  if (!trava) return false;
  registro.travas = registro.travas.filter((item) => item !== trava);
  return true;
}

export function liberarTravasDaSessao(registro: RegistroDeTravas, sessaoId: SessaoId): boolean {
  const antes = registro.travas.length;
  registro.travas = registro.travas.filter((trava) => trava.sessaoId !== sessaoId);
  return antes !== registro.travas.length;
}

export function liberarTravasDoPerfil(
  registro: RegistroDeTravas,
  perfilId: PerfilId,
  familiaId: FamiliaId,
): boolean {
  const antes = registro.travas.length;
  registro.travas = registro.travas.filter(
    (trava) => trava.perfilId !== perfilId || trava.alvo.familiaId !== familiaId,
  );
  return antes !== registro.travas.length;
}
