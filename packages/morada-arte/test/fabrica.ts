import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { Document, NodeIO } from "@gltf-transform/core";
import { escreverPng } from "../src/leitura/imagem";

/**
 * Uma biblioteca de arte de mentira, inventada aqui: um corpo que é uma caixa
 * com um esqueleto mínimo, uma peça de roupa, um cabelo, os catálogos, as
 * tabelas da página e uma biblioteca de animação. Nada disto vem da arte de
 * verdade; serve para os testes exercitarem os leitores e o empacotador.
 */

/** O envelope dos arquivos de texto da biblioteca: gzip + base64. */
export const emGzBase64 = (bytes: Uint8Array | string): string =>
  gzipSync(bytes).toString("base64");

export type BlocoDeTeste = {
  nome: string;
  tipo: "uint8" | "uint16" | "int16" | "uint32" | "float32";
  valores: number[];
};

/** Monta um item no formato MIT1 a partir de um cabeçalho e de blocos. */
export function itemMit1(
  cabecalho: Record<string, unknown>,
  blocos: readonly BlocoDeTeste[],
): Buffer {
  const partes: Buffer[] = [];
  const indice: Record<string, [number, number, string]> = {};
  let deslocamento = 0;
  for (const bloco of blocos) {
    const vetor =
      bloco.tipo === "uint8"
        ? Uint8Array.from(bloco.valores)
        : bloco.tipo === "uint16"
          ? Uint16Array.from(bloco.valores)
          : bloco.tipo === "int16"
            ? Int16Array.from(bloco.valores)
            : bloco.tipo === "uint32"
              ? Uint32Array.from(bloco.valores)
              : Float32Array.from(bloco.valores);
    const bytes = Buffer.from(vetor.buffer, vetor.byteOffset, vetor.byteLength);
    indice[bloco.nome] = [deslocamento, bytes.length, bloco.tipo];
    partes.push(bytes);
    deslocamento += bytes.length;
  }
  const json = Buffer.from(JSON.stringify({ ...cabecalho, blocos: indice }), "utf8");
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32LE(json.length, 0);
  return Buffer.concat([Buffer.from("MIT1", "latin1"), tamanho, json, ...partes]);
}

const OSSOS: [nome: string, pai: number, y: number][] = [
  ["Root", -1, 0],
  ["Hips", 0, 0.5],
  ["Head", 1, 0.4],
  ["LeftHand", 1, 0.2],
  ["RightHand", 1, 0.2],
  ["LeftHandProp", 3, 0.05],
  ["RightHandProp", 4, 0.05],
  ["LeftFoot", 1, -0.45],
  ["RightFoot", 1, -0.45],
];

