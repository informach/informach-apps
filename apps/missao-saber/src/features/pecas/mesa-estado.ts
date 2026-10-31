import {
  celulasNaPose,
  espelharPlano,
  girar3,
  girarPlano,
  giroX,
  giroY,
  giroZ,
  partesNaPose,
  pecasSeSobrepoem,
  verticesNaPose,
} from "./geometria";
import {
  type Desafio,
  type DesafioLivrePlano,
  ehMalha,
  type Montagem,
  type PecaMalha,
  type PecaPlana,
  type Ponto,
  type PoseMalha,
  type PosePlana,
  type PoseSolida,
} from "./tipos";

/**
 * Estado da mesa como função pura: a cena 3D e o teclado só disparam ações.
 * Assim o mesmo comportamento vale no toque, no mouse, no teclado e nos testes.
 */
export type EstadoMesa = { montagem: Montagem; selecionada: string | null; movimentos: number };

export type Acao =
  | { tipo: "selecionar"; id: string | null }
  | { tipo: "mover"; dx: number; dy: number; dz?: number }
  | { tipo: "girar"; sentido: 1 | -1 }
  | { tipo: "girarEixo"; eixo: "x" | "y" }
  | { tipo: "virar" }
  | { tipo: "arrastar"; id: string; x: number; y: number }
  | { tipo: "soltar"; id: string }
  | { tipo: "definir"; montagem: Montagem };

/** Passos do teclado e do encaixe. */
export const PASSO_LIVRE = 0.1;
export const PASSO_SOLIDO = 0.5;
const IMA = 0.15;

export function estadoInicial(montagem: Montagem): EstadoMesa {
  return { montagem, selecionada: null, movimentos: 0 };
}

const arredondar = (v: number, passo: number) => Math.round(v / passo) * passo;
const limpar = (v: number) => Math.round(v * 1000) / 1000;

export function mesa(desafio: Desafio, estado: EstadoMesa, acao: Acao): EstadoMesa {
  if (acao.tipo === "selecionar") return { ...estado, selecionada: acao.id };
  if (acao.tipo === "definir") return { ...estado, montagem: acao.montagem };
  const id = acao.tipo === "arrastar" || acao.tipo === "soltar" ? acao.id : estado.selecionada;
  if (!id) return estado;
  const montagem = aplicar(desafio, estado.montagem, id, acao);
  if (montagem === estado.montagem) return estado;
  const conta = acao.tipo === "arrastar" ? 0 : 1;
  return { ...estado, montagem, selecionada: id, movimentos: estado.movimentos + conta };
}

function aplicar(desafio: Desafio, montagem: Montagem, id: string, acao: Acao): Montagem {
  if (ehMalha(desafio) && montagem.tipo === "malha") {
    const peca = desafio.pecas.find((p) => p.id === id);
    const pose = montagem.poses[id];
    if (!peca || !pose) return montagem;
    const nova = acaoMalha(peca, pose, acao, desafio.tipo === "malha-plano");
    return nova === pose ? montagem : { tipo: "malha", poses: { ...montagem.poses, [id]: nova } };
  }
  if (desafio.tipo === "livre-plano" && montagem.tipo === "livre-plano") {
    const nova = acaoPlana(desafio, montagem.poses, id, acao);
    return nova ? { tipo: "livre-plano", poses: { ...montagem.poses, [id]: nova } } : montagem;
  }
  if (desafio.tipo === "livre-espaco" && montagem.tipo === "livre-espaco") {
    const peca = desafio.pecas.find((p) => p.id === id);
    const pose = montagem.poses[id];
    if (!peca || !pose) return montagem;
    const mesaZ = Math.min(...desafio.alvo.map((v) => v[2]));
    const nova = acaoSolida(pose, acao);
    if (!nova) return montagem;
    // Nada atravessa a mesa: se o giro afundou a peça, ela sobe até apoiar.
    const zMin = Math.min(...verticesNaPose(peca, nova).map((v) => v[2]));
    const ajustada =
      zMin < mesaZ - 1e-9
        ? { ...nova, z: limpar(nova.z + Math.ceil((mesaZ - zMin) / PASSO_SOLIDO) * PASSO_SOLIDO) }
        : nova;
    return { tipo: "livre-espaco", poses: { ...montagem.poses, [id]: ajustada } };
  }
  return montagem;
}

/* ---------- malha ---------- */

