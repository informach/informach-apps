import { ErroDeArte } from "../erros";
import { matrizesNoMundo, type PoseLocal, posicaoDaMatriz } from "../esqueleto";
import type { Armadura, Osso, Quat } from "../leitura/corpo";
import { ArquivoGlb } from "../leitura/glb";
import { em, item, type Vec3 } from "../numeros";

/**
 * Leitura de uma biblioteca de animação (`biblioteca/bibliotecas_30fps/<esqueleto>.glb`:
 * só o esqueleto e um clipe por id, uma chave por quadro) e redução dos clipes
 * escolhidos: canais que não mudam viram uma chave só ou saem, e os que mudam
 * perdem as chaves que a interpolação refaz dentro da tolerância.
 */

export type Caminho = "translation" | "rotation" | "scale";

export type Canal = {
  osso: number;
  caminho: Caminho;
  tempos: Float32Array;
  /** Três números por chave (quatro na rotação). */
  valores: Float32Array;
};

export type Clipe = {
  nome: string;
  /** Do primeiro ao último quadro, em segundos (o clipe começa em zero). */
  duracao: number;
  canais: Canal[];
};

export type EsqueletoDaBiblioteca = {
  arquivo: string;
  armadura: Armadura;
  ossos: Osso[];
  /** Nomes dos clipes do arquivo. */
  clipes: string[];
};

export class BibliotecaDeAnimacao {
  readonly esqueleto: EsqueletoDaBiblioteca;
  private readonly glb: ArquivoGlb;
  private readonly ossoDoNo = new Map<number, number>();

  constructor(caminho: string) {
    this.glb = new ArquivoGlb(caminho);
    const { json, arquivo } = this.glb;
    const raiz = json.scenes[0]?.nodes?.[0];
    if (raiz === undefined || (json.scenes[0]?.nodes?.length ?? 0) !== 1) {
      this.glb.fechar();
      throw new ErroDeArte(arquivo, "esperava uma cena com um nó de armadura na raiz", "scenes");
    }
    const noDaArmadura = this.glb.no(raiz);
    const ossos: Osso[] = [];
    const visitar = (indice: number, pai: number): void => {
      const no = this.glb.no(indice);
      if (no.matrix)
        throw new ErroDeArte(arquivo, "osso com matriz em vez de TRS", `nodes.${indice}`);
      const k = ossos.length;
      this.ossoDoNo.set(indice, k);
      ossos.push({
        nome: no.name ?? `osso_${indice}`,
        pai,
        translacao: no.translation ?? [0, 0, 0],
        rotacao: no.rotation ?? [0, 0, 0, 1],
        escala: no.scale ?? [1, 1, 1],
      });
      for (const filho of no.children ?? []) visitar(filho, k);
    };
    for (const filho of noDaArmadura.children ?? []) visitar(filho, -1);
    this.esqueleto = {
      arquivo,
      armadura: {
        nome: noDaArmadura.name ?? "armadura",
        translacao: noDaArmadura.translation ?? [0, 0, 0],
        rotacao: noDaArmadura.rotation ?? [0, 0, 0, 1],
        escala: noDaArmadura.scale ?? [1, 1, 1],
      },
      ossos,
      clipes: (json.animations ?? []).map((a, i) => a.name ?? `clipe_${i}`),
    };
  }

  fechar(): void {
    this.glb.fechar();
  }

  /** Um clipe inteiro, como está no arquivo, com o tempo começando em zero. */
  ler(nome: string): Clipe {
    const { json, arquivo } = this.glb;
    const indice = this.esqueleto.clipes.indexOf(nome);
    const animacao = json.animations?.[indice];
    if (!animacao)
      throw new ErroDeArte(arquivo, `a biblioteca não tem o clipe ${nome}`, "animations");
    const campo = `animations.${indice} (${nome})`;
    const canais: Canal[] = [];
    let inicio = Number.POSITIVE_INFINITY;
    let fim = Number.NEGATIVE_INFINITY;
    for (const canal of animacao.channels) {
      const caminho = canal.target.path;
      if (caminho === "weights") throw new ErroDeArte(arquivo, "clipe com canal de formas", campo);
      const osso =
        canal.target.node === undefined ? undefined : this.ossoDoNo.get(canal.target.node);
      if (osso === undefined)
        throw new ErroDeArte(arquivo, "canal preso a um nó que não é osso", campo);
      const amostrador = item(animacao.samplers, canal.sampler);
      if (amostrador.interpolation === "CUBICSPLINE") {
        throw new ErroDeArte(arquivo, "interpolação cúbica não é suportada", campo);
      }
      const tempos = this.glb.reais(amostrador.input, `${campo}.input`);
      const valores = this.glb.reais(amostrador.output, `${campo}.output`);
      const largura = caminho === "rotation" ? 4 : 3;
      if (tempos.length === 0 || valores.length !== tempos.length * largura) {
        throw new ErroDeArte(arquivo, "chaves e valores não fecham", campo);
      }
      inicio = Math.min(inicio, em(tempos, 0));
      fim = Math.max(fim, em(tempos, tempos.length - 1));
      canais.push({ osso, caminho, tempos, valores });
    }
    if (canais.length === 0) throw new ErroDeArte(arquivo, "clipe sem canais", campo);
    for (const canal of canais) canal.tempos = canal.tempos.map((t) => t - inicio);
    return { nome, duracao: fim - inicio, canais };
  }
}

