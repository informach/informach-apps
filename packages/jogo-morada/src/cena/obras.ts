import {
  type EstadoDoMundo,
  type LoteId,
  obter,
  type PresencaVista,
  TRAVAS_DE_EDICAO_POR_MUNDO,
} from "@informach/morada-sim";
import {
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
} from "three";
import { paraCena } from "./espaco";

/** Até duas regiões por concessão, em um único desenho e buffer reutilizado. */
export class ObrasDaCena {
  private readonly posicoes = new Float32BufferAttribute(
    TRAVAS_DE_EDICAO_POR_MUNDO * 2 * 8 * 3,
    3,
  ).setUsage(DynamicDrawUsage);
  readonly raiz = new LineSegments(
    new BufferGeometry().setAttribute("position", this.posicoes),
    new LineBasicMaterial({
      color: 0xffcf70,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    }),
  );
  private anterior: {
    obras: PresencaVista["obras"];
    autor: string | null;
    loteId: LoteId | null;
    revisao: number;
  } | null = null;

  constructor() {
    this.raiz.layers.set(1);
    // Na fila transparente, depois da prévia, inclusive sobre modelos opacos.
    this.raiz.renderOrder = 1001;
    this.raiz.frustumCulled = false;
    this.raiz.geometry.setDrawRange(0, 0);
    this.raiz.visible = false;
  }

  definir(
    estado: EstadoDoMundo,
    obras: PresencaVista["obras"],
    autor: string | null,
    loteId: LoteId | null,
    revisao: number,
  ): void {
    const anterior = this.anterior;
    if (
      anterior &&
      anterior.obras === obras &&
      anterior.autor === autor &&
      anterior.loteId === loteId &&
      anterior.revisao === revisao
    )
      return;
    this.anterior = { obras, autor, loteId, revisao };
    let vertices = 0;
    for (const obra of obras ?? []) {
      if (!loteId || obra.perfilId === autor || obra.alvo.loteId !== loteId) continue;
      const lote = obter(estado.lotes, loteId);
      const imovel = lote?.imovelId ? obter(estado.imoveis, lote.imovelId) : null;
      if (!lote || !imovel) continue;
      for (const regiao of obra.alvo.regioes) {
        const piso = imovel.andares.find((a) => a.n === regiao.andar);
        if (!piso) continue;
        const [x0, y0, x1, y1] = regiao.retangulo;
        const cantos = [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ] as const;
        for (let i = 0; i < 4; i++) {
          const a = cantos[i],
            b = cantos[(i + 1) % 4];
          if (!a || !b || vertices + 2 > this.posicoes.count)
            throw new Error("Regiões de obra fora do limite");
          for (const p of [a, b])
            this.posicoes.setXYZ(
              vertices++,
              ...paraCena(lote.origem[0] + p[0], lote.origem[1] + p[1], piso.z + 30),
            );
        }
      }
    }
    this.posicoes.needsUpdate = vertices > 0;
    this.raiz.geometry.setDrawRange(0, vertices);
    this.raiz.visible = vertices > 0;
  }

  dispose(): void {
    this.anterior = null;
    this.raiz.removeFromParent();
    this.raiz.geometry.dispose();
    this.raiz.material.dispose();
  }
}
