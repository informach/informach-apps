import type { Fase, MoradorId } from "@informach/morada-sim";
import {
  AnimationClip,
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  type Mesh,
  MeshBasicMaterial,
  type Object3D,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { biblioteca, manifesto, personagem } from "../testes/manifesto-de-arte";
import { AtivosDeArte, type PacoteLido } from "./arte";
import type { PoseDoMorador, VisualDoMorador } from "./ativos";

const ORIGEM = "http://jogo.local";
const LIA = "mor_lia" as MoradorId;

const APARENCIA = {
  linha: "f" as const,
  corpo: "adulta",
  pele: 0xcc8866,
  cabelo: "coque",
  roupa: "vestido",
  semente: 1,
};

function pose(extra: Partial<PoseDoMorador> = {}): PoseDoMorador {
  return {
    postura: "em_pe",
    andando: false,
    agindo: false,
    animacao: null,
    carregando: false,
    gravidez: 0,
    agoraMs: 0,
    dtMs: 16,
    ...extra,
  };
}

/** Uma cena com esqueleto, do jeito que o `GLTFLoader` entrega um pacote de personagem. */
function cenaDePersonagem(comPesosDobrados = false): Object3D {
  const cena = new Group();
  const armadura = new Group();
  armadura.name = "Armadura";
  const quadril = new Bone();
  quadril.name = "Hips";
  quadril.position.set(0, 1, 0);
  const esquerda = new Bone();
  esquerda.name = "LeftHand";
  esquerda.position.set(0.3, 0, 0.1);
  const direita = new Bone();
  direita.name = "RightHand";
  direita.position.set(-0.3, 0, 0.1);
  quadril.add(esquerda, direita);
  armadura.add(quadril);

  const geometria = new BufferGeometry();
  geometria.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 1, 0, 0, 2, 0], 3));
  geometria.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4),
  );
  geometria.setAttribute(
    "skinWeight",
    new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  if (comPesosDobrados) {
    geometria.setAttribute(
      "_joints_dobrado",
      new Uint16BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
    );
    geometria.setAttribute(
      "_weights_dobrado",
      new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
    );
  }
  geometria.morphAttributes.position = [new Float32BufferAttribute(new Array(9).fill(0), 3)];
  const corpo = new SkinnedMesh(geometria, new MeshBasicMaterial());
  corpo.name = "corpo";
  corpo.morphTargetDictionary = { gravidez_1: 0 };
  corpo.morphTargetInfluences = [0];
  corpo.add(new Group());
  const ossos = [quadril, esquerda, direita];
  armadura.add(corpo);
  corpo.bind(new Skeleton(ossos));

  const neutro = new Group();
  neutro.name = "rosto_neutro";
  const dormindo = new Group();
  dormindo.name = "rosto_dormindo";
  armadura.add(neutro, dormindo);
  cena.add(armadura);
  return cena;
}

/** Os clipes de uma biblioteca: segurar o bebê leva as duas mãos para a frente. */
function clipesDaBiblioteca(): AnimationClip[] {
  const parado = new AnimationClip("resident.idle.neutral", 1, [
    new VectorKeyframeTrack("Hips.position", [0, 1], [0, 1, 0, 0, 1.02, 0]),
  ]);
  const segurar = new AnimationClip("resident.care.hold_idle", 1, [
    new VectorKeyframeTrack("LeftHand.position", [0, 1], [0.1, 0.1, 0.4, 0.1, 0.1, 0.4]),
    new VectorKeyframeTrack("RightHand.position", [0, 1], [-0.1, 0.1, 0.4, -0.1, 0.1, 0.4]),
  ]);
  const sentar = new AnimationClip("resident.sit.chair.idle", 1, [
    new VectorKeyframeTrack("Hips.position", [0, 1], [0, 0.6, 0, 0, 0.6, 0]),
  ]);
  return [parado, segurar, sentar];
}

type Montagem = {
  ativos: AtivosDeArte;
  pedidos: { url: string; autorizacao: string | null }[];
  falhas: string[];
  liberar(): Promise<void>;
};

