import {
  ATRIBUTO_MASCARA_PINTURA,
  ATRIBUTO_PESO_PINTURA,
  type PinturaDoObjeto,
  PinturaDoObjetoSchema,
} from "@informach/morada-arte/manifesto";
import { type BufferGeometry, type Material, Mesh, type Object3D, ShaderChunk } from "three";
import { z } from "zod";

const MaterialPintavelSchema = z.strictObject({ perfil: z.string().regex(/^[0-9a-f]{64}$/) });

/** Materiais próprios de um grupo pintado; geometria e texturas pertencem ao cache. */
export class PinturaDosMoveis {
  private readonly materiais = new Map<Material, Material>();
  private readonly geometrias = new Set<BufferGeometry>();
  private readonly perfil: PinturaDoObjeto;

  constructor(perfil: PinturaDoObjeto) {
    this.perfil = PinturaDoObjetoSchema.parse(perfil);
  }

  conferir(modelo: Object3D): void {
    let pintavel = false;
    modelo.traverse((no) => {
      if (!(no instanceof Mesh)) return;
      for (const material of Array.isArray(no.material) ? no.material : [no.material]) {
        if (!this.conferirMaterial(material, no.geometry)) continue;
        const mascara = no.geometry.getAttribute(ATRIBUTO_MASCARA_PINTURA.toLowerCase());
        for (let i = 0; i < mascara.count; i++) if (mascara.getX(i) === 1) pintavel = true;
      }
    });
    if (!pintavel) throw new Error("O modelo não contém a superfície de pintura anunciada");
  }

  private conferirMaterial(original: Material, geometria: BufferGeometry): boolean {
    if (original.userData.moradaPintura === undefined) return false;
    const perfil = MaterialPintavelSchema.parse(original.userData.moradaPintura);
    if (perfil.perfil !== this.perfil.perfil)
      throw new Error("O perfil de pintura do material diverge do manifesto");
    this.conferirGeometria(geometria);
    return true;
  }

  material(original: Material, geometria: BufferGeometry): Material {
    const pintavel = this.conferirMaterial(original, geometria);
    const pronto = this.materiais.get(original);
    if (pronto) return pronto;
    const material = original.clone();
    const anterior = original.onBeforeCompile;
    const chave = original.customProgramCacheKey();
    material.customProgramCacheKey = () =>
      `${chave}|morada-pintura-atlas16-v1:${pintavel ? "pintavel" : "detalhe"}`;
    material.onBeforeCompile = (shader, renderer) => {
      anterior.call(material, shader, renderer);
      if (!pintavel) {
        // Materiais de um mesmo InstancedMesh podem misturar vidro e atlas.
        // A cor de destino não pode multiplicar nenhum detalhe ou alpha.
        shader.vertexShader = substituir(
          shader.vertexShader,
          "#include <color_vertex>",
          substituir(ShaderChunk.color_vertex, "vColor.rgb *= instanceColor.rgb;", ""),
        );
        return;
      }
      shader.vertexShader = substituir(
        shader.vertexShader,
        "#include <common>",
        `#include <common>
attribute float _morada_mascara_pintura;
attribute float _morada_peso_pintura;
varying float vMoradaMascara;
varying float vMoradaPeso;
varying vec3 vMoradaCor;`,
      );
      // A cor da instância é o destino. Multiplicá-la pelo atlas tingiria também os detalhes.
      const vertice = substituir(
        ShaderChunk.color_vertex,
        "vColor.rgb *= instanceColor.rgb;",
        "vMoradaCor = instanceColor.rgb;\nvMoradaMascara = _morada_mascara_pintura;",
      );
      shader.vertexShader = substituir(
        shader.vertexShader,
        "#include <color_vertex>",
        `
vMoradaMascara = 0.0;
vMoradaPeso = _morada_peso_pintura;
vMoradaCor = vec3(0.0);
${vertice}`,
      );
      shader.fragmentShader = substituir(
        shader.fragmentShader,
        "#include <common>",
        `#include <common>
varying float vMoradaMascara;
varying float vMoradaPeso;
varying vec3 vMoradaCor;`,
      );
      shader.fragmentShader = substituir(
        shader.fragmentShader,
        "#include <color_fragment>",
        `#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, vMoradaCor * vMoradaPeso, vMoradaMascara);
`,
      );
    };
    this.materiais.set(original, material);
    return material;
  }

  private conferirGeometria(geometria: BufferGeometry): void {
    if (this.geometrias.has(geometria)) return;
    const quantidade = geometria.getAttribute("position")?.count;
    const mascara = geometria.getAttribute(ATRIBUTO_MASCARA_PINTURA.toLowerCase());
    const peso = geometria.getAttribute(ATRIBUTO_PESO_PINTURA.toLowerCase());
    if (
      !quantidade ||
      !mascara ||
      !peso ||
      mascara.count !== quantidade ||
      peso.count !== quantidade ||
      mascara.itemSize !== 1 ||
      peso.itemSize !== 1
    )
      throw new Error("Atributos de pintura ausentes ou divergentes");
    for (let i = 0; i < quantidade; i++) {
      const m = mascara.getX(i),
        p = peso.getX(i);
      if ((m !== 0 && m !== 1) || !Number.isFinite(p) || p < 0 || p > 1 || (m === 0 && p !== 0))
        throw new Error("Atributos de pintura fora do perfil");
    }
    this.geometrias.add(geometria);
  }

  dispose(): void {
    for (const material of this.materiais.values()) material.dispose();
    this.materiais.clear();
    this.geometrias.clear();
  }
}

function substituir(fonte: string, trecho: string, novo: string): string {
  if (!fonte.includes(trecho))
    throw new Error(`Shader incompatível com a pintura Morada: ${trecho}`);
  return fonte.replace(trecho, novo);
}
