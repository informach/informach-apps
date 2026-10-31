import {
  celulasNaPose,
  chaveCelula,
  distanciaSolida,
  partesNaPose,
  planosConvexos,
  profundidade,
  verticesNaPose,
} from "./geometria";
import {
  type Desafio,
  type DesafioLivreEspaco,
  type DesafioLivrePlano,
  type DesafioMalha,
  ehMalha,
  type Montagem,
  type Ponto,
  type Vetor3,
} from "./tipos";

export type Resultado = { montado: boolean; encaixadas: number };

/**
 * Confere uma montagem. É a mesma função no aparelho (para anunciar que fechou)
 * e no servidor (para dar os pontos): o cliente nunca decide sozinho.
 */
export function verificar(desafio: Desafio, montagem: Montagem): Resultado {
  if (ehMalha(desafio)) {
    if (montagem.tipo !== "malha") return { montado: false, encaixadas: 0 };
    return verificarMalha(desafio, montagem.poses);
  }
  if (desafio.tipo === "livre-plano") {
    if (montagem.tipo !== "livre-plano") return { montado: false, encaixadas: 0 };
    return verificarPlano(desafio, montagem.poses);
  }
  if (montagem.tipo !== "livre-espaco") return { montado: false, encaixadas: 0 };
  return verificarEspaco(desafio, montagem.poses);
}

function verificarMalha(
  desafio: DesafioMalha,
  poses: Extract<Montagem, { tipo: "malha" }>["poses"],
): Resultado {
  const plano = desafio.tipo === "malha-plano";
  const alvo = new Set(desafio.alvo.map(chaveCelula));
  const ocupadas = new Set<string>();
  let encaixadas = 0;
  let valido = true;
  for (const peca of desafio.pecas) {
    const pose = poses[peca.id];
    if (!pose || (plano && (pose.z !== 0 || pose.o > 7)) || pose.o < 0 || pose.o > 23) {
      valido = false;
      continue;
    }
    const celulas = celulasNaPose(peca, pose, plano).map(chaveCelula);
    const dentro = celulas.every((c) => alvo.has(c));
    if (dentro && celulas.every((c) => !ocupadas.has(c))) encaixadas += 1;
    else valido = false;
    for (const c of celulas) {
      if (ocupadas.has(c)) valido = false;
      ocupadas.add(c);
    }
  }
  return { montado: valido && ocupadas.size === alvo.size, encaixadas };
}

/** Faixa em torno das bordas onde a amostragem não decide: absorve o arredondamento. */
const TOLERANCIA = 0.012;

function caixa(pontos: Ponto[]) {
  const xs = pontos.map((p) => p[0]);
  const ys = pontos.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function verificarPlano(
  desafio: DesafioLivrePlano,
  poses: Extract<Montagem, { tipo: "livre-plano" }>["poses"],
): Resultado {
  const pecas: Ponto[][][] = [];
  for (const peca of desafio.pecas) {
    const pose = poses[peca.id];
    if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.y))
      return { montado: false, encaixadas: 0 };
    if (Math.abs(pose.angulo % desafio.giro) > 1e-6 || (pose.espelho && !desafio.espelho))
      return { montado: false, encaixadas: 0 };
    pecas.push(partesNaPose(peca, pose));
  }
  const alvo = desafio.alvo;
  // Peça inteira dentro do alvo conta como encaixada para o anúncio de progresso.
  const encaixadas = pecas.filter((partes) =>
    partes.every((parte) => parte.every((p) => profundidade(alvo, p) > -TOLERANCIA)),
  ).length;
  const limites = caixa([...alvo.flat(), ...pecas.flat(2)]);
  const lado = Math.max(limites.x1 - limites.x0, limites.y1 - limites.y0);
  const passo = lado / 160;
  for (let x = limites.x0 + passo / 2; x < limites.x1; x += passo)
    for (let y = limites.y0 + passo / 2; y < limites.y1; y += passo) {
      const p: Ponto = [x, y];
      const noAlvo = profundidade(alvo, p);
      if (Math.abs(noAlvo) < TOLERANCIA) continue;
      let cobertura = 0;
      let incerto = false;
      for (const partes of pecas) {
        const d = profundidade(partes, p);
        if (Math.abs(d) < TOLERANCIA) incerto = true;
        else if (d > 0) cobertura += 1;
      }
      if (incerto) continue;
      if (noAlvo < 0 && cobertura > 0) return { montado: false, encaixadas };
      if (cobertura > 1) return { montado: false, encaixadas };
      if (desafio.modo === "cobrir" && noAlvo > 0 && cobertura === 0)
        return { montado: false, encaixadas };
    }
  return { montado: encaixadas === pecas.length, encaixadas };
}

function verificarEspaco(
  desafio: DesafioLivreEspaco,
  poses: Extract<Montagem, { tipo: "livre-espaco" }>["poses"],
): Resultado {
  const solidos: { n: Vetor3; d: number }[][] = [];
  for (const peca of desafio.pecas) {
    const pose = poses[peca.id];
    if (!pose || pose.o < 0 || pose.o > 23 || ![pose.x, pose.y, pose.z].every(Number.isFinite))
      return { montado: false, encaixadas: 0 };
    solidos.push(planosConvexos(verticesNaPose(peca, pose)));
  }
  const alvo = planosConvexos(desafio.alvo);
  const vertices = desafio.pecas.flatMap((peca) => {
    const pose = poses[peca.id];
    return pose ? verticesNaPose(peca, pose) : [];
  });
  const encaixadas = desafio.pecas.filter((peca) => {
    const pose = poses[peca.id];
    return pose && verticesNaPose(peca, pose).every((v) => distanciaSolida(alvo, v) > -TOLERANCIA);
  }).length;
  const todos = [...desafio.alvo, ...vertices];
  const eixo = (i: 0 | 1 | 2) => {
    const valores = todos.map((v) => v[i]);
    return { min: Math.min(...valores), max: Math.max(...valores) };
  };
  const [ex, ey, ez] = [eixo(0), eixo(1), eixo(2)];
  const passo = Math.max(ex.max - ex.min, ey.max - ey.min, ez.max - ez.min) / 48;
  for (let x = ex.min + passo / 2; x < ex.max; x += passo)
    for (let y = ey.min + passo / 2; y < ey.max; y += passo)
      for (let z = ez.min + passo / 2; z < ez.max; z += passo) {
        const p: Vetor3 = [x, y, z];
        const noAlvo = distanciaSolida(alvo, p);
        if (Math.abs(noAlvo) < TOLERANCIA) continue;
        let cobertura = 0;
        let incerto = false;
        for (const planos of solidos) {
          const d = distanciaSolida(planos, p);
          if (Math.abs(d) < TOLERANCIA) incerto = true;
          else if (d > 0) cobertura += 1;
        }
        if (incerto) continue;
        if ((noAlvo < 0 && cobertura > 0) || cobertura > 1 || (noAlvo > 0 && cobertura === 0))
          return { montado: false, encaixadas };
      }
  return { montado: encaixadas === desafio.pecas.length, encaixadas };
}