const LARGURA: Record<Caminho, number> = { translation: 3, rotation: 4, scale: 3 };

/** O valor de um canal no tempo `t`: linear nos vetores, esférica nas rotações (como o three toca). */
export function valorDoCanal(canal: Canal, t: number): number[] {
  const { tempos, valores } = canal;
  const largura = LARGURA[canal.caminho];
  const n = tempos.length;
  const chave = (k: number): number[] =>
    Array.from(valores.subarray(k * largura, k * largura + largura));
  if (n === 1 || t <= em(tempos, 0)) return chave(0);
  if (t >= em(tempos, n - 1)) return chave(n - 1);
  let a = 0;
  let b = n - 1;
  while (b - a > 1) {
    const meio = (a + b) >> 1;
    if (em(tempos, meio) <= t) a = meio;
    else b = meio;
  }
  const f = (t - em(tempos, a)) / (em(tempos, b) - em(tempos, a));
  const va = chave(a);
  const vb = chave(b);
  if (canal.caminho !== "rotation") return va.map((x, k) => x + (em(vb, k) - x) * f);
  return slerp(va, vb, f);
}

function slerp(a: readonly number[], b: readonly number[], t: number): number[] {
  let cos = em(a, 0) * em(b, 0) + em(a, 1) * em(b, 1) + em(a, 2) * em(b, 2) + em(a, 3) * em(b, 3);
  const sinal = cos < 0 ? -1 : 1;
  cos *= sinal;
  let ka = 1 - t;
  let kb = t;
  if (cos < 0.999999) {
    const angulo = Math.acos(cos);
    const seno = Math.sin(angulo);
    ka = Math.sin((1 - t) * angulo) / seno;
    kb = Math.sin(t * angulo) / seno;
  }
  const q = a.map((x, k) => x * ka + em(b, k) * kb * sinal);
  const norma = Math.hypot(...q) || 1;
  return q.map((x) => x / norma);
}

/** Ângulo, em radianos, entre duas rotações. */
function anguloEntre(a: readonly number[], b: readonly number[]): number {
  const cos = Math.abs(
    em(a, 0) * em(b, 0) + em(a, 1) * em(b, 1) + em(a, 2) * em(b, 2) + em(a, 3) * em(b, 3),
  );
  return 2 * Math.acos(Math.min(1, cos));
}

export type Tolerancia = {
  /**
   * Quanto o erro de rotação de uma junta pode deslocar a ponta mais distante que ela move, em metros.
   * O limite de cada junta, em graus, sai daí: o quadril e o ombro (que carregam o corpo ou o braço
   * inteiro) ficam com um limite apertado; os dedos, com um limite folgado.
   */
  desvioPorJunta: number;
  /** Piso e teto do limite de rotação de uma junta, em graus. */
  rotacaoMinimaGraus: number;
  rotacaoMaximaGraus: number;
  /** Erro máximo de cada translação, em metros. */
  translacao: number;
  /** Erro máximo de cada escala. */
  escala: number;
};

export const TOLERANCIA_PADRAO: Tolerancia = {
  desvioPorJunta: 0.001,
  rotacaoMinimaGraus: 0.05,
  rotacaoMaximaGraus: 1,
  translacao: 0.0005,
  escala: 0.0005,
};

/**
 * Para cada osso, a distância até o descendente mais distante na pose de descanso: o braço de alavanca
 * do erro de rotação dele. Um osso sem filhos move só a própria ponta (a mão, o pé, a cabeça).
 */
export function alcanceDosOssos(armadura: Armadura, ossos: readonly Osso[]): number[] {
  const mundo = matrizesNoMundo(
    armadura,
    ossos,
    ossos.map((o) => ({ translacao: o.translacao, rotacao: o.rotacao, escala: o.escala })),
  ).map(posicaoDaMatriz);
  const PONTA = 0.08;
  return ossos.map((_, i) => {
    let maior = PONTA;
    ossos.forEach((__, j) => {
      let k = item(ossos, j).pai;
      while (k >= 0 && k !== i) k = item(ossos, k).pai;
      if (k !== i) return;
      const a = item(mundo, i);
      const b = item(mundo, j);
      maior = Math.max(maior, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) + PONTA);
    });
    return maior;
  });
}

