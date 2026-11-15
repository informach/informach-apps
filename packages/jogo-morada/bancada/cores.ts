import type { CoresDoPersonagem } from "@informach/morada-arte/manifesto";
import {
  AmbientLight,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { CoresParametricas } from "../src/ativos/cores-parametricas";

// Biblioteca inteiramente sintética. PNG: mesmo RGB com máscaras 0, 128 e 255.
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAAb4BS0AAAAEklEQVR4nGPYk6LBAMQNQPwfACAwBVhx5IzqAAAAAElFTkSuQmCC";
const corOriginal = new Color(0xbc6428);
const cores: CoresDoPersonagem = {
  referenciaDePele: "#ffffff",
  canais: [{ id: "ensaio", origem: "cabelo", parte: null, inicial: [1, 1, 1] }],
};

function biblioteca(textura: boolean): string {
  const atributos = [
    {
      nome: "POSITION",
      tipo: "VEC3",
      largura: 3,
      valores: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
    },
    {
      nome: "NORMAL",
      tipo: "VEC3",
      largura: 3,
      valores: Array.from({ length: 6 }, () => [0, 0, 1]).flat(),
    },
    { nome: "TEXCOORD_0", tipo: "VEC2", largura: 2, valores: [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1] },
    {
      nome: "COLOR_0",
      tipo: "VEC3",
      largura: 3,
      valores: Array.from({ length: 6 }, () => [0.2, 0.3, 0.4]).flat(),
    },
    { nome: "_MORADA_CANAL_COR", tipo: "SCALAR", largura: 1, valores: [0, 0, 0, 0, 0, 0] },
    {
      nome: "_MORADA_MASCARA_COR",
      tipo: "SCALAR",
      largura: 1,
      valores: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    },
    {
      nome: "_MORADA_PESO_COR",
      tipo: "VEC3",
      largura: 3,
      valores: Array.from({ length: 6 }, () => [0.7, 0.8, 0.9]).flat(),
    },
  ].filter(
    (a) =>
      !textura ||
      !["COLOR_0", "_MORADA_CANAL_COR", "_MORADA_MASCARA_COR", "_MORADA_PESO_COR"].includes(a.nome),
  );
  const bytes: number[] = [];
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = [];
  const accessors: {
    bufferView: number;
    componentType: number;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
  }[] = [];
  const attributes: Record<string, number> = {};
  for (const a of atributos) {
    const dados = new Float32Array(a.valores);
    bufferViews.push({ buffer: 0, byteOffset: bytes.length, byteLength: dados.byteLength });
    attributes[a.nome] = accessors.length;
    accessors.push({
      bufferView: accessors.length,
      componentType: 5126,
      count: a.valores.length / a.largura,
      type: a.tipo,
      ...(a.nome === "POSITION" ? { min: [-1, -1, 0], max: [1, 1, 0] } : {}),
    });
    bytes.push(...new Uint8Array(dados.buffer));
  }
  return JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    buffers: [
      {
        byteLength: bytes.length,
        uri: `data:application/octet-stream;base64,${btoa(String.fromCharCode(...bytes))}`,
      },
    ],
    bufferViews,
    accessors,
    meshes: [{ primitives: [{ attributes, material: 0 }] }],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
          ...(textura ? { baseColorTexture: { index: 0 } } : {}),
        },
        alphaMode: "OPAQUE",
        extras: {
          moradaCor: textura
            ? { tipo: "textura", canal: 0, luminancia: 0.5, mascara: "alpha" }
            : { tipo: "vertices" },
        },
      },
    ],
    ...(textura
      ? {
          images: [{ uri: `data:image/png;base64,${png}` }],
          samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }],
          textures: [{ source: 0, sampler: 0 }],
        }
      : {}),
  });
}

