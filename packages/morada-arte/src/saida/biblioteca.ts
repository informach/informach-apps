import { Document, Logger } from "@gltf-transform/core";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup } from "@gltf-transform/functions";
import type { Clipe, EsqueletoDaBiblioteca } from "../animacao/clipes";
import { entradaESaida } from "./glb";

/**
 * Escreve uma biblioteca de animação do jogo: o esqueleto (só os nós, sem
 * malha nem skin) e os clipes escolhidos, com os nomes da biblioteca de arte.
 * O cliente toca cada clipe no esqueleto do personagem pelo nome dos ossos.
 */
export async function escreverBiblioteca(
  esqueleto: EsqueletoDaBiblioteca,
  clipes: readonly Clipe[],
): Promise<Uint8Array> {
  const doc = new Document();
  doc.setLogger(new Logger(Logger.Verbosity.ERROR));
  doc.getRoot().getAsset().generator = "@informach/morada-arte";
  const buffer = doc.createBuffer();
  const armadura = doc
    .createNode("Armadura")
    .setTranslation(esqueleto.armadura.translacao)
    .setRotation(esqueleto.armadura.rotacao)
    .setScale(esqueleto.armadura.escala);
  const nos = esqueleto.ossos.map((osso) =>
    doc
      .createNode(osso.nome)
      .setTranslation(osso.translacao)
      .setRotation(osso.rotacao)
      .setScale(osso.escala),
  );
  esqueleto.ossos.forEach((osso, i) => {
    const no = nos[i];
    if (!no) return;
    (osso.pai < 0 ? armadura : nos[osso.pai])?.addChild(no);
  });
  doc.getRoot().setDefaultScene(doc.createScene("esqueleto").addChild(armadura));
  for (const clipe of clipes) {
    const animacao = doc.createAnimation(clipe.nome);
    for (const canal of clipe.canais) {
      const no = nos[canal.osso];
      if (!no) continue;
      // sem nome nos acessores: são milhares, e cada nome iria para o JSON do arquivo
      const entrada = doc
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Float32Array(canal.tempos))
        .setBuffer(buffer);
      const saida = doc
        .createAccessor()
        .setType(canal.caminho === "rotation" ? "VEC4" : "VEC3")
        .setArray(new Float32Array(canal.valores))
        .setBuffer(buffer);
      const amostrador = doc
        .createAnimationSampler()
        .setInput(entrada)
        .setOutput(saida)
        .setInterpolation("LINEAR");
      animacao.addSampler(amostrador);
      animacao.addChannel(
        doc
          .createAnimationChannel()
          .setTargetNode(no)
          .setTargetPath(canal.caminho)
          .setSampler(amostrador),
      );
    }
  }
  await doc.transform(dedup());
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  return (await entradaESaida()).writeBinary(doc);
}