function montar(
  opcoes: {
    m?: ReturnType<typeof manifesto>;
    status?: Record<string, number>;
    comPesosDobrados?: boolean;
    token?: () => string;
  } = {},
): Montagem {
  const m = opcoes.m ?? manifesto();
  const pedidos: Montagem["pedidos"] = [];
  const falhas: string[] = [];
  const fetchFalso = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada);
    const cabecalhos = new Headers(init?.headers);
    pedidos.push({ url, autorizacao: cabecalhos.get("authorization") });
    const arquivo = url.slice(`${ORIGEM}/arte/`.length);
    const status = opcoes.status?.[arquivo] ?? 200;
    if (status !== 200) return new Response("{}", { status });
    if (arquivo === "manifest.json") return Response.json(m);
    return new Response(new TextEncoder().encode(arquivo));
  });
  const lerPacote = async (dados: ArrayBuffer): Promise<PacoteLido> => {
    const nome = new TextDecoder().decode(dados);
    if (nome.startsWith("anim-")) return { scene: new Group(), animations: clipesDaBiblioteca() };
    return { scene: cenaDePersonagem(opcoes.comPesosDobrados), animations: [] };
  };
  const ativos = new AtivosDeArte({
    origem: ORIGEM,
    token: opcoes.token ?? (() => "sessao-1"),
    fetch: fetchFalso as unknown as typeof fetch,
    lerPacote,
    aoFalhar: (arquivo) => falhas.push(arquivo),
  });
  return {
    ativos,
    pedidos,
    falhas,
    async liberar() {
      for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    },
  };
}

/** Cria o visual e o aplica uma vez, como a cena faz com quem está no bairro. */
function criar(ativos: AtivosDeArte, fase: Fase = "adulto", moradorId = LIA): VisualDoMorador {
  const visual = ativos.criarMorador({ moradorId, fase, aparencia: APARENCIA });
  visual.aplicar(pose());
  return visual;
}

function vestido(visual: VisualDoMorador): boolean {
  return visual.raiz.getObjectByName("Armadura") !== undefined;
}

function malhaDoCorpo(visual: VisualDoMorador): SkinnedMesh {
  const corpo = visual.raiz.getObjectByName("corpo");
  if (!corpo) throw new Error("sem corpo");
  return corpo as SkinnedMesh;
}