function acaoMalha(peca: PecaMalha, pose: PoseMalha, acao: Acao, plano: boolean): PoseMalha {
  const reorientar = (o: number) => {
    // Gira "no lugar": a casa da peça mais perto do centro fica onde está.
    // Pivô fixo e inteiro: quatro giros voltam exatamente ao começo.
    const k = pivo(peca);
    const antes = celulasNaPose(peca, pose, plano)[k] as readonly [number, number, number];
    const girada = { ...pose, o };
    const depois = celulasNaPose(peca, girada, plano)[k] as readonly [number, number, number];
    const ajustada = {
      ...girada,
      x: pose.x + antes[0] - depois[0],
      y: pose.y + antes[1] - depois[1],
      z: pose.z + antes[2] - depois[2],
    };
    return apoiar(peca, ajustada, plano);
  };
  switch (acao.tipo) {
    case "mover":
      return apoiar(
        peca,
        { ...pose, x: pose.x + acao.dx, y: pose.y + acao.dy, z: pose.z + (acao.dz ?? 0) },
        plano,
      );
    case "girar":
      if (plano) {
        let o = pose.o;
        for (let i = 0; i < (acao.sentido === 1 ? 1 : 3); i += 1) o = girarPlano(o);
        return reorientar(o);
      }
      return reorientar(sentidoZ(pose.o, acao.sentido));
    case "girarEixo":
      if (plano) return pose;
      return reorientar(girar3(pose.o, acao.eixo === "x" ? giroX : giroY));
    case "virar":
      return plano ? reorientar(espelharPlano(pose.o)) : pose;
    case "arrastar": {
      const x = Math.round(acao.x);
      const y = Math.round(acao.y);
      return x === pose.x && y === pose.y ? pose : { ...pose, x, y };
    }
    default:
      return pose;
  }
}
function pivo(peca: PecaMalha) {
  const n = peca.celulas.length;
  const centro = [0, 1, 2].map((i) => peca.celulas.reduce((s, c) => s + (c[i] as number), 0) / n);
  let melhor = 0;
  let menor = Number.POSITIVE_INFINITY;
  peca.celulas.forEach((c, i) => {
    const d = Math.hypot(
      c[0] - (centro[0] as number),
      c[1] - (centro[1] as number),
      c[2] - (centro[2] as number),
    );
    if (d < menor - 1e-9) {
      menor = d;
      melhor = i;
    }
  });
  return melhor;
}
function sentidoZ(o: number, sentido: 1 | -1) {
  return sentido === 1 ? girar3(o, giroZ) : girar3(girar3(girar3(o, giroZ), giroZ), giroZ);
}
/** No espaço, a peça sempre apoia na mesa (z ≥ 0); no plano, z é sempre 0. */
function apoiar(peca: PecaMalha, pose: PoseMalha, plano: boolean): PoseMalha {
  if (plano) return { ...pose, z: 0 };
  const zMin = Math.min(...celulasNaPose(peca, pose, false).map((c) => c[2]));
  const z = zMin < 0 ? pose.z - zMin : pose.z;
  return { ...pose, z: Math.min(z, 6) };
}

/* ---------- plano livre ---------- */

function formas(desafio: DesafioLivrePlano, poses: Record<string, PosePlana>, exceto: string) {
  return desafio.pecas
    .filter((p) => p.id !== exceto && poses[p.id])
    .map((p) => partesNaPose(p, poses[p.id] as PosePlana));
}

/**
 * Peças planas se comportam como madeira: uma não atravessa a outra. O
 * movimento para no ponto de contato (busca binária no caminho).
 */
function moverComContato(
  peca: PecaPlana,
  de: PosePlana,
  para: PosePlana,
  outras: Ponto[][][],
): PosePlana | null {
  const livre = (pose: PosePlana) =>
    !outras.some((o) => pecasSeSobrepoem(partesNaPose(peca, pose), o));
  if (!livre(de)) return livre(para) ? para : null;
  const em = (t: number) => ({
    ...para,
    x: de.x + (para.x - de.x) * t,
    y: de.y + (para.y - de.y) * t,
  });
  // Percorre o caminho em passos curtos para não "atravessar" uma peça fina
  // no meio do trajeto; no primeiro contato, refina por busca binária.
  const distancia = Math.hypot(para.x - de.x, para.y - de.y);
  const passos = Math.max(1, Math.ceil(distancia / 0.05));
  let lo = 0;
  let hi = -1;
  for (let i = 1; i <= passos; i += 1) {
    if (livre(em(i / passos))) lo = i / passos;
    else {
      hi = i / passos;
      break;
    }
  }
  if (hi < 0) return para;
  for (let i = 0; i < 12; i += 1) {
    const meio = (lo + hi) / 2;
    if (livre(em(meio))) lo = meio;
    else hi = meio;
  }
  // Sem arredondar: arredondar a parada pode empurrar a peça para dentro da vizinha.
  return lo < 1e-4 ? null : em(lo);
}

