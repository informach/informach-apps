import {
  ATRIBUTO_MASCARA_PINTURA,
  ATRIBUTO_PESO_PINTURA,
  type PinturaDoObjeto,
} from "@informach/morada-arte/manifesto";
import {
  AmbientLight,
  Color,
  InstancedMesh,
  Matrix4,
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
import { PinturaDosMoveis } from "../src/ativos/pintura-dos-moveis";

const perfil: PinturaDoObjeto = {
  perfil: "a".repeat(64),
  rotulo: "Estrutura",
  referencia: 0xc86432,
  mascara: ATRIBUTO_MASCARA_PINTURA,
  pesos: ATRIBUTO_PESO_PINTURA,
};

/** Dois retângulos sintéticos: superfície pintável e detalhe fora da máscara. */
function biblioteca(): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = "#c86432";
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = "#1e3c5a";
  ctx.fillRect(1, 0, 1, 1);
  const retangulo = (a: number, b: number) => [
    a,
    -0.9,
    0,
    b,
    -0.9,
    0,
    a,
    0.9,
    0,
    a,
    0.9,
    0,
    b,
    -0.9,
    0,
    b,
    0.9,
    0,
  ];
  const atributos = [
    {
      nome: "POSITION",
      tipo: "VEC3",
      largura: 3,
      valores: [...retangulo(-0.9, 0), ...retangulo(0, 0.9)],
    },
    {
      nome: "NORMAL",
      tipo: "VEC3",
      largura: 3,
      valores: Array.from({ length: 12 }, () => [0, 0, 1]).flat(),
    },
    {
      nome: "TEXCOORD_0",
      tipo: "VEC2",
      largura: 2,
      valores: Array.from({ length: 12 }, (_, i) => [(i < 6 ? 0.5 : 1.5) / 16, 0.5 / 16]).flat(),
    },
    {
      nome: ATRIBUTO_MASCARA_PINTURA,
      tipo: "SCALAR",
      largura: 1,
      valores: Array.from({ length: 12 }, (_, i) => (i < 6 ? 1 : 0)),
    },
    {
      nome: ATRIBUTO_PESO_PINTURA,
      tipo: "SCALAR",
      largura: 1,
      valores: Array.from({ length: 12 }, (_, i) => (i < 6 ? 1 : 0)),
    },
  ];
  const bytes: number[] = [],
    views: { buffer: number; byteOffset: number; byteLength: number }[] = [];
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
    attributes[a.nome] = accessors.length;
    views.push({ buffer: 0, byteOffset: bytes.length, byteLength: dados.byteLength });
    accessors.push({
      bufferView: accessors.length,
      componentType: 5126,
      count: a.valores.length / a.largura,
      type: a.tipo,
      ...(a.nome === "POSITION" ? { min: [-0.9, -0.9, 0], max: [0.9, 0.9, 0] } : {}),
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
    bufferViews: views,
    accessors,
    meshes: [{ primitives: [{ attributes, material: 0 }] }],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
          baseColorTexture: { index: 0 },
        },
        extras: { moradaPintura: { perfil: perfil.perfil } },
      },
    ],
    images: [{ uri: canvas.toDataURL("image/png") }],
    samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }],
    textures: [{ source: 0, sampler: 0 }],
  });
}

