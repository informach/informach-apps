import {
  type CoresDoPersonagem,
  CoresDoPersonagemSchema,
  MAXIMO_DE_CANAIS_DE_COR,
  MaterialDeCorSchema,
} from "@informach/morada-arte/manifesto";
import { type Material, Mesh, type Object3D, type Texture } from "three";

/** Uniformes e materiais pertencem a um morador; geometrias e texturas ficam no pacote. */
export class CoresParametricas {
  private readonly paleta = { value: new Float32Array(MAXIMO_DE_CANAIS_DE_COR * 3) };
  private readonly materiais = new Map<Material, Material>();
  private readonly cores: CoresDoPersonagem;

  constructor(
    modelo: Object3D,
    cores: CoresDoPersonagem,
    private readonly mascaras: ReadonlyMap<string, Texture> = new Map(),
  ) {
    this.cores = CoresDoPersonagemSchema.parse(cores);
    this.definir(new Map());
    try {
      modelo.traverse((objeto) => {
        if (!(objeto instanceof Mesh)) return;
        const materiais = Array.isArray(objeto.material) ? objeto.material : [objeto.material];
        if (materiais.some((material) => material.userData.moradaCor?.tipo === "vertices")) {
          const quantidade = objeto.geometry.getAttribute("position")?.count;
          const canais = objeto.geometry.getAttribute("_morada_canal_cor");
          const mascaras = objeto.geometry.getAttribute("_morada_mascara_cor");
          const pesos = objeto.geometry.getAttribute("_morada_peso_cor");
          if (
            !quantidade ||
            !canais ||
            !mascaras ||
            !pesos ||
            canais.count !== quantidade ||
            mascaras.count !== quantidade ||
            pesos.count !== quantidade ||
            canais.itemSize !== 1 ||
            mascaras.itemSize !== 1 ||
            pesos.itemSize !== 3
          )
            throw new Error("Atributos do perfil de cor ausentes ou divergentes");
          for (let i = 0; i < quantidade; i++) {
            const canal = canais.getX(i);
            const mascara = mascaras.getX(i);
            const peso = [pesos.getX(i), pesos.getY(i), pesos.getZ(i)];
            if (
              !Number.isInteger(canal) ||
              canal < -1 ||
              canal >= this.cores.canais.length ||
              !Number.isFinite(mascara) ||
              mascara < 0 ||
              mascara > 1 ||
              peso.some((valor) => !Number.isFinite(valor) || valor < 0)
            )
              throw new Error("Atributos de cor fora do perfil");
          }
        }
        objeto.material = Array.isArray(objeto.material)
          ? objeto.material.map((material) => this.material(material))
          : this.material(objeto.material);
      });
    } catch (erro) {
      this.dispose();
      throw erro;
    }
  }

  /** Atualização atômica de valores; não recompila shaders nem remonta esqueletos. */
  definir(escolhas: ReadonlyMap<string, readonly [number, number, number]>): void {
    const nova = new Float32Array(this.paleta.value.length);
    for (const id of escolhas.keys()) {
      if (!this.cores.canais.some((canal) => canal.id === id))
        throw new Error(`Canal de cor desconhecido: ${id}`);
    }
    this.cores.canais.forEach((canal, indice) => {
      const rgb = escolhas.get(canal.id) ?? canal.inicial;
      for (const componente of rgb) {
        if (!Number.isFinite(componente) || componente < 0 || componente > 4096)
          throw new Error(`Cor fora do perfil: ${canal.id}`);
      }
      nova.set(rgb, indice * 3);
    });
    this.paleta.value.set(nova);
  }

  private material(original: Material): Material {
    const existente = this.materiais.get(original);
    if (existente) return existente;
    if (original.userData.moradaCor === undefined) return original;
    const perfil = MaterialDeCorSchema.parse(original.userData.moradaCor);
    if (perfil.tipo === "textura" && perfil.canal >= this.cores.canais.length)
      throw new Error("Material usa canal ausente no manifesto");
    const mascara = perfil.tipo === "textura" ? this.mascaras.get(perfil.mascara) : null;
    if (
      perfil.tipo === "textura" &&
      (!mascara || !this.cores.mascaras?.some((m) => m.arquivo === perfil.mascara))
    )
      throw new Error("Máscara do material ausente no pacote");
    const material = original.clone();
    this.materiais.set(original, material);
    const anterior = original.onBeforeCompile;
    const chaveAnterior = original.customProgramCacheKey();
    material.customProgramCacheKey = () => `${chaveAnterior}|morada-cor-v3:${perfil.tipo}`;
    material.onBeforeCompile = (shader, renderer) => {
      anterior.call(material, shader, renderer);
      shader.uniforms.moradaCores = this.paleta;
      const uniformes = `uniform vec3 moradaCores[${MAXIMO_DE_CANAIS_DE_COR}];`;
      if (perfil.tipo === "vertices") {
        shader.vertexShader = substituir(
          shader.vertexShader,
          "#include <common>",
          `#include <common>
${uniformes}
attribute float _morada_canal_cor;
attribute float _morada_mascara_cor;
attribute vec3 _morada_peso_cor;`,
        );
        shader.vertexShader = substituir(
          shader.vertexShader,
          "#include <color_vertex>",
          `#include <color_vertex>
#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
if (_morada_canal_cor >= 0.0) {
  int canalMorada = int(_morada_canal_cor);
  vColor.rgb = vColor.rgb * (1.0 - _morada_mascara_cor) + _morada_peso_cor * moradaCores[canalMorada];
}
#endif`,
        );
      } else {
        shader.uniforms.moradaCanal = { value: perfil.canal };
        shader.uniforms.moradaLuminancia = { value: perfil.luminancia };
        shader.uniforms.moradaMascara = { value: mascara };
        shader.fragmentShader = substituir(
          shader.fragmentShader,
          "#include <common>",
          `#include <common>
${uniformes}
uniform int moradaCanal;
uniform float moradaLuminancia;
uniform sampler2D moradaMascara;`,
        );
        shader.fragmentShader = substituir(
          shader.fragmentShader,
          "#include <map_fragment>",
          `
#ifdef USE_MAP
vec4 amostraMorada = texture2D(map, vMapUv);
float luzMorada = dot(amostraMorada.rgb, vec3(0.2126, 0.7152, 0.0722));
vec3 livreMorada = moradaCores[moradaCanal] * luzMorada / max(moradaLuminancia, 0.001);
float mascaraMorada = texture2D(moradaMascara, vMapUv).r;
diffuseColor *= vec4(mix(amostraMorada.rgb, livreMorada, mascaraMorada), 1.0);
#endif`,
        );
      }
    };
    return material;
  }

  dispose(): void {
    for (const material of this.materiais.values()) material.dispose();
    this.materiais.clear();
  }
}

function substituir(fonte: string, trecho: string, novo: string): string {
  if (!fonte.includes(trecho))
    throw new Error(`Shader incompatível com o perfil Morada: ${trecho}`);
  return fonte.replace(trecho, novo);
}
