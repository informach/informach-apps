import { Material, Mesh, MeshLambertMaterial, MeshStandardMaterial, type Object3D } from "three";

/** Materiais locais de um corpo; os mapas e as geometrias continuam no pacote. */
export class MateriaisSimples {
  private readonly copias = new Map<Material, MeshLambertMaterial>();

  aplicar(raiz: Object3D): void {
    raiz.traverse((objeto) => {
      if (!(objeto instanceof Mesh)) return;
      objeto.material = Array.isArray(objeto.material)
        ? objeto.material.map((m) => this.converter(m))
        : this.converter(objeto.material);
    });
  }

  private converter(original: Material): Material {
    if (!(original instanceof MeshStandardMaterial) || original.type !== "MeshStandardMaterial")
      return original;
    const existente = this.copias.get(original);
    if (existente) return existente;
    const material = new MeshLambertMaterial({
      color: original.color,
      map: original.map,
      lightMap: original.lightMap,
      lightMapIntensity: original.lightMapIntensity,
      aoMap: original.aoMap,
      aoMapIntensity: original.aoMapIntensity,
      emissive: original.emissive,
      emissiveMap: original.emissiveMap,
      emissiveIntensity: original.emissiveIntensity,
      bumpMap: original.bumpMap,
      bumpScale: original.bumpScale,
      normalMap: original.normalMap,
      normalMapType: original.normalMapType,
      normalScale: original.normalScale.clone(),
      displacementMap: original.displacementMap,
      displacementScale: original.displacementScale,
      displacementBias: original.displacementBias,
      alphaMap: original.alphaMap,
      envMap: original.envMap,
      envMapIntensity: original.envMapIntensity,
      envMapRotation: original.envMapRotation.clone(),
      wireframe: original.wireframe,
      wireframeLinewidth: original.wireframeLinewidth,
      flatShading: original.flatShading,
      fog: original.fog,
    });
    // O contrato comum de Material copia também alpha, faces, profundidade,
    // stencil e metadados, sem copiar a implementação PBR da subclasse.
    Material.prototype.copy.call(material, original);
    this.copias.set(original, material);
    return material;
  }

  dispose(): void {
    for (const material of this.copias.values()) material.dispose();
    this.copias.clear();
  }
}