/** Um quadrado de lado 0,4 a uma altura, virado para +Z: quatro vértices e dois triângulos. */
function quadrado(
  y: number,
  z: number,
): { posicoes: number[]; normais: number[]; uv: number[]; indices: number[] } {
  return {
    posicoes: [-0.2, y, z, 0.2, y, z, 0.2, y + 0.4, z, -0.2, y + 0.4, z],
    normais: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uv: [0.1, 0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

async function corpoDeTeste(id: string): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const armadura = doc.createNode(id);
  const nos = OSSOS.map(([nome, , y]) =>
    doc
      .createNode(nome)
      .setTranslation([nome.includes("Left") ? 0.2 : nome.includes("Right") ? -0.2 : 0, y, 0]),
  );
  OSSOS.forEach(([, pai], i) => {
    const no = nos[i];
    if (no) (pai < 0 ? armadura : nos[pai])?.addChild(no);
  });
  // matrizes de ligação: inversa da posição de cada osso no mundo (só translação)
  const mundo: number[][] = [];
  OSSOS.forEach(([nome, pai, y], i) => {
    const base = pai < 0 ? [0, 0, 0] : (mundo[pai] ?? [0, 0, 0]);
    mundo[i] = [
      (base[0] ?? 0) + (nome.includes("Left") ? 0.2 : nome.includes("Right") ? -0.2 : 0),
      (base[1] ?? 0) + y,
      0,
    ];
  });
  const inversas = new Float32Array(OSSOS.length * 16);
  mundo.forEach((p, i) => {
    inversas.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -(p[0] ?? 0), -(p[1] ?? 0), 0, 1], i * 16);
  });
  const skin = doc
    .createSkin("esqueleto")
    .setInverseBindMatrices(
      doc.createAccessor().setType("MAT4").setArray(inversas).setBuffer(buffer),
    );
  for (const no of nos) skin.addJoint(no);
  const cena = doc.createScene("cena").addChild(armadura);
  const material = (nome: string) => doc.createMaterial(nome).setDoubleSided(true);
  const materiais = {
    Pele: material("Pele"),
    Rosto: material("Rosto"),
    Boca: material("Boca"),
    Cabelo: material("Cabelo"),
  };
  const primitiva = (
    g: ReturnType<typeof quadrado>,
    mat: keyof typeof materiais,
    osso: number,
    formas: string[],
  ) => {
    const vertices = g.posicoes.length / 3;
    const prim = doc
      .createPrimitive()
      .setMaterial(materiais[mat])
      .setIndices(
        doc
          .createAccessor()
          .setType("SCALAR")
          .setArray(Uint16Array.from(g.indices))
          .setBuffer(buffer),
      )
      .setAttribute(
        "POSITION",
        doc
          .createAccessor()
          .setType("VEC3")
          .setArray(Float32Array.from(g.posicoes))
          .setBuffer(buffer),
      )
      .setAttribute(
        "NORMAL",
        doc
          .createAccessor()
          .setType("VEC3")
          .setArray(Float32Array.from(g.normais))
          .setBuffer(buffer),
      )
      .setAttribute(
        "TEXCOORD_0",
        doc.createAccessor().setType("VEC2").setArray(Float32Array.from(g.uv)).setBuffer(buffer),
      )
      .setAttribute(
        "JOINTS_0",
        doc
          .createAccessor()
          .setType("VEC4")
          .setArray(Uint8Array.from({ length: vertices * 4 }, (_, k) => (k % 4 === 0 ? osso : 0)))
          .setBuffer(buffer),
      )
      .setAttribute(
        "WEIGHTS_0",
        doc
          .createAccessor()
          .setType("VEC4")
          .setArray(Float32Array.from({ length: vertices * 4 }, (_, k) => (k % 4 === 0 ? 1 : 0)))
          .setBuffer(buffer),
      );
    for (const [k, nomeDaForma] of formas.entries()) {
      const delta = Float32Array.from({ length: vertices * 3 }, (_, i) =>
        i % 3 === 2 ? 0.01 * (k + 1) : 0,
      );
      prim.addTarget(
        doc
          .createPrimitiveTarget(nomeDaForma)
          .setAttribute(
            "POSITION",
            doc.createAccessor().setType("VEC3").setArray(delta).setBuffer(buffer),
          )
          .setAttribute(
            "NORMAL",
            doc
              .createAccessor()
              .setType("VEC3")
              .setArray(new Float32Array(vertices * 3))
              .setBuffer(buffer),
          ),
      );
    }
    return prim;
  };
  const malha = (nome: string, primitivas: ReturnType<typeof primitiva>[], formas: string[]) => {
    const m = doc.createMesh(nome);
    for (const p of primitivas) m.addPrimitive(p);
    if (formas.length) m.setWeights(formas.map(() => 0)).setExtras({ targetNames: formas });
    armadura.addChild(doc.createNode(`${id}_${nome}`).setMesh(m).setSkin(skin));
  };
  malha("corpo", [primitiva(quadrado(0.5, 0), "Pele", 1, [])], []);
  malha("cabelo", [primitiva(quadrado(0.95, 0.02), "Cabelo", 2, [])], []);
  malha("cabelo_raspado", [primitiva(quadrado(0.95, 0.01), "Cabelo", 2, [])], []);
  const fala = ["fala_A", "fala_O"];
  for (const expressao of ["neutro", "feliz", "dormindo"]) {
    malha(
      `rosto_${expressao}`,
      [
        primitiva(quadrado(0.9, 0.03), "Rosto", 2, fala),
        primitiva(quadrado(0.9, 0.04), "Boca", 2, fala),
      ],
      fala,
    );
  }
  doc.getRoot().setDefaultScene(cena);
  return new NodeIO().writeBinary(doc);
}