function erroDoCanal(canal: Canal, a: readonly number[], b: readonly number[]): number {
  if (canal.caminho === "rotation") return anguloEntre(a, b);
  return Math.max(...a.map((x, k) => Math.abs(x - em(b, k))));
}

/**
 * Tira de um canal as chaves que a interpolação entre as vizinhas refaz dentro
 * do limite (Douglas–Peucker no tempo: guarda a chave de maior erro de cada
 * trecho enquanto o erro passa do limite).
 */
export function reduzirCanal(canal: Canal, limite: number): Canal {
  const n = canal.tempos.length;
  const largura = LARGURA[canal.caminho];
  const chave = (k: number): number[] =>
    Array.from(canal.valores.subarray(k * largura, k * largura + largura));
  if (n <= 2) {
    if (n === 2 && erroDoCanal(canal, chave(0), chave(1)) <= 1e-7) {
      return {
        ...canal,
        tempos: canal.tempos.slice(0, 1),
        valores: canal.valores.slice(0, largura),
      };
    }
    return canal;
  }
  const guardar = new Uint8Array(n);
  guardar[0] = 1;
  guardar[n - 1] = 1;
  const pilha: [number, number][] = [[0, n - 1]];
  while (pilha.length > 0) {
    const trecho = pilha.pop();
    if (!trecho) break;
    const [a, b] = trecho;
    if (b - a < 2) continue;
    const va = chave(a);
    const vb = chave(b);
    const ta = em(canal.tempos, a);
    const tb = em(canal.tempos, b);
    let pior = -1;
    let erro = limite;
    for (let k = a + 1; k < b; k++) {
      const f = (em(canal.tempos, k) - ta) / (tb - ta);
      const refeito =
        canal.caminho === "rotation" ? slerp(va, vb, f) : va.map((x, e) => x + (em(vb, e) - x) * f);
      const e = erroDoCanal(canal, refeito, chave(k));
      if (e > erro) {
        erro = e;
        pior = k;
      }
    }
    if (pior >= 0) {
      guardar[pior] = 1;
      pilha.push([a, pior], [pior, b]);
    }
  }
  const tempos: number[] = [];
  const valores: number[] = [];
  for (let k = 0; k < n; k++) {
    if (!em(guardar, k)) continue;
    tempos.push(em(canal.tempos, k));
    valores.push(...chave(k));
  }
  // um canal que não sai do lugar fica com uma chave só
  if (tempos.length === 2 && erroDoCanal(canal, chave(0), chave(n - 1)) <= limite / 4) {
    return {
      ...canal,
      tempos: Float32Array.from([em(tempos, 0)]),
      valores: Float32Array.from(valores.slice(0, largura)),
    };
  }
  return { ...canal, tempos: Float32Array.from(tempos), valores: Float32Array.from(valores) };
}

function limiteDe(caminho: Caminho, tolerancia: Tolerancia, alcance: number): number {
  if (caminho === "translation") return tolerancia.translacao;
  if (caminho === "scale") return tolerancia.escala;
  const graus = (Math.atan2(tolerancia.desvioPorJunta, alcance) * 180) / Math.PI;
  const limitado = Math.min(
    Math.max(graus, tolerancia.rotacaoMinimaGraus),
    tolerancia.rotacaoMaximaGraus,
  );
  return (limitado * Math.PI) / 180;
}

/** O valor de descanso de um osso num caminho. */
function descanso(osso: Osso, caminho: Caminho): readonly number[] {
  return caminho === "rotation"
    ? osso.rotacao
    : caminho === "translation"
      ? osso.translacao
      : osso.escala;
}

export type ClipeReduzido = {
  clipe: Clipe;
  chavesAntes: number;
  chavesDepois: number;
  canaisAntes: number;
};

/**
 * Reduz um clipe. Um canal que fica o tempo todo no valor de descanso do osso
 * sai do clipe quando `descartaveis` diz que esse osso e caminho pode sair (o
 * osso fica onde o esqueleto do personagem o deixa); os outros perdem as
 * chaves redundantes.
 */
