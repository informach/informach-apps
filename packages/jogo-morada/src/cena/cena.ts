import {
  type EstadoDoMundo,
  type LoteId,
  listar,
  type MoradorId,
  type ObjetoId,
  obter,
  type PontoMm,
} from "@informach/morada-sim";
import { doCatalogo } from "@informach/morada-sim/conteudo";
import {
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import type { Ativos, ObjetoDaCena, VisualDosObjetos } from "../ativos/ativos";
import type { Sessao } from "../espelho/sessao";
import { nomeDoObjeto } from "../modelo/menu";
import { fracaoDoDia } from "../modelo/painel";
import { familiasDoJogador } from "../modelo/retratos";
import { montarCasa, montarTerreno } from "./casa";
import { centroDaCelula, daCena, METROS_POR_MM, type PontoDaCena, paraCena } from "./espaco";
import { MoradoresDaCena } from "./moradores";
import { CORTE_DAS_PAREDES_MM } from "./planta";
import { alturaDoPiso } from "./situacao";

/**
 * A cena do jogo: uma classe dona do renderer, da câmera, do laço e de tudo o
 * que vai para a placa de vídeo. Lê o espelho a cada quadro e nunca o muda;
 * um clique vira um pedido para quem a montou.
 *
 * O laço para quando a aba some e quando o contexto WebGL se perde. Quando o
 * contexto volta, a cena é refeita a partir do espelho; a rede e o espelho
 * não ficam sabendo.
 */

export type Qualidade = "alta" | "media" | "baixa";

const QUALIDADES: Record<Qualidade, { dpr: number; sombras: boolean; quadroMs: number }> = {
  alta: { dpr: 2, sombras: true, quadroMs: 0 },
  media: { dpr: 1.5, sombras: false, quadroMs: 0 },
  // A mais baixa também limita a 30 quadros por segundo.
  baixa: { dpr: 1, sombras: false, quadroMs: 1000 / 30 },
};
const DEGRAUS: Qualidade[] = ["alta", "media", "baixa"];

const CEU_DE_DIA = new Color(0.72, 0.84, 0.94);
const CEU_DO_ENTARDECER = new Color(0.96, 0.7, 0.5);
const CLARIDADE_DE_DIA = new Color(0.9, 0.94, 1);
const SOL_DE_DIA = new Color(1, 0.95, 0.86);

/** A cada janela deste tamanho a cena confere se está dando conta. */
const JANELA_DE_MEDIDA_MS = 5000;
/** Se 5% dos quadros da janela passam disto, a qualidade desce um degrau. */
const LIMITE_DO_P95_MS = 20;

export type AlvoClicado =
  | { t: "morador"; moradorId: MoradorId }
  | { t: "objeto"; objetoId: ObjetoId }
  | { t: "chao"; loteId: LoteId; pos: PontoMm; livre: boolean };

export type MedidasDaCena = {
  qualidade: Qualidade;
  /** Texto do WebGL sobre a placa (`UNMASKED_RENDERER_WEBGL`), quando o navegador conta. */
  placa: string;
  /** Intervalo entre quadros: p95 e média da última janela de 5 s, em milissegundos. */
  p95Ms: number | null;
  mediaMs: number | null;
  /** Tempo gasto pela própria cena em cada quadro (conta e desenho), média da última janela. */
  custoMs: number | null;
  chamadas: number;
  triangulos: number;
  quadros: number;
};

export type OpcoesDaCena = {
  sessao: Sessao;
  ativos: Ativos;
  /** Como chamar outro jogador, para o rótulo de quem ele dirige. */
  nomeDoJogador(jogadorId: string): string;
  /** A pessoa clicou em algo. `x` e `y` são relativos ao elemento da cena. */
  aoClicar(alvo: AlvoClicado, x: number, y: number): void;
  /** A pessoa começou a mexer na cena (arrastar, clicar): fecha o que estiver aberto por cima. */
  aoTocar(): void;
  qualidade?: Qualidade;
};

function placaDe(renderer: WebGLRenderer): string {
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const texto: unknown = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
  return typeof texto === "string" ? texto : "";
}

/** A qualidade de partida: um palpite pelo aparelho, corrigido depois pela medida dos quadros. */
function qualidadeInicial(placa: string): Qualidade {
  if (/swiftshader|llvmpipe|software|basic render/i.test(placa)) return "baixa";
  const nucleos = navigator.hardwareConcurrency ?? 8;
  const toque = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  if (nucleos <= 4 || toque) return "media";
  return "alta";
}

export class Cena {
  private readonly sessao: Sessao;
  private readonly ativos: Ativos;
  private readonly opcoes: OpcoesDaCena;
  private readonly host: HTMLElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  // Campo de visão estreito e câmera longe: quase isométrico, sem os moradores
  // tombarem para os lados nas bordas da tela.
  private readonly camera = new PerspectiveCamera(30, 1, 0.5, 500);
  private readonly controles: MapControls;
  private readonly sol = new DirectionalLight(0xfff1dc, 1.4);
  private readonly ceu = new HemisphereLight(0xdfeaff, 0x6c7a55, 0.8);
  private readonly fundo = new Color(0xbfd9ee);
  /** Um material só para tudo o que é fundido: a cor vem dos vértices. */
  private readonly materialFixo = new MeshLambertMaterial({ vertexColors: true });
  private readonly mundo = new Group();
  private readonly raio = new Raycaster();
  private readonly observador: ResizeObserver;
  private readonly cancelarAtivos: (() => void) | undefined;

  private moradores: MoradoresDaCena;
  private objetos: VisualDosObjetos | null = null;
  private itens: ObjetoDaCena[] = [];
  private terreno: Mesh | null = null;
  private pisos: Mesh[] = [];
  private paredes: Mesh[] = [];
  private destino: Mesh | null = null;
  private destinoAte = 0;

  private qualidadeAtual: Qualidade;
  private placa = "";
  private raf = 0;
  private ultimo = 0;
  private descartada = false;
  private perdida = false;
  private revisaoMontada = -1;
  private paredesMontadas: boolean | null = null;
  private enquadrada = false;
  private readonly teclas = new Set<string>();
  private foco: { de: Vector3; para: Vector3; inicio: number } | null = null;
  private toque: { x: number; y: number; em: number } | null = null;
  /** Onde o ponteiro parou por último, em coordenadas do elemento da cena; espera o próximo quadro. */
  private ponteiro: { x: number; y: number } | null = null;
  private rafDoPonteiro = 0;
  private extensaoDePerda: WEBGL_lose_context | null = null;

  // Medida dos quadros.
  private intervalos: number[] = [];
  private custos: number[] = [];
  private janelaDesde = 0;
  private medidas: Pick<MedidasDaCena, "p95Ms" | "mediaMs" | "custoMs"> = {
    p95Ms: null,
    mediaMs: null,
    custoMs: null,
  };
  private quadros = 0;

  constructor(host: HTMLElement, opcoes: OpcoesDaCena) {
    this.host = host;
    this.opcoes = opcoes;
    this.sessao = opcoes.sessao;
    this.ativos = opcoes.ativos;

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.placa = placaDe(this.renderer);
    this.qualidadeAtual = opcoes.qualidade ?? qualidadeInicial(this.placa);

    const canvas = this.renderer.domElement;
    canvas.className = "morada-tela";
    canvas.tabIndex = 0;
    canvas.setAttribute(
      "aria-label",
      "Cena do jogo. Arraste para andar pela casa, use a roda para aproximar e toque em um móvel ou morador para ver o que fazer.",
    );
    host.appendChild(canvas);

    this.scene.background = this.fundo;
    this.scene.add(this.ceu, this.sol, this.sol.target, this.mundo);
    this.sol.shadow.mapSize.set(2048, 2048);
    this.sol.shadow.bias = -0.0004;
    this.sol.shadow.normalBias = 0.03;

    this.controles = new MapControls(this.camera, canvas);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.14;
    this.controles.screenSpacePanning = false;
    this.controles.minDistance = 7;
    this.controles.maxDistance = 60;
    this.controles.minPolarAngle = 0.1;
    this.controles.maxPolarAngle = 1.22;
    this.controles.zoomSpeed = 0.9;
    this.camera.position.set(8, 20, 20);

    this.moradores = new MoradoresDaCena(this.mundo, this.ativos);
    this.aplicarQualidade();

    canvas.addEventListener("pointerdown", this.aoApertar);
    canvas.addEventListener("pointerup", this.aoSoltar);
    canvas.addEventListener("pointercancel", this.aoCancelar);
    canvas.addEventListener("pointermove", this.aoMover);
    canvas.addEventListener("pointerleave", this.aoSairDaCena);
    canvas.addEventListener("contextmenu", this.semMenu);
    canvas.addEventListener("webglcontextlost", this.aoPerder);
    canvas.addEventListener("webglcontextrestored", this.aoRestaurar);
    document.addEventListener("visibilitychange", this.aoMudarVisibilidade);

    this.observador = new ResizeObserver(() => this.ajustarTamanho());
    this.observador.observe(host);
    this.ajustarTamanho();
    this.cancelarAtivos = this.ativos.aoMudar?.(() => {
      this.revisaoMontada = -1;
    });
    this.ligar();
  }

  // --- O que quem monta a cena pode pedir ---

  get qualidade(): Qualidade {
    return this.qualidadeAtual;
  }

  /** Marca uma tecla de câmera como apertada ou solta (`KeyW`, `ArrowLeft`...). */
  definirTecla(codigo: string, apertada: boolean): void {
    if (apertada) this.teclas.add(codigo);
    else this.teclas.delete(codigo);
  }

  /** Leva a câmera até o morador que a pessoa dirige. Devolve se havia um. */
  focarNoMeu(): boolean {
    const meu = this.sessao.loja.meuMoradorId();
    const pes = meu ? this.moradores.pesDe(meu) : null;
    if (!pes) return false;
    this.foco = {
      de: this.controles.target.clone(),
      para: new Vector3(pes[0], 0, pes[2]),
      inicio: performance.now(),
    };
    return true;
  }

  /** Um anel no chão onde a pessoa mandou ir; de outra cor se não dá para chegar. */
  marcarDestino(loteId: LoteId, pos: PontoMm, ok: boolean): void {
    const estado = this.sessao.estado();
    const lote = estado ? obter(estado.lotes, loteId) : undefined;
    if (!estado || !lote) return;
    if (!this.destino) {
      const anel = new RingGeometry(0.12, 0.2, 28);
      const material = new MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      });
      this.destino = new Mesh(anel, material);
      this.destino.rotation.x = -Math.PI / 2;
      this.destino.renderOrder = 5;
      this.scene.add(this.destino);
    }
    const [x, y, z] = paraCena(
      lote.origem[0] + pos[0],
      lote.origem[1] + pos[1],
      alturaDoPiso(estado, loteId, pos) + 25,
    );
    this.destino.position.set(x, y, z);
    const material = this.destino.material;
    if (material instanceof MeshBasicMaterial) material.color.setHex(ok ? 0xffc233 : 0xff7a76);
    this.destino.visible = true;
    this.destinoAte = performance.now() + (ok ? 900 : 500);
  }

  medir(): MedidasDaCena {
    return {
      qualidade: this.qualidadeAtual,
      placa: this.placa,
      ...this.medidas,
      chamadas: this.renderer.info.render.calls,
      triangulos: this.renderer.info.render.triangles,
      quadros: this.quadros,
    };
  }

  /** Onde cada morador foi desenhado no último quadro, na planta do lote. */
  posicoes(): Record<string, { loteId: LoteId; pos: [number, number] }> {
    return this.moradores.posicoes();
  }

  /** Um ponto da cena na tela, relativo ao elemento da cena; `null` se está atrás da câmera. */
  private naTela(ponto: PontoDaCena): { x: number; y: number } | null {
    const v = new Vector3(ponto[0], ponto[1], ponto[2]).project(this.camera);
    if (v.z < -1 || v.z > 1) return null;
    const { clientWidth, clientHeight } = this.host;
    return { x: ((v.x + 1) / 2) * clientWidth, y: ((1 - v.y) / 2) * clientHeight };
  }

  /** Onde um ponto do chão de um lote aparece na tela. Para os testes clicarem no lugar certo. */
  telaDoPonto(loteId: LoteId, pos: PontoMm): { x: number; y: number } | null {
    const estado = this.sessao.estado();
    const lote = estado ? obter(estado.lotes, loteId) : undefined;
    if (!estado || !lote) return null;
    return this.naTela(
      paraCena(lote.origem[0] + pos[0], lote.origem[1] + pos[1], alturaDoPiso(estado, loteId, pos)),
    );
  }

  telaDoObjeto(objetoId: ObjetoId): { x: number; y: number } | null {
    const topo = this.objetos?.topoDe(objetoId);
    return topo ? this.naTela(topo) : null;
  }

  telaDoMorador(moradorId: MoradorId): { x: number; y: number } | null {
    const topo = this.moradores.topoDe(moradorId);
    return topo ? this.naTela(topo) : null;
  }

  /** O que um clique neste ponto do elemento da cena acertaria. */
  oQueHa(x: number, y: number): AlvoClicado | null {
    const estado = this.sessao.estado();
    if (!estado) return null;
    const { clientWidth, clientHeight } = this.host;
    if (clientWidth <= 0 || clientHeight <= 0) return null;
    this.raio.setFromCamera(
      new Vector2((x / clientWidth) * 2 - 1, -(y / clientHeight) * 2 + 1),
      this.camera,
    );
    const alvos: Object3D[] = [...this.moradores.alvos(), ...this.pisos];
    if (this.objetos) alvos.push(this.objetos.raiz);
    if (this.terreno) alvos.push(this.terreno);

    for (const acerto of this.raio.intersectObjects(alvos, true)) {
      const moradorId = this.moradores.moradorDe(acerto);
      if (moradorId) return { t: "morador", moradorId };
      const objetoId = this.objetos?.objetoDe(acerto) ?? null;
      if (objetoId) {
        const entrada = doCatalogo(obter(estado.objetos, objetoId)?.catalogo ?? "");
        // Tapete, abajur, enfeite: não atrapalham nem oferecem nada. O clique passa por eles.
        if (!entrada?.comportamento && !entrada?.bloqueia) continue;
        return { t: "objeto", objetoId };
      }
      const [px, py] = daCena(acerto.point.x, acerto.point.z);
      for (const lote of listar(estado.lotes)) {
        const lx = px - lote.origem[0];
        const ly = py - lote.origem[1];
        if (lx < 0 || ly < 0 || lx >= lote.tamanho[0] || ly >= lote.tamanho[1]) continue;
        const pos = centroDaCelula([lx, ly]);
        const livre = this.sessao.navegador(lote.id)?.livre(pos) ?? false;
        return { t: "chao", loteId: lote.id, pos, livre };
      }
      return null;
    }
    return null;
  }

  /** Para os testes: derruba e devolve o contexto WebGL pela extensão do navegador. */
  perderContexto(): boolean {
    const extensao = this.renderer.getContext().getExtension("WEBGL_lose_context");
    if (!extensao) return false;
    this.extensaoDePerda = extensao;
    extensao.loseContext();
    return true;
  }

  restaurarContexto(): boolean {
    if (!this.extensaoDePerda) return false;
    this.extensaoDePerda.restoreContext();
    return true;
  }

  dispose(): void {
    if (this.descartada) return;
    this.descartada = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.observador.disconnect();
    this.cancelarAtivos?.();
    const canvas = this.renderer.domElement;
    cancelAnimationFrame(this.rafDoPonteiro);
    canvas.removeEventListener("pointerdown", this.aoApertar);
    canvas.removeEventListener("pointerup", this.aoSoltar);
    canvas.removeEventListener("pointercancel", this.aoCancelar);
    canvas.removeEventListener("pointermove", this.aoMover);
    canvas.removeEventListener("pointerleave", this.aoSairDaCena);
    canvas.removeEventListener("contextmenu", this.semMenu);
    canvas.removeEventListener("webglcontextlost", this.aoPerder);
    canvas.removeEventListener("webglcontextrestored", this.aoRestaurar);
    document.removeEventListener("visibilitychange", this.aoMudarVisibilidade);
    this.controles.dispose();

    this.desmontar();
    this.moradores.dispose();
    if (this.destino) {
      this.destino.geometry.dispose();
      if (this.destino.material instanceof MeshBasicMaterial) this.destino.material.dispose();
    }
    this.materialFixo.dispose();
    this.sol.shadow.map?.dispose();
    this.sol.dispose();
    this.ceu.dispose();
    this.renderer.dispose();
    canvas.remove();
  }

  // --- Montagem ---

  /** O lote que a câmera enquadra: o da primeira família da pessoa; sem acesso, o primeiro com casa. */
  private loteVisto(estado: EstadoDoMundo): LoteId | null {
    const jogadorId = this.sessao.loja.jogador?.jogadorId;
    if (jogadorId) {
      for (const familiaId of familiasDoJogador(estado, jogadorId)) {
        const loteId = obter(estado.familias, familiaId)?.loteId;
        if (loteId) return loteId;
      }
    }
    return listar(estado.lotes).find((lote) => lote.imovelId)?.id ?? estado.lotes.ordem[0] ?? null;
  }

  private soltarMalha(malha: Mesh | null): void {
    if (!malha) return;
    malha.removeFromParent();
    malha.geometry.dispose();
  }

  private desmontar(): void {
    this.soltarMalha(this.terreno);
    this.terreno = null;
    for (const malha of [...this.pisos, ...this.paredes]) this.soltarMalha(malha);
    this.pisos = [];
    this.paredes = [];
    this.objetos?.dispose();
    this.objetos = null;
    this.itens = [];
  }

  /** Monta o terreno, as casas e os objetos a partir do espelho. Os moradores se refazem sozinhos. */
  private montar(estado: EstadoDoMundo): void {
    this.desmontar();
    const lotes = listar(estado.lotes);
    const bairro = listar(estado.bairros)[0];
    if (bairro) {
      this.terreno = montarTerreno(bairro, lotes, this.materialFixo).malha;
      if (this.terreno) this.mundo.add(this.terreno);
    }

    const baixas = this.sessao.loja.paredesBaixas;
    const corte = baixas ? CORTE_DAS_PAREDES_MM : null;
    for (const lote of lotes) {
      const imovel = lote.imovelId ? obter(estado.imoveis, lote.imovelId) : undefined;
      if (!imovel) continue;
      const casa = montarCasa(imovel, lote, corte, this.materialFixo);
      if (casa.pisos) {
        this.pisos.push(casa.pisos);
        this.mundo.add(casa.pisos);
      }
      if (casa.paredes) {
        this.paredes.push(casa.paredes);
        this.mundo.add(casa.paredes);
      }
    }

    this.itens = [];
    for (const objeto of listar(estado.objetos)) {
      const lote = obter(estado.lotes, objeto.loteId);
      if (!lote) continue;
      this.itens.push({
        objeto,
        entrada: doCatalogo(objeto.catalogo),
        posicao: paraCena(
          lote.origem[0] + objeto.pos[0],
          lote.origem[1] + objeto.pos[1],
          objeto.pos[2],
        ),
      });
    }
    this.objetos = this.ativos.criarObjetos(this.itens);
    this.mundo.add(this.objetos.raiz);
    this.esconderOQueFlutua(estado, corte);

    this.revisaoMontada = this.sessao.loja.revisaoDaCasa;
    this.paredesMontadas = baixas;
    if (!this.enquadrada) this.enquadrar(estado);
  }

  /** Com as paredes baixas, o que fica pendurado acima do corte, e tudo o que é de teto, some. */
  private esconderOQueFlutua(estado: EstadoDoMundo, corte: number | null): void {
    this.objetos?.definirVisiveis((item) => {
      if (corte === null) return true;
      const fixacao = item.entrada?.fixacao;
      if (fixacao === "teto") return false;
      if (fixacao !== "parede") return true;
      const lote = obter(estado.lotes, item.objeto.loteId);
      const imovel = lote?.imovelId ? obter(estado.imoveis, lote.imovelId) : undefined;
      const piso = imovel?.andares.find((andar) => andar.n === item.objeto.andar)?.z ?? 0;
      return item.objeto.pos[2] - piso < corte;
    });
  }

  /** Põe a câmera de frente para a casa da pessoa, vista de cima e um pouco de lado. */
  private enquadrar(estado: EstadoDoMundo): void {
    const loteId = this.loteVisto(estado);
    const lote = loteId ? obter(estado.lotes, loteId) : undefined;
    if (!lote) return;
    const imovel = lote.imovelId ? obter(estado.imoveis, lote.imovelId) : undefined;
    let cx = lote.tamanho[0] / 2;
    let cy = lote.tamanho[1] / 2;
    const contorno = imovel?.andares[0]?.contorno;
    if (contorno && contorno.length > 0) {
      cx = contorno.reduce((soma, p) => soma + p[0], 0) / contorno.length;
      cy = contorno.reduce((soma, p) => soma + p[1], 0) / contorno.length;
    }
    const [x, , z] = paraCena(lote.origem[0] + cx, lote.origem[1] + cy, 0);
    // A frente das casas dá para −Y da planta, que é o +Z da cena: a câmera fica desse
    // lado, e mira um pouco à frente da casa, porque a base da tela é do HUD.
    const frente = z + 2.4;
    this.controles.target.set(x, 0, frente);
    this.camera.position.set(x + 5.8, 20, frente + 17.4);
    this.controles.update();
    this.enquadrada = true;
  }

  // --- Qualidade ---

  private aplicarQualidade(): void {
    const nivel = QUALIDADES[this.qualidadeAtual];
    this.renderer.setPixelRatio(Math.min(nivel.dpr, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = nivel.sombras;
    this.sol.castShadow = nivel.sombras;
    // Ligar ou desligar sombra muda os programas dos materiais.
    this.scene.traverse((filho) => {
      if (!(filho instanceof Mesh)) return;
      const materiais: Material[] = Array.isArray(filho.material)
        ? filho.material
        : [filho.material];
      for (const material of materiais) material.needsUpdate = true;
    });
    this.ajustarTamanho();
    this.intervalos = [];
    this.custos = [];
    this.janelaDesde = performance.now();
  }

  /** Fecha uma janela de medida e desce a qualidade se os quadros estão demorando. */
  private fecharJanela(agora: number): void {
    const intervalos = [...this.intervalos].sort((a, b) => a - b);
    this.janelaDesde = agora;
    if (intervalos.length < 30) {
      this.intervalos = [];
      this.custos = [];
      return;
    }
    const p95 =
      intervalos[Math.min(intervalos.length - 1, Math.floor(intervalos.length * 0.95))] ?? 0;
    const media = intervalos.reduce((soma, valor) => soma + valor, 0) / intervalos.length;
    const custo =
      this.custos.reduce((soma, valor) => soma + valor, 0) / Math.max(1, this.custos.length);
    this.medidas = {
      p95Ms: Math.round(p95 * 10) / 10,
      mediaMs: Math.round(media * 10) / 10,
      custoMs: Math.round(custo * 100) / 100,
    };
    this.intervalos = [];
    this.custos = [];
    const degrau = DEGRAUS.indexOf(this.qualidadeAtual);
    const proximo = DEGRAUS[degrau + 1];
    if (p95 > LIMITE_DO_P95_MS && proximo) {
      this.qualidadeAtual = proximo;
      this.aplicarQualidade();
    }
  }

  private ajustarTamanho(): void {
    const largura = Math.max(1, this.host.clientWidth);
    const altura = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(largura, altura, false);
    this.camera.aspect = largura / altura;
    this.camera.updateProjectionMatrix();
  }

  // --- Laço ---

  private ligar(): void {
    if (this.raf || this.descartada || this.perdida || document.hidden) return;
    this.ultimo = performance.now();
    this.janelaDesde = this.ultimo;
    this.intervalos = [];
    this.custos = [];
    this.raf = requestAnimationFrame(this.quadro);
  }

  private desligar(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private readonly quadro = (agora: number): void => {
    this.raf = 0;
    if (this.descartada || this.perdida || document.hidden) return;
    this.raf = requestAnimationFrame(this.quadro);

    const limite = QUALIDADES[this.qualidadeAtual].quadroMs;
    const intervalo = agora - this.ultimo;
    // No degrau mais baixo, pula os quadros que vêm antes da hora.
    if (limite > 0 && intervalo < limite - 2) return;
    this.ultimo = agora;
    const dt = Math.min(100, Math.max(0, intervalo));
    const inicio = performance.now();

    this.atualizar(agora, dt);
    this.renderer.render(this.scene, this.camera);
    this.quadros++;

    // Um intervalo enorme é a aba voltando, não um quadro lento.
    if (intervalo < 250) {
      this.intervalos.push(intervalo);
      this.custos.push(performance.now() - inicio);
    }
    if (agora - this.janelaDesde >= JANELA_DE_MEDIDA_MS) this.fecharJanela(agora);
  };

  private atualizar(agora: number, dt: number): void {
    const { loja } = this.sessao;
    const estado = this.sessao.estado();
    if (estado) {
      if (
        this.revisaoMontada !== loja.revisaoDaCasa ||
        this.paredesMontadas !== loja.paredesBaixas
      ) {
        this.montar(estado);
      }
      const reservas = loja.visao?.presenca.reservas ?? [];
      this.moradores.atualizar({
        estado,
        tick: this.sessao.tickFracionado(),
        agoraMs: this.sessao.agoraMs(),
        dtMs: dt,
        velocidade: estado.relogio.velocidade,
        meuMoradorId: loja.meuMoradorId(),
        condutor: (moradorId) => {
          const reserva = reservas.find((r) => r.moradorId === moradorId);
          return reserva ? this.opcoes.nomeDoJogador(reserva.perfilId) : null;
        },
        previsao: this.sessao.previsao,
      });
      this.iluminar(fracaoDoDia(estado));
    }

    this.moverCamera(agora, dt);
    if (this.destino?.visible) {
      const resto = this.destinoAte - agora;
      if (resto <= 0) this.destino.visible = false;
      else {
        const material = this.destino.material;
        if (material instanceof MeshBasicMaterial) material.opacity = Math.min(1, resto / 400);
        this.destino.scale.setScalar(1 + (1 - Math.min(1, resto / 900)) * 0.6);
      }
    }
  }

  /** A luz acompanha a hora do jogo: dia claro, fim de tarde quente, noite azul e ainda jogável. */
  private iluminar(fracao: number): void {
    const angulo = (fracao - 0.25) * Math.PI * 2;
    const alturaDoSol = Math.sin(angulo);
    const dia = Math.min(1, Math.max(0, (alturaDoSol + 0.12) / 0.4));
    const entardecer = Math.max(0, 1 - Math.abs(alturaDoSol) / 0.3) * dia;

    this.fundo.setRGB(0.07, 0.09, 0.2).lerp(CEU_DE_DIA, dia);
    this.fundo.lerp(CEU_DO_ENTARDECER, entardecer * 0.45);
    this.ceu.intensity = 0.5 + 0.55 * dia;
    this.ceu.color.setRGB(0.6, 0.68, 1).lerp(CLARIDADE_DE_DIA, dia);
    this.sol.intensity = 0.25 + 1.45 * dia;
    this.sol.color.setRGB(0.62, 0.7, 1).lerp(SOL_DE_DIA, dia);

    const alvo = this.controles.target;
    this.sol.target.position.set(alvo.x, 0, alvo.z);
    this.sol.position.set(
      alvo.x + Math.cos(angulo) * 18,
      Math.max(7, alturaDoSol * 26),
      alvo.z + 11,
    );
    const sombra = this.sol.shadow.camera;
    sombra.left = -16;
    sombra.right = 16;
    sombra.top = 16;
    sombra.bottom = -16;
    sombra.near = 1;
    sombra.far = 70;
    sombra.updateProjectionMatrix();
  }

  private moverCamera(agora: number, dt: number): void {
    const alvo = this.controles.target;
    // WASD e setas andam no chão, na direção para onde a câmera olha.
    let lado = 0;
    let frente = 0;
    if (this.teclas.has("KeyA") || this.teclas.has("ArrowLeft")) lado -= 1;
    if (this.teclas.has("KeyD") || this.teclas.has("ArrowRight")) lado += 1;
    if (this.teclas.has("KeyW") || this.teclas.has("ArrowUp")) frente += 1;
    if (this.teclas.has("KeyS") || this.teclas.has("ArrowDown")) frente -= 1;
    if (lado !== 0 || frente !== 0) {
      this.foco = null;
      const olhar = new Vector3().subVectors(alvo, this.camera.position).setY(0);
      if (olhar.lengthSq() > 1e-6) {
        olhar.normalize();
        const direita = new Vector3(-olhar.z, 0, olhar.x);
        const distancia = this.camera.position.distanceTo(alvo);
        const passo = (dt / 1000) * Math.max(4, distancia * 0.7);
        const andar = olhar
          .multiplyScalar(frente * passo)
          .add(direita.multiplyScalar(lado * passo));
        alvo.add(andar);
        this.camera.position.add(andar);
      }
    }

    if (this.foco) {
      const k = Math.min(1, (agora - this.foco.inicio) / 450);
      const suave = 1 - (1 - k) ** 3;
      const para = new Vector3().lerpVectors(this.foco.de, this.foco.para, suave);
      const andar = para.sub(alvo);
      alvo.add(andar);
      this.camera.position.add(andar);
      if (k >= 1) this.foco = null;
    }

    // A câmera não sai do bairro.
    const bairro = this.sessao.loja.visao?.bairros;
    const primeiro = bairro?.ordem[0] ? bairro.porId[bairro.ordem[0]] : undefined;
    if (primeiro) {
      const margem = 4;
      const maxX = primeiro.tamanho[0] * METROS_POR_MM + margem;
      const minZ = -primeiro.tamanho[1] * METROS_POR_MM - margem;
      const x = Math.min(maxX, Math.max(-margem, alvo.x));
      const z = Math.min(margem, Math.max(minZ, alvo.z));
      if (x !== alvo.x || z !== alvo.z) {
        this.camera.position.x += x - alvo.x;
        this.camera.position.z += z - alvo.z;
        alvo.set(x, alvo.y, z);
      }
    }
    this.controles.update();
  }

  // --- Entrada ---

  private readonly semMenu = (evento: Event): void => {
    evento.preventDefault();
  };

  private readonly aoApertar = (evento: PointerEvent): void => {
    this.opcoes.aoTocar();
    this.foco = null;
    this.toque =
      evento.button === 0 ? { x: evento.clientX, y: evento.clientY, em: performance.now() } : null;
  };

  private readonly aoCancelar = (): void => {
    this.toque = null;
  };

  /**
   * O ponteiro passou pela cena: no próximo quadro a cena confere o que está
   * debaixo dele. Com um botão apertado é a câmera que anda, e não se confere.
   */
  private readonly aoMover = (evento: PointerEvent): void => {
    if (evento.pointerType !== "mouse" || evento.buttons !== 0) return;
    const caixa = this.host.getBoundingClientRect();
    this.ponteiro = { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
    if (this.rafDoPonteiro === 0) {
      this.rafDoPonteiro = requestAnimationFrame(this.conferirPonteiro);
    }
  };

  private readonly aoSairDaCena = (): void => {
    this.ponteiro = null;
    this.mostrarAlvo(null, null);
  };

  private readonly conferirPonteiro = (): void => {
    this.rafDoPonteiro = 0;
    const ponteiro = this.ponteiro;
    if (this.descartada || !ponteiro) return;
    this.mostrarAlvo(this.oQueHa(ponteiro.x, ponteiro.y), ponteiro);
  };

  /**
   * Diz, no próprio canvas, o que um clique acertaria onde o ponteiro está: o
   * cursor vira a mão sobre o que responde a um toque, e os atributos
   * `data-morada-alvo*` dizem o que é. São estáveis: os testes de navegador
   * acham por eles onde clicar, sem olhar dentro do jogo.
   */
  private mostrarAlvo(alvo: AlvoClicado | null, ponteiro: { x: number; y: number } | null): void {
    const canvas = this.renderer.domElement;
    const dados = canvas.dataset;
    delete dados.moradaAlvo;
    delete dados.moradaAlvoId;
    delete dados.moradaAlvoNome;
    delete dados.moradaAlvoPos;
    if (ponteiro) dados.moradaPonteiro = `${Math.round(ponteiro.x)},${Math.round(ponteiro.y)}`;
    else delete dados.moradaPonteiro;
    const estado = alvo ? this.sessao.estado() : null;
    let responde = false;
    if (alvo && estado) {
      if (alvo.t === "morador") {
        dados.moradaAlvo = "morador";
        dados.moradaAlvoId = alvo.moradorId;
        dados.moradaAlvoNome = obter(estado.moradores, alvo.moradorId)?.nome ?? "";
        responde = true;
      } else if (alvo.t === "objeto") {
        dados.moradaAlvo = "objeto";
        dados.moradaAlvoId = alvo.objetoId;
        dados.moradaAlvoNome = nomeDoObjeto(obter(estado.objetos, alvo.objetoId)?.catalogo ?? "");
        responde = true;
      } else {
        dados.moradaAlvo = alvo.livre ? "chao" : "chao-ocupado";
        dados.moradaAlvoPos = `${alvo.pos[0]},${alvo.pos[1]}`;
        // No chão a mão só aparece para quem dirige alguém: é o "ir até aqui".
        responde = alvo.livre && this.sessao.loja.meuMoradorId() !== null;
      }
    }
    canvas.style.cursor = responde ? "pointer" : "";
  }

  private readonly aoSoltar = (evento: PointerEvent): void => {
    const toque = this.toque;
    this.toque = null;
    if (!toque || evento.button !== 0) return;
    // Arrastou: era a câmera, não um clique.
    const andou = Math.hypot(evento.clientX - toque.x, evento.clientY - toque.y);
    if (andou > 6 || performance.now() - toque.em > 700) return;
    const caixa = this.host.getBoundingClientRect();
    const x = evento.clientX - caixa.left;
    const y = evento.clientY - caixa.top;
    const alvo = this.oQueHa(x, y);
    if (alvo) this.opcoes.aoClicar(alvo, x, y);
  };

  private readonly aoMudarVisibilidade = (): void => {
    if (document.hidden) this.desligar();
    else this.ligar();
  };

  private readonly aoPerder = (evento: Event): void => {
    // Sem isto o navegador não devolve o contexto.
    evento.preventDefault();
    this.perdida = true;
    this.desligar();
    this.sessao.loja.definirContextoPerdido(true);
  };

  private readonly aoRestaurar = (): void => {
    if (this.descartada) return;
    this.perdida = false;
    // Tudo o que estava na placa se foi: a cena é refeita do espelho.
    this.desmontar();
    this.moradores.dispose();
    this.moradores = new MoradoresDaCena(this.mundo, this.ativos);
    this.revisaoMontada = -1;
    this.aplicarQualidade();
    this.sessao.loja.definirContextoPerdido(false);
    this.ligar();
  };
}
