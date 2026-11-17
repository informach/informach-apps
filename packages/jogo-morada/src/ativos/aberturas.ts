import type { AberturaDoManifesto } from "@informach/morada-arte/manifesto";
import type { Lote } from "@informach/morada-sim";
import type { DocumentoDeImovel } from "@informach/morada-sim/formatos";
import { Group, Mesh, type Object3D } from "three";
import { paraCena } from "../cena/espaco";

/** Encaixes nos vãos já existentes. Portas ficam abertas até haver estado de porta na simulação. */
export function montarAberturas(
  imovel: DocumentoDeImovel,
  lote: Lote,
  entradas: readonly AberturaDoManifesto[],
  cenas: ReadonlyMap<string, Object3D>,
): Group {
  const raiz = new Group();
  for (const andar of imovel.andares)
    for (const vao of andar.aberturas) {
      const entrada = entradas.find(
        (x) =>
          x.tipo === vao.tipo &&
          Math.round(x.largura * 1000) === vao.largura &&
          Math.round(x.altura * 1000) === vao.altura &&
          Math.round(x.peitoril * 1000) === vao.peitoril,
      );
      const cena = entrada ? cenas.get(entrada.arquivo) : undefined;
      const parede = andar.paredes.find((x) => x.id === vao.parede);
      if (!entrada || !cena || !parede) continue;
      const copia = cena.clone(true);
      // O encaixe tem origem no chão do andar; a janela já inclui seu peitoril.
      copia.position.set(
        ...paraCena(lote.origem[0] + vao.centro[0], lote.origem[1] + vao.centro[1], andar.z),
      );
      copia.rotation.y = Math.atan2(parede.b[1] - parede.a[1], parede.b[0] - parede.a[0]);
      copia.traverse((no) => {
        if (no instanceof Mesh) {
          no.castShadow = true;
          no.receiveShadow = true;
        }
      });
      if (vao.tipo === "porta") {
        const folha = copia.getObjectByName(entrada.id);
        if (folha) {
          const dobradica = new Group();
          dobradica.name = "dobradica-aberta";
          dobradica.position.x = -entrada.largura / 2;
          dobradica.rotation.y = Math.PI / 2;
          folha.position.x += entrada.largura / 2;
          dobradica.add(folha);
          copia.add(dobradica);
        }
      }
      raiz.add(copia);
    }
  return raiz;
}
