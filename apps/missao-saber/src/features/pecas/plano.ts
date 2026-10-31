import { celulasNaPose, chaveCelula } from "./geometria";
import { type Acao, type EstadoMesa, mesa } from "./mesa-estado";
import { solucaoComoMontagem } from "./montagem";
import type { Celula, DesafioMalha, Montagem } from "./tipos";

/** Teclas que a mesa entende quando o foco está numa peça. */
export type Tecla =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown"
  | "PageUp"
  | "PageDown"
  | "r"
  | "e"
  | "f"
  | "x"
  | "y";

export function teclaParaAcao(tecla: string): Acao | null {
  switch (tecla) {
    case "ArrowLeft":
      return { tipo: "mover", dx: -1, dy: 0 };
    case "ArrowRight":
      return { tipo: "mover", dx: 1, dy: 0 };
    case "ArrowUp":
      return { tipo: "mover", dx: 0, dy: 1 };
    case "ArrowDown":
      return { tipo: "mover", dx: 0, dy: -1 };
    case "PageUp":
      return { tipo: "mover", dx: 0, dy: 0, dz: 1 };
    case "PageDown":
      return { tipo: "mover", dx: 0, dy: 0, dz: -1 };
    case "r":
    case "R":
      return { tipo: "girar", sentido: 1 };
    case "e":
    case "E":
      return { tipo: "girar", sentido: -1 };
    case "f":
    case "F":
      return { tipo: "virar" };
    case "x":
    case "X":
      return { tipo: "girarEixo", eixo: "x" };
    case "y":
    case "Y":
      return { tipo: "girarEixo", eixo: "y" };
    default:
      return null;
  }
}

function forma(celulas: readonly Celula[]) {
  const min = [0, 1, 2].map((i) => Math.min(...celulas.map((c) => c[i] as number)));
  return celulas
    .map((c) =>
      chaveCelula([
        c[0] - (min[0] as number),
        c[1] - (min[1] as number),
        c[2] - (min[2] as number),
      ]),
    )
    .sort()
    .join("|");
}

/**
 * Sequência de teclas, peça por peça, que leva uma montagem em malha até a
 * solução de referência usando a própria mesa. Prova nos testes que toda
 * solução é alcançável pelos controles, e guia o teste de ponta a ponta.
 */
export function teclasAteASolucao(desafio: DesafioMalha, inicial: Montagem) {
  const plano = desafio.tipo === "malha-plano";
  const solucao = solucaoComoMontagem(desafio);
  if (solucao.tipo !== "malha") throw new Error("Solução fora da malha");
  let estado: EstadoMesa = { montagem: inicial, selecionada: null, movimentos: 0 };
  const passos: { peca: string; nome: string; teclas: Tecla[] }[] = [];
  const giros: Tecla[] = plano ? ["r", "f"] : ["r", "x", "y"];
  const poseDe = (e: EstadoMesa, id: string) => {
    if (e.montagem.tipo !== "malha") throw new Error("Montagem fora da malha");
    const pose = e.montagem.poses[id];
    if (!pose) throw new Error(`Peça ${id} sem pose`);
    return pose;
  };
  for (const peca of desafio.pecas) {
    estado = mesa(desafio, estado, { tipo: "selecionar", id: peca.id });
    const alvo = celulasNaPose(peca, poseDe({ ...estado, montagem: solucao }, peca.id), plano);
    const formaAlvo = forma(alvo);
    // Busca em largura pelas orientações alcançáveis com as teclas de giro.
    const fila: { estado: EstadoMesa; teclas: Tecla[] }[] = [{ estado, teclas: [] }];
    const vistas = new Set<number>();
    let achada: { estado: EstadoMesa; teclas: Tecla[] } | null = null;
    while (fila.length) {
      const atual = fila.shift() as { estado: EstadoMesa; teclas: Tecla[] };
      const pose = poseDe(atual.estado, peca.id);
      if (vistas.has(pose.o)) continue;
      vistas.add(pose.o);
      if (forma(celulasNaPose(peca, pose, plano)) === formaAlvo) {
        achada = atual;
        break;
      }
      for (const tecla of giros) {
        const acao = teclaParaAcao(tecla);
        if (acao)
          fila.push({
            estado: mesa(desafio, atual.estado, acao),
            teclas: [...atual.teclas, tecla],
          });
      }
    }
    if (!achada) throw new Error(`Orientação inalcançável para ${peca.id}`);
    estado = achada.estado;
    const teclas = [...achada.teclas];
    const agora = celulasNaPose(peca, poseDe(estado, peca.id), plano);
    const delta = [0, 1, 2].map(
      (i) =>
        Math.min(...alvo.map((c) => c[i] as number)) -
        Math.min(...agora.map((c) => c[i] as number)),
    ) as [number, number, number];
    const repetir = (tecla: Tecla, n: number) => {
      const acao = teclaParaAcao(tecla);
      if (!acao) return;
      for (let i = 0; i < n; i += 1) {
        teclas.push(tecla);
        estado = mesa(desafio, estado, acao);
      }
    };
    repetir(delta[0] > 0 ? "ArrowRight" : "ArrowLeft", Math.abs(delta[0]));
    repetir(delta[1] > 0 ? "ArrowUp" : "ArrowDown", Math.abs(delta[1]));
    repetir(delta[2] > 0 ? "PageUp" : "PageDown", Math.abs(delta[2]));
    passos.push({ peca: peca.id, nome: peca.nome, teclas });
  }
  return { passos, final: estado.montagem };
}