async function bibliotecaDeAnimacaoDeTeste(id: string): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const armadura = doc.createNode(id);
  const nos = OSSOS.map(([nome, , y]) =>
    doc
      .createNode(nome)
      .setTranslation([nome.includes("Left") ? 0.2 : nome.includes("Right") ? -0.2 : 0, y, 0]),
  );
  OSSOS.forEach(([, pai], i) => {
    const no = nos[i];
    if (no) (pai < 0 ? armadura : nos[pai])?.addChild(no);
  });
  doc.getRoot().setDefaultScene(doc.createScene("cena").addChild(armadura));
  const quadros = 31;
  const tempos = Float32Array.from({ length: quadros }, (_, k) => (k + 1) / 30);
  for (const nome of [
    "resident.idle.neutral",
    "resident.walk.normal",
    "resident.sit.chair.idle",
    "resident.lie.idle",
    "resident.sleep.idle",
    "resident.care.hold_idle",
  ]) {
    const animacao = doc.createAnimation(nome);
    const cabeca = nos[2];
    const quadril = nos[1];
    if (!cabeca || !quadril) continue;
    // a cabeça balança de um lado para o outro e volta; o quadril não sai do lugar
    const rotacao = Float32Array.from({ length: quadros * 4 }, (_, i) => {
      const k = Math.floor(i / 4);
      const angulo = 0.3 * Math.sin((2 * Math.PI * k) / (quadros - 1));
      return [0, Math.sin(angulo / 2), 0, Math.cos(angulo / 2)][i % 4] ?? 0;
    });
    const amostradorR = doc
      .createAnimationSampler()
      .setInput(doc.createAccessor().setType("SCALAR").setArray(tempos).setBuffer(buffer))
      .setOutput(doc.createAccessor().setType("VEC4").setArray(rotacao).setBuffer(buffer));
    const amostradorT = doc
      .createAnimationSampler()
      .setInterpolation("STEP")
      .setInput(
        doc
          .createAccessor()
          .setType("SCALAR")
          .setArray(Float32Array.from([1 / 30, 31 / 30]))
          .setBuffer(buffer),
      )
      .setOutput(
        doc
          .createAccessor()
          .setType("VEC3")
          .setArray(Float32Array.from([0, 0.5, 0, 0, 0.5, 0]))
          .setBuffer(buffer),
      );
    animacao.addSampler(amostradorR).addSampler(amostradorT);
    animacao.addChannel(
      doc
        .createAnimationChannel()
        .setTargetNode(cabeca)
        .setTargetPath("rotation")
        .setSampler(amostradorR),
    );
    animacao.addChannel(
      doc
        .createAnimationChannel()
        .setTargetNode(quadril)
        .setTargetPath("translation")
        .setSampler(amostradorT),
    );
  }
  return new NodeIO().writeBinary(doc);
}

/**
 * A ligação de um pano em losango com a pele: quatro pontos presos ao primeiro triângulo, cada um com o
 * deslocamento (em passos de 0,05 mm) que o leva a um canto do losango, a 2 cm da pele. O losango é
 * comprido de propósito: a página puxa para a média dos vizinhos o ponto que fica longe dela, e num
 * losango assim nenhum ponto sai do lugar.
 */
const PANO: BlocoDeTeste[] = [
  { nome: "m_tri", tipo: "uint16", valores: [0, 0, 0, 0] },
  { nome: "m_bar", tipo: "uint16", valores: [65535, 0, 0, 65535, 0, 0, 0, 1] },
  {
    nome: "m_off",
    tipo: "int16",
    valores: [-4000, 4000, 400, -4000, -28000, 400, 4000, -4000, 400, -4000, 28000, 400],
  },
];