describe("ativos de arte", () => {
  it("o morador nasce procedural e veste o pacote quando ele chega", async () => {
    const { ativos, liberar, pedidos } = montar();
    const visual = criar(ativos);
    expect(vestido(visual)).toBe(false);
    const alturaProcedural = visual.altura;
    await liberar();
    expect(vestido(visual)).toBe(true);
    expect(visual.altura).toBe(1.7);
    expect(visual.altura).not.toBe(alturaProcedural);
    // O clique acerta o morador pelo objeto marcado: a cena marca a raiz, o visual marca o que veste.
    for (const filho of visual.raiz.children) {
      filho.traverse((objeto) => {
        expect(objeto.userData.moradorId).toBe(LIA);
      });
    }
    expect(pedidos.map((p) => p.url)).toEqual([
      `${ORIGEM}/arte/manifest.json`,
      `${ORIGEM}/arte/anim-adulto.0123456789.glb`,
      `${ORIGEM}/arte/lia.abcdef0123.glb`,
    ]);
  });

  it("cada pedido leva a sessão de jogo vigente, nunca no endereço", async () => {
    let token = "sessao-1";
    const { ativos, liberar, pedidos } = montar({ token: () => token });
    criar(ativos);
    await liberar();
    token = "sessao-2";
    criar(ativos, "adulto", "mor_outra" as MoradorId);
    await liberar();
    expect(pedidos.every((p) => p.autorizacao === "Bearer sessao-1")).toBe(true);
    expect(pedidos.every((p) => !p.url.includes("sessao"))).toBe(true);
  });

  it("baixa cada arquivo uma vez, e moradores do mesmo pacote têm esqueletos próprios", async () => {
    const { ativos, liberar, pedidos } = montar();
    const a = criar(ativos);
    const b = criar(ativos, "adulto", "mor_b" as MoradorId);
    await liberar();
    expect(pedidos).toHaveLength(3);
    const ossoA = a.raiz.getObjectByName("LeftHand");
    const ossoB = b.raiz.getObjectByName("LeftHand");
    expect(ossoA).toBeDefined();
    expect(ossoA).not.toBe(ossoB);
    expect(malhaDoCorpo(a).skeleton.bones).toContain(ossoA);
    expect(malhaDoCorpo(a).geometry).toBe(malhaDoCorpo(b).geometry);
  });

  it("sem manifesto, ou sem pacote para a fase, o morador fica procedural; o próximo tenta de novo", async () => {
    const { ativos, liberar, pedidos, falhas } = montar({ status: { "manifest.json": 401 } });
    const visual = criar(ativos);
    await liberar();
    expect(vestido(visual)).toBe(false);
    expect(falhas).toEqual(["manifest.json"]);
    criar(ativos);
    await liberar();
    expect(pedidos.filter((p) => p.url.endsWith("manifest.json"))).toHaveLength(2);

    const outro = montar();
    const idoso = criar(outro.ativos, "idoso");
    await outro.liberar();
    expect(vestido(idoso)).toBe(false);
  });

  it("um pacote que falha deixa o morador procedural, e o seguinte baixa de novo", async () => {
    const { ativos, liberar, pedidos } = montar({ status: { "lia.abcdef0123.glb": 503 } });
    const visual = criar(ativos);
    await liberar();
    expect(vestido(visual)).toBe(false);
    criar(ativos);
    await liberar();
    expect(pedidos.filter((p) => p.url.endsWith("lia.abcdef0123.glb"))).toHaveLength(2);
  });

  it("quem a cena não desenha (fora do bairro) não baixa nada", async () => {
    const { ativos, liberar, pedidos } = montar();
    const visual = ativos.criarMorador({ moradorId: LIA, fase: "adulto", aparencia: APARENCIA });
    await liberar();
    expect(pedidos).toHaveLength(0);
    visual.aplicar(pose());
    await liberar();
    expect(vestido(visual)).toBe(true);
  });

  it("o morador solto antes de o pacote chegar não é vestido", async () => {
    const { ativos, liberar } = montar();
    const visual = criar(ativos);
    visual.dispose();
    await liberar();
    expect(vestido(visual)).toBe(false);
  });

  it("toca o clipe da pose e volta ao descanso sem clipe", async () => {
    const { ativos, liberar } = montar();
    const visual = criar(ativos);
    await liberar();
    const quadril = visual.raiz.getObjectByName("Hips");
    visual.aplicar(pose({ dtMs: 500 }));
    // O parado sobe o quadril de 1 para 1,02 ao longo de um segundo.
    expect(quadril?.position.y).toBeGreaterThan(1.001);
    visual.aplicar(pose({ postura: "no_colo" }));
    expect(quadril?.position.y).toBeCloseTo(1, 6);
  });

  it("sentado, o corpo desce para o apoio do clipe e troca os pesos da saia só no próprio corpo", async () => {
    const m = manifesto({ personagens: [personagem("lia", { pesosDobrado: true })] });
    const { ativos, liberar } = montar({ m, comPesosDobrados: true });
    const a = criar(ativos);
    const b = criar(ativos, "adulto", "mor_b" as MoradorId);
    await liberar();
    const original = malhaDoCorpo(b).geometry.getAttribute("skinIndex");
    a.aplicar(pose({ postura: "sentado" }));
    const armaduraA = a.raiz.getObjectByName("Armadura");
    const posicao = armaduraA?.parent?.parent?.position;
    expect(posicao?.toArray().map((v) => Number(v.toFixed(3)))).toEqual([-0.01, -0.42, -0.12]);
    expect(malhaDoCorpo(a).geometry.getAttribute("skinIndex")).toBe(
      malhaDoCorpo(a).geometry.getAttribute("_joints_dobrado"),
    );
    expect(malhaDoCorpo(b).geometry.getAttribute("skinIndex")).toBe(original);
    a.aplicar(pose());
    expect(malhaDoCorpo(a).geometry.getAttribute("skinIndex")).toBe(original);
  });

  it("segurando o bebê, o colo é o meio das mãos neste quadro; sem segurar, a âncora", async () => {
    const { ativos, liberar } = montar();
    const visual = criar(ativos);
    await liberar();
    visual.aplicar(pose());
    expect(visual.colo).toEqual([0, 1.1, 0.25]);
    // Meio segundo: a passagem de 0,25 s do clipe anterior para o de segurar já acabou.
    visual.aplicar(pose({ carregando: true, dtMs: 500 }));
    const [x, y, z] = visual.colo;
    // As mãos vão para (±0,1; 1,1; 0,4) no referencial do quadril, que está a 1 m do chão.
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(1.1, 6);
    expect(z).toBeCloseTo(0.4, 6);
    // Girar a raiz na cena não muda o colo, que é do referencial dela.
    visual.raiz.rotation.y = 1.2;
    visual.raiz.position.set(5, 0, 3);
    visual.aplicar(pose({ carregando: true }));
    expect(new Vector3(...visual.colo).distanceTo(new Vector3(x, y, z))).toBeLessThan(1e-6);
  });

  it("dorme com o rosto de dormir e mostra um rosto de cada vez", async () => {
    const { ativos, liberar } = montar();
    const visual = criar(ativos);
    await liberar();
    const neutro = visual.raiz.getObjectByName("rosto_neutro");
    const dormindo = visual.raiz.getObjectByName("rosto_dormindo");
    visual.aplicar(pose());
    expect([neutro?.visible, dormindo?.visible]).toEqual([true, false]);
    visual.aplicar(pose({ postura: "deitado", agindo: true, animacao: "resident.sleep.bed" }));
    expect([neutro?.visible, dormindo?.visible]).toEqual([false, true]);
  });

  it("a gravidez mexe nas formas do corpo", async () => {
    const m = manifesto({ personagens: [personagem("lia", { gravidez: ["gravidez_1"] })] });
    const { ativos, liberar } = montar({ m });
    const visual = criar(ativos);
    await liberar();
    visual.aplicar(pose({ gravidez: 1 }));
    expect(malhaDoCorpo(visual).morphTargetInfluences).toEqual([1]);
    visual.aplicar(pose({ gravidez: 0 }));
    expect(malhaDoCorpo(visual).morphTargetInfluences).toEqual([0]);
  });

  it("a biblioteca de grávida só é pedida quando a gravidez chega ao 2º trimestre", async () => {
    const m = manifesto({
      personagens: [personagem("lia", { bibliotecaDeGravida: "adulta_gravida" })],
      bibliotecas: [biblioteca("adulto"), biblioteca("adulta_gravida", { gravida: true })],
    });
    const { ativos, liberar, pedidos } = montar({ m });
    const visual = criar(ativos);
    await liberar();
    visual.aplicar(pose({ gravidez: 0.2 }));
    await liberar();
    expect(pedidos.some((p) => p.url.includes("adulta_gravida"))).toBe(false);
    visual.aplicar(pose({ gravidez: 0.5 }));
    await liberar();
    expect(pedidos.filter((p) => p.url.includes("adulta_gravida"))).toHaveLength(1);
  });

  it("o clique acerta uma caixa do tamanho do corpo, não a malha com esqueleto", async () => {
    const { ativos, liberar } = montar();
    const visual = criar(ativos);
    await liberar();
    const alvos: Mesh[] = [];
    visual.raiz.traverse((objeto) => {
      const malha = objeto as Mesh;
      if (malha.isMesh && !(objeto as SkinnedMesh).isSkinnedMesh) alvos.push(malha);
    });
    expect(alvos).toHaveLength(1);
    const corpo = malhaDoCorpo(visual);
    const acertos: unknown[] = [];
    corpo.raycast({} as never, acertos as never);
    expect(acertos).toHaveLength(0);
  });

  it("soltar os ativos solta o que veio dos pacotes", async () => {
    const { ativos, liberar } = montar();
    const visual = criar(ativos);
    await liberar();
    const geometria = malhaDoCorpo(visual).geometry;
    const soltou = vi.fn();
    geometria.addEventListener("dispose", soltou);
    visual.dispose();
    expect(soltou).not.toHaveBeenCalled();
    ativos.dispose();
    expect(soltou).toHaveBeenCalledOnce();
  });
});