function acaoPlana(
  desafio: DesafioLivrePlano,
  poses: Record<string, PosePlana>,
  id: string,
  acao: Acao,
): PosePlana | null {
  const peca = desafio.pecas.find((p) => p.id === id);
  const pose = poses[id];
  if (!peca || !pose) return null;
  const outras = formas(desafio, poses, id);
  const semSobrepor = (nova: PosePlana) =>
    outras.some((o) => pecasSeSobrepoem(partesNaPose(peca, nova), o)) ? null : nova;
  switch (acao.tipo) {
    case "mover":
      return moverComContato(
        peca,
        pose,
        { ...pose, x: limpar(pose.x + acao.dx), y: limpar(pose.y + acao.dy) },
        outras,
      );
    case "arrastar":
      return moverComContato(peca, pose, { ...pose, x: limpar(acao.x), y: limpar(acao.y) }, outras);
    case "girar": {
      const angulo = (((pose.angulo + acao.sentido * desafio.giro) % 360) + 360) % 360;
      return semSobrepor({ ...pose, angulo });
    }
    case "virar":
      if (!desafio.espelho) return null;
      return semSobrepor({ ...pose, espelho: !pose.espelho, angulo: (360 - pose.angulo) % 360 });
    case "soltar":
      return ima(desafio, peca, pose, outras);
    default:
      return null;
  }
}

/**
 * Ao soltar: um vértice perto de outro vértice (de peça ou do alvo) encosta
 * nele; numa caixa, a peça que passou um pouquinho da borda volta para dentro.
 */
function ima(desafio: DesafioLivrePlano, peca: PecaPlana, pose: PosePlana, outras: Ponto[][][]) {
  const meus = partesNaPose(peca, pose).flat();
  const alheios = [...outras.flat(2), ...desafio.alvo.flat()];
  let melhor: { dx: number; dy: number; d: number } | null = null;
  for (const v of meus)
    for (const w of alheios) {
      const d = Math.hypot(w[0] - v[0], w[1] - v[1]);
      if (d > 1e-6 && d < IMA && (!melhor || d < melhor.d))
        melhor = { dx: w[0] - v[0], dy: w[1] - v[1], d };
    }
  let candidata: PosePlana = melhor
    ? { ...pose, x: limpar(pose.x + melhor.dx), y: limpar(pose.y + melhor.dy) }
    : pose;
  if (desafio.modo === "caber") {
    const borda = desafio.alvo.flat();
    const x0 = Math.min(...borda.map((p) => p[0]));
    const x1 = Math.max(...borda.map((p) => p[0]));
    const y0 = Math.min(...borda.map((p) => p[1]));
    const y1 = Math.max(...borda.map((p) => p[1]));
    const pontos = partesNaPose(peca, candidata).flat();
    const minX = Math.min(...pontos.map((p) => p[0]));
    const maxX = Math.max(...pontos.map((p) => p[0]));
    const minY = Math.min(...pontos.map((p) => p[1]));
    const maxY = Math.max(...pontos.map((p) => p[1]));
    const empurrar = (sai: number, entra: number) =>
      (sai > 0 && sai < IMA ? sai : 0) - (entra > 0 && entra < IMA ? entra : 0);
    const dx = empurrar(x0 - minX, maxX - x1);
    const dy = empurrar(y0 - minY, maxY - y1);
    if (dx || dy)
      candidata = {
        ...candidata,
        x: limpar(candidata.x + dx + Math.sign(dx) * 0.002),
        y: limpar(candidata.y + dy + Math.sign(dy) * 0.002),
      };
  }
  if (candidata === pose) return null;
  return outras.some((o) => pecasSeSobrepoem(partesNaPose(peca, candidata), o)) ? null : candidata;
}

/* ---------- sólidos ---------- */

function acaoSolida(pose: PoseSolida, acao: Acao): PoseSolida | null {
  switch (acao.tipo) {
    case "mover":
      return {
        ...pose,
        x: limpar(pose.x + acao.dx * PASSO_SOLIDO),
        y: limpar(pose.y + acao.dy * PASSO_SOLIDO),
        z: limpar(pose.z + (acao.dz ?? 0) * PASSO_SOLIDO),
      };
    case "arrastar": {
      const x = limpar(arredondar(acao.x, PASSO_SOLIDO));
      const y = limpar(arredondar(acao.y, PASSO_SOLIDO));
      return x === pose.x && y === pose.y ? null : { ...pose, x, y };
    }
    case "girar":
      return { ...pose, o: sentidoZ(pose.o, acao.sentido) };
    case "girarEixo":
      return { ...pose, o: girar3(pose.o, acao.eixo === "x" ? giroX : giroY) };
    default:
      return null;
  }
}