export function reduzirClipe(
  clipe: Clipe,
  ossos: readonly Osso[],
  tolerancia: Tolerancia,
  descartaveis: (osso: number, caminho: Caminho) => boolean,
  alcances: readonly number[],
): ClipeReduzido {
  let chavesAntes = 0;
  let chavesDepois = 0;
  const canais: Canal[] = [];
  for (const canal of clipe.canais) {
    chavesAntes += canal.tempos.length;
    const reduzido = reduzirCanal(
      canal,
      limiteDe(canal.caminho, tolerancia, item(alcances, canal.osso)),
    );
    if (reduzido.tempos.length === 1 && descartaveis(canal.osso, canal.caminho)) {
      const parado = descanso(item(ossos, canal.osso), canal.caminho);
      const valor = Array.from(reduzido.valores);
      if (erroDoCanal(canal, valor, parado) <= 1e-5) continue;
    }
    chavesDepois += reduzido.tempos.length;
    canais.push(reduzido);
  }
  // o clipe continua com a mesma duração: alguma chave tem de estar no fim
  const temFim = canais.some(
    (c) => Math.abs(em(c.tempos, c.tempos.length - 1) - clipe.duracao) < 1e-6,
  );
  if (!temFim && canais.length > 0) {
    const primeiro = item(canais, 0);
    const largura = LARGURA[primeiro.caminho];
    const ultima = primeiro.valores.subarray(primeiro.valores.length - largura);
    canais[0] = {
      ...primeiro,
      tempos: Float32Array.from([...primeiro.tempos, clipe.duracao]),
      valores: Float32Array.from([...primeiro.valores, ...ultima]),
    };
    chavesDepois += 1;
  }
  return {
    clipe: { ...clipe, canais },
    chavesAntes,
    chavesDepois,
    canaisAntes: clipe.canais.length,
  };
}

/** A pose local do esqueleto num instante de um clipe (os ossos sem canal ficam no descanso). */
export function poseNoTempo(clipe: Clipe, ossos: readonly Osso[], t: number): PoseLocal[] {
  const pose: PoseLocal[] = ossos.map((o) => ({
    translacao: o.translacao,
    rotacao: o.rotacao,
    escala: o.escala,
  }));
  for (const canal of clipe.canais) {
    const local = item(pose, canal.osso);
    const valor = valorDoCanal(canal, t);
    if (canal.caminho === "rotation")
      local.rotacao = [em(valor, 0), em(valor, 1), em(valor, 2), em(valor, 3)] as Quat;
    else if (canal.caminho === "translation")
      local.translacao = [em(valor, 0), em(valor, 1), em(valor, 2)] as Vec3;
    else local.escala = [em(valor, 0), em(valor, 1), em(valor, 2)] as Vec3;
  }
  return pose;
}

/** Os ossos cujo desvio é medido depois da redução: pés, mãos e cabeça. */
export const PONTAS = [
  "LeftFoot",
  "RightFoot",
  "LeftToeBase",
  "RightToeBase",
  "LeftHand",
  "RightHand",
  "Head",
] as const;

/**
 * Maior distância, em metros, entre onde as pontas do corpo ficam no clipe
 * original e no reduzido, quadro a quadro (30 por segundo).
 */
export function desvioDasPontas(
  original: Clipe,
  reduzido: Clipe,
  armadura: Armadura,
  ossos: readonly Osso[],
): { maximo: number; osso: string } {
  const pontas = PONTAS.map((nome) => ossos.findIndex((o) => o.nome === nome)).filter(
    (i) => i >= 0,
  );
  let maximo = 0;
  let osso = "";
  const quadros = Math.max(1, Math.round(original.duracao * 30));
  for (let q = 0; q <= quadros; q++) {
    const t = (original.duracao * q) / quadros;
    const a = matrizesNoMundo(armadura, ossos, poseNoTempo(original, ossos, t));
    const b = matrizesNoMundo(armadura, ossos, poseNoTempo(reduzido, ossos, t));
    for (const i of pontas) {
      const pa = posicaoDaMatriz(item(a, i));
      const pb = posicaoDaMatriz(item(b, i));
      const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
      if (d > maximo) {
        maximo = d;
        osso = item(ossos, i).nome;
      }
    }
  }
  return { maximo, osso };
}

/** O clipe termina onde começa (dá para repetir sem salto)? */
export function ehCiclo(clipe: Clipe): boolean {
  for (const canal of clipe.canais) {
    const largura = LARGURA[canal.caminho];
    const n = canal.tempos.length;
    if (n < 2) continue;
    const primeira = Array.from(canal.valores.subarray(0, largura));
    const ultima = Array.from(canal.valores.subarray((n - 1) * largura, n * largura));
    const erro = erroDoCanal(canal, primeira, ultima);
    if (erro > (canal.caminho === "rotation" ? (3 * Math.PI) / 180 : 0.015)) return false;
  }
  return true;
}
