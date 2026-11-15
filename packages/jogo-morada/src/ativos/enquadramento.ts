import { Box3, Matrix4, Mesh, type Object3D, Vector3 } from "three";
import type { EnquadramentoDoMorador } from "./ativos";

/** Medição pontual: considera ossos/morphs e ignora rostos e materiais ocultos. */
export function medirEnquadramento(modelo: Object3D, raiz: Object3D): EnquadramentoDoMorador {
  raiz.updateWorldMatrix(true, false);
  // SkinnedMesh atualiza também bindMatrixInverse neste caminho, antes de medir os vértices.
  raiz.updateMatrixWorld(true);
  const inversa = new Matrix4().copy(raiz.matrixWorld).invert();
  const paraRaiz = new Matrix4();
  const ponto = new Vector3();
  const limites = new Box3();
  modelo.traverseVisible((objeto) => {
    if (!(objeto instanceof Mesh)) return;
    const materiais = Array.isArray(objeto.material) ? objeto.material : [objeto.material];
    if (!materiais.some((material) => material.visible)) return;
    const posicoes = objeto.geometry.getAttribute("position");
    if (!posicoes) return;
    paraRaiz.multiplyMatrices(inversa, objeto.matrixWorld);
    for (let i = 0; i < posicoes.count; i++) {
      objeto.getVertexPosition(i, ponto).applyMatrix4(paraRaiz);
      limites.expandByPoint(ponto);
    }
  });
  const centro = limites.getCenter(new Vector3());
  const tamanho = Math.max(...limites.getSize(new Vector3()).toArray());
  if (limites.isEmpty() || !Number.isFinite(tamanho) || tamanho <= 0)
    throw new Error("Personagem sem limites visíveis para a prévia");
  return { centro: [centro.x, centro.y, centro.z], tamanho };
}