const PAGINA = `<script type="module">
const CORPOS = [
  { id: "boneco", rotulo: "Boneco", sexo: "m", idade: "adulto" },
];
const EXPR = { neutro: "Neutro", feliz: "Feliz", dormindo: "Dormindo" };
const CABELO_CORES = { "Castanho": "#5a3f33", "Preto": "#262322" };
const COR_PADRAO = { boneco: "Castanho" };
const MANTA_CORES = { "Creme": "#f6efe2" };
const GEMEO = { boneca: "boneco" };
const COM_GRAVIDA = new Set(["boneca"]);
const TONS = { "Clara": "#FFB69F", "Escura": "#482B25" };
const REF = "#FB9D72"; // cor média
const ROSTO = { "Clara": 1, "Escura": 0.28 };
</script>`;

function imagemLisa(lado: number, cor: [number, number, number]): Uint8Array {
  const dados = new Uint8Array(lado * lado * 4);
  for (let i = 0; i < lado * lado; i++) dados.set([...cor, 255], i * 4);
  return escreverPng({ largura: lado, altura: lado, dados });
}

function imagemXadrez(lado: number): Uint8Array {
  const dados = new Uint8Array(lado * lado * 4);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const claro = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
      dados.set(claro ? [240, 240, 240, 255] : [40, 40, 40, 255], (y * lado + x) * 4);
    }
  }
  return escreverPng({ largura: lado, altura: lado, dados });
}

