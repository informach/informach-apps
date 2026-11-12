/**
 * Aritmética da simulação: só inteiros. Distâncias em milímetros, dinheiro em
 * centavos, proporções em partes por milhão. Nada aqui depende da plataforma.
 */

/** Escala das proporções (necessidades, vínculos, pontuações): 1_000_000 = 100%. */
export const UM = 1_000_000;

export function limitar(valor: number, minimo: number, maximo: number): number {
  return valor < minimo ? minimo : valor > maximo ? maximo : valor;
}

/** `a × b` com as duas em partes por milhão. */
export function vezes(a: number, b: number): number {
  return Math.floor((a * b) / UM);
}

/** `valor × parte / total`, arredondando para baixo. */
export function proporcao(valor: number, parte: number, total: number): number {
  return Math.floor((valor * parte) / total);
}

/**
 * Raiz quadrada inteira. `Math.sqrt` é arredondada corretamente em qualquer
 * motor, e o ajuste garante o piso exato.
 */
export function raizInteira(n: number): number {
  if (n <= 0) return 0;
  let raiz = Math.floor(Math.sqrt(n));
  while (raiz * raiz > n) raiz--;
  while ((raiz + 1) * (raiz + 1) <= n) raiz++;
  return raiz;
}

export type Ponto = readonly [x: number, y: number];

export function distancia(a: Ponto, b: Ponto): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return raizInteira(dx * dx + dy * dy);
}

/** Frente de algo girado em múltiplos de 90°. Com giro 0 a frente aponta para −Y. */
export function frenteDoGiro(giro: number): Ponto {
  switch (((giro % 360) + 360) % 360) {
    case 0:
      return [0, -1];
    case 90:
      return [1, 0];
    case 180:
      return [0, 1];
    case 270:
      return [-1, 0];
    default:
      throw new Error(`Giro fora dos múltiplos de 90°: ${giro}`);
  }
}

/** Leva um ponto do referencial do objeto (lateral, para a frente) ao do lote. */
export function doLocal(origem: Ponto, giro: number, local: Ponto): [number, number] {
  const [fx, fy] = frenteDoGiro(giro);
  // A lateral é a frente girada 90° no sentido horário.
  const lx = -fy;
  const ly = fx;
  return [origem[0] + local[0] * lx + local[1] * fx, origem[1] + local[0] * ly + local[1] * fy];
}

/** Direção, em graus múltiplos de 45, de `de` olhando para `para`. */
export function direcaoPara(de: Ponto, para: Ponto): number {
  const dx = Math.sign(para[0] - de[0]);
  const dy = Math.sign(para[1] - de[1]);
  if (dx === 0 && dy === 0) return 0;
  const tabela: Record<string, number> = {
    "0,-1": 0,
    "1,-1": 45,
    "1,0": 90,
    "1,1": 135,
    "0,1": 180,
    "-1,1": 225,
    "-1,0": 270,
    "-1,-1": 315,
  };
  return tabela[`${dx},${dy}`] ?? 0;
}