async function conferir() {
  const renderer = new WebGLRenderer({ antialias: false });
  renderer.setSize(96, 32);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  const alvo = new WebGLRenderTarget(96, 32);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  const cena = new Scene();
  cena.add(new AmbientLight(0xffffff, Math.PI));
  renderer.setRenderTarget(alvo);
  const pixel = (x: number) => {
    const bytes = new Uint8Array(4);
    renderer.readRenderTargetPixels(alvo, x, 16, 1, 1, bytes);
    return [...bytes];
  };
  const medidas: {
    tipo: string;
    material: string;
    cor: number[];
    desvio: number;
    programas: number;
  }[] = [];
  const erros: string[] = [];
  renderer.debug.onShaderError = (_gl, _program, _vertex, _fragment) => {
    erros.push("Falha de compilação do shader");
  };
  try {
    for (const textura of [false, true])
      for (const padrao of [false, true]) {
        const pacote = await new GLTFLoader().parseAsync(biblioteca(textura), "");
        const modelo = clone(pacote.scene);
        const materiaisOriginais = new Set<MeshBasicMaterial | MeshStandardMaterial>();
        const texturas = new Set<NonNullable<MeshStandardMaterial["map"]>>();
        modelo.traverse((objeto) => {
          if (!(objeto instanceof Mesh) || Array.isArray(objeto.material)) return;
          const original = objeto.material;
          if (!(original instanceof MeshStandardMaterial))
            throw new Error("Material do GLTF inesperado");
          materiaisOriginais.add(original);
          if (original.map) texturas.add(original.map);
          const material = padrao
            ? original
            : new MeshBasicMaterial({ map: original.map, vertexColors: original.vertexColors });
          material.userData = original.userData;
          materiaisOriginais.add(material);
          objeto.material = material;
        });
        const controle = new CoresParametricas(modelo, cores);
        cena.add(modelo);
        let programas = 0;
        try {
          for (const cor of [
            [0.1, 0.4, 0.8],
            [1, 0, 0],
            [1.8, 0.2, 0.1],
            [0.1, 0.4, 0.8],
          ]) {
            const [r, g, b] = cor;
            if (r === undefined || g === undefined || b === undefined)
              throw new Error("Cor ausente");
            const antes = renderer.info.programs?.length ?? 0;
            controle.definir(new Map([["ensaio", [r, g, b]]]));
            renderer.render(cena, camera);
            const reais = [pixel(16), pixel(48), pixel(80)];
            const compilados = renderer.info.programs?.length ?? 0;
            if (programas !== 0 && antes !== compilados)
              throw new Error("Trocar cor recompilou o shader");
            programas = compilados;
            let desvio = 0;
            modelo.visible = false;
            for (let i = 0; i < 3; i++) {
              const mascara = [0, 128 / 255, 1][i];
              if (mascara === undefined) throw new Error("Máscara ausente");
              const peso =
                (0.2126 * corOriginal.r + 0.7152 * corOriginal.g + 0.0722 * corOriginal.b) / 0.5;
              const esperado = textura
                ? new Color().setRGB(
                    corOriginal.r * (1 - mascara) + r * peso * mascara,
                    corOriginal.g * (1 - mascara) + g * peso * mascara,
                    corOriginal.b * (1 - mascara) + b * peso * mascara,
                  )
                : new Color().setRGB(0.1 + 0.7 * r, 0.15 + 0.8 * g, 0.2 + 0.9 * b);
              const referencia = padrao
                ? new MeshStandardMaterial({ color: esperado, metalness: 0, roughness: 1 })
                : new MeshBasicMaterial({ color: esperado });
              const malha = modelo.children[0];
              if (!(malha instanceof Mesh)) throw new Error("Malha ausente");
              const amostra = new Mesh(malha.geometry, referencia);
              cena.add(amostra);
              renderer.render(cena, camera);
              const ideal = pixel(48);
              const real = reais[i];
              if (!real) throw new Error("Pixel ausente");
              for (let k = 0; k < 3; k++) {
                const a = ideal[k],
                  b = real[k];
                if (a === undefined || b === undefined) throw new Error("Canal ausente");
                desvio = Math.max(desvio, Math.abs(a - b));
              }
              cena.remove(amostra);
              referencia.dispose();
            }
            modelo.visible = true;
            medidas.push({
              tipo: textura ? "textura" : "vertices",
              material: padrao ? "standard" : "basic",
              cor,
              desvio,
              programas,
            });
          }
        } finally {
          cena.remove(modelo);
          controle.dispose();
          for (const material of materiaisOriginais) material.dispose();
          for (const textura of texturas) {
            textura.dispose();
            if (textura.image instanceof ImageBitmap) textura.image.close();
          }
          pacote.scene.traverse((objeto) => {
            if (objeto instanceof Mesh) objeto.geometry.dispose();
          });
        }
      }
    return { medidas, erros };
  } finally {
    alvo.dispose();
    renderer.dispose();
  }
}

document.getElementById("conferir")?.addEventListener("click", async () => {
  const resultado = document.getElementById("resultado");
  if (!resultado) return;
  resultado.textContent = "Conferindo";
  try {
    resultado.textContent = JSON.stringify(await conferir());
    resultado.dataset.estado = "feito";
  } catch (erro) {
    resultado.textContent = erro instanceof Error ? erro.message : String(erro);
    resultado.dataset.estado = "falha";
  }
});