async function conferir() {
  const renderer = new WebGLRenderer({ antialias: false });
  renderer.setSize(128, 64);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  const alvo = new WebGLRenderTarget(128, 64);
  renderer.setRenderTarget(alvo);
  const camera = new OrthographicCamera(-2, 2, 1, -1, 0.1, 10);
  camera.position.z = 2;
  const cena = new Scene(),
    luz = new AmbientLight(0xffffff, Math.PI);
  cena.add(luz);
  const erros: string[] = [],
    medidas: {
      material: string;
      luz: number;
      cores: number[][];
      desvio: number;
      programas: number;
    }[] = [];
  renderer.debug.onShaderError = () => erros.push("Falha de compilação do shader");
  const pixel = (x: number) => {
    const p = new Uint8Array(4);
    renderer.readRenderTargetPixels(alvo, x, 32, 1, 1, p);
    return [...p];
  };
  const desvio = (a: number[], b: number[]) =>
    Math.max(...a.map((v, i) => Math.abs(v - (b[i] ?? -999))));
  try {
    for (const padrao of [false, true]) {
      const pacote = await new GLTFLoader().parseAsync(biblioteca(), "");
      const modelo = pacote.scene.children[0];
      if (!(modelo instanceof Mesh) || !(modelo.material instanceof MeshStandardMaterial))
        throw new Error("Modelo sintético incorreto");
      const original = padrao
        ? modelo.material
        : new MeshBasicMaterial({ map: modelo.material.map });
      original.userData = modelo.material.userData;
      const controle = new PinturaDosMoveis(perfil);
      const material = controle.material(original, modelo.geometry);
      const referencia = padrao
        ? new MeshStandardMaterial({ metalness: 0, roughness: 1 })
        : new MeshBasicMaterial();
      const nativo = new InstancedMesh(modelo.geometry, original, 2),
        pintado = new InstancedMesh(modelo.geometry, material, 2),
        ideal = new InstancedMesh(modelo.geometry, referencia, 2);
      for (const malha of [nativo, pintado, ideal])
        for (let i = 0; i < 2; i++)
          malha.setMatrixAt(i, new Matrix4().makeTranslation(i * 2 - 1, 0, 0));
      for (const malha of [pintado, ideal]) {
        malha.setColorAt(0, new Color(0));
        malha.setColorAt(1, new Color(0xffffff));
      }
      try {
        for (const intensidade of [Math.PI, Math.PI * 2]) {
          luz.intensity = intensidade;
          cena.add(nativo);
          renderer.render(cena, camera);
          const originais = [pixel(16), pixel(48), pixel(80), pixel(112)];
          cena.remove(nativo);
          let programas: number | null = null;
          const pares = [
            [
              [0, 0, 0],
              [1, 1, 1],
            ],
            [
              [1, 0, 0],
              [0, 0, 1],
            ],
            [
              [0, 1, 0],
              [0, 0, 0],
            ],
            [
              [1.8, 0.2, 0.1],
              [0.1, 0.4, 0.8],
            ],
            [
              [0, 0, 0],
              [1, 1, 1],
            ],
          ];
          for (const cores of pares) {
            cores.forEach((rgb, i) => {
              const [r, g, b] = rgb;
              if (r === undefined || g === undefined || b === undefined)
                throw new Error("Cor incompleta");
              const cor = new Color().setRGB(r, g, b);
              pintado.setColorAt(i, cor);
              ideal.setColorAt(i, cor);
            });
            if (pintado.instanceColor) pintado.instanceColor.needsUpdate = true;
            if (ideal.instanceColor) ideal.instanceColor.needsUpdate = true;
            cena.add(pintado);
            renderer.render(cena, camera);
            const reais = [pixel(16), pixel(48), pixel(80), pixel(112)];
            cena.remove(pintado);
            cena.add(ideal);
            renderer.render(cena, camera);
            const esperados = [pixel(16), pixel(80)];
            cena.remove(ideal);
            const atual = renderer.info.programs?.length ?? 0;
            if (programas !== null && atual !== programas)
              throw new Error("Trocar RGB recompilou o shader");
            programas = atual;
            const comparacoes = [
              [reais[0], esperados[0]],
              [reais[1], originais[1]],
              [reais[2], esperados[1]],
              [reais[3], originais[3]],
            ];
            let diferenca = 0;
            for (const [real, esperado] of comparacoes) {
              if (!real || !esperado) throw new Error("Pixel ausente");
              diferenca = Math.max(diferenca, desvio(real, esperado));
            }
            medidas.push({
              material: padrao ? "standard" : "basic",
              luz: intensidade,
              cores,
              desvio: diferenca,
              programas,
            });
          }
        }
      } finally {
        cena.remove(nativo, pintado, ideal);
        nativo.dispose();
        pintado.dispose();
        ideal.dispose();
        controle.dispose();
        referencia.dispose();
        if (original !== modelo.material) original.dispose();
        modelo.material.map?.dispose();
        modelo.material.dispose();
        modelo.geometry.dispose();
      }
    }
    return { erros, medidas };
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