/** Escreve a biblioteca de mentira em `pasta` e devolve o caminho dela. */
export async function fabricarArte(pasta: string): Promise<string> {
  const escrever = (relativo: string, conteudo: string | Uint8Array) => {
    const caminho = join(pasta, relativo);
    mkdirSync(dirname(caminho), { recursive: true });
    writeFileSync(caminho, conteudo);
  };
  escrever("biblioteca/corpos/boneco.glb", await corpoDeTeste("boneco"));
  escrever("biblioteca/bibliotecas_30fps/boneco.glb", await bibliotecaDeAnimacaoDeTeste("boneco"));
  // a malha-base da família é a própria pele do boneco (os mesmos dois triângulos)
  escrever(
    "biblioteca/itens/familias.txt",
    emGzBase64(
      JSON.stringify({
        m: {
          tris: [0, 1, 2, 0, 2, 3],
          areas: [0.08, 0.08],
          nv: 4,
          cabeca: [
            [-0.2, -0.1, 0.9],
            [0.2, 0.1, 1.3],
          ],
        },
      }),
    ),
  );
  escrever(
    "biblioteca/itens/peles.txt",
    emGzBase64(
      JSON.stringify({
        boneco: {
          familia: "m",
          b2g: [0, 1, 2, 3],
          afim: [
            [1, 0, 0, 0],
            [0, 0, 1, 0],
            [0, -1, 0, 0],
          ],
          cabeca: [
            [-0.2, -0.1, 0.9],
            [0.2, 0.1, 1.3],
          ],
        },
      }),
    ),
  );
  // uma camisa: um losango a 2 cm da pele, maior do que ela (cobre o quadrado inteiro com folga)
  const camisa = itemMit1(
    {
      id: "camisa",
      familias: { m: true },
      tipo: "pele",
      uv: true,
      nv: 4,
      ni: 2,
      grupos: [[0, 6, "Roupa_Gen_liso"]],
    },
    [
      ...PANO,
      { nome: "uv", tipo: "uint16", valores: [6553, 6553, 58981, 6553, 58981, 58981, 6553, 58981] },
      { nome: "idx", tipo: "uint16", valores: [0, 1, 2, 0, 2, 3] },
    ],
  );
  escrever("biblioteca/itens/camisa.txt", emGzBase64(camisa));
  const xadrez = itemMit1(
    {
      id: "xadrez",
      familias: { m: true },
      tipo: "pele",
      uv: true,
      nv: 4,
      ni: 2,
      grupos: [[0, 6, "Roupa_Gen_xadrez"]],
    },
    [
      ...PANO,
      { nome: "uv", tipo: "uint16", valores: [0, 0, 65535, 0, 65535, 65535, 0, 65535] },
      { nome: "idx", tipo: "uint16", valores: [0, 1, 2, 0, 2, 3] },
    ],
  );
  escrever("biblioteca/itens/xadrez.txt", emGzBase64(xadrez));
  const topete = itemMit1(
    {
      id: "topete",
      familias: { m: true },
      tipo: "cabeca",
      uv: true,
      nv: 3,
      ni: 1,
      grupos: [[0, 3, "Cor"]],
    },
    [
      { nome: "m_pos", tipo: "float32", valores: [0, 0.5, 1, 1, 0.5, 1, 0.5, 0.5, 1.2] },
      { nome: "uv", tipo: "uint16", valores: [0, 0, 65535, 0, 0, 65535] },
      { nome: "idx", tipo: "uint16", valores: [0, 1, 2] },
    ],
  );
  escrever("biblioteca/itens/topete.txt", emGzBase64(topete));
  escrever(
    "codigo/arte/roupas.json",
    JSON.stringify({
      slots: {
        cima: "Parte de cima",
        baixo: "Parte de baixo",
        cabeca: "Chapéu",
        mao_dir: "Na mão direita",
      },
      itens: [
        {
          id: "camisa",
          slot: "cima",
          rotulo: "Camisa",
          tipo: "pele",
          variacao: { cor: "#3D7BD6" },
        },
        {
          id: "camisa_vermelha",
          base: "camisa",
          rotulo: "Camisa vermelha",
          variacao: { cor: "#D9433B" },
        },
        { id: "xadrez", slot: "cima", rotulo: "Camisa xadrez", tipo: "pele" },
      ],
    }),
  );
  escrever(
    "codigo/arte/cabelos.json",
    JSON.stringify({
      grupos: {},
      originais: { m: "topete", f: "topete", p: "topete" },
      itens: [{ id: "topete", tipo: "cabelo", rotulo: "Topete" }],
    }),
  );
  escrever(
    "codigo/arte/elenco.json",
    JSON.stringify({
      grupos: { teste: "Teste" },
      personagens: [
        {
          id: "teste_ze",
          nome: "Zé",
          grupo: "teste",
          faixa: "adulto",
          corpo: "boneco",
          pele: "Clara",
          expressao: "neutro",
          cabelo: { penteado: "topete", cor: "Preto", barba: "nenhum" },
          roupa: { cima: { id: "camisa", cor: "#D9433B" } },
          objetos: {},
          animacao: null,
        },
      ],
    }),
  );
  escrever(
    "biblioteca/roupas_mascaras/mascaras.json",
    JSON.stringify({
      camisa: { Roupa_Gen_liso: { mascara: "camisa__Roupa_Gen_liso.png", lum: 0.5 } },
    }),
  );
  escrever("biblioteca/roupas_mascaras/camisa__Roupa_Gen_liso.png", imagemLisa(4, [255, 255, 255]));
  escrever("biblioteca/roupas_gen/Roupa_Gen_liso.png", imagemLisa(4, [188, 188, 188]));
  escrever("biblioteca/roupas_gen/Roupa_Gen_xadrez.png", imagemXadrez(16));
  escrever("paginas/tipos_de_corpo/corpos/paleta.png", imagemLisa(8, [251, 157, 114]));
  escrever("paginas/tipos_de_corpo/corpos.html", PAGINA);
  escrever(
    "biblioteca/info.json",
    JSON.stringify({
      apoios: {
        boneco: { "resident.sit.chair.idle": { tipo: "assento", altura: 0.4, x: 0, y: 0 } },
      },
      correcoes: {},
    }),
  );
  escrever(
    "biblioteca/rotulos.json",
    JSON.stringify({
      categorias: ["Teste"],
      rotulos: { "resident.idle.neutral": ["Teste", "Parado"] },
      compostas: {},
    }),
  );
  return pasta;
}
