import {
  type EstadoDoMundo,
  type LoteId,
  listar,
  type Morador,
  type MoradorId,
  obter,
} from "@informach/morada-sim";
import { MM_POR_TICK } from "@informach/morada-sim/conteudo";
import {
  CanvasTexture,
  DoubleSide,
  type Group,
  type Intersection,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  OctahedronGeometry,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from "three";
import type { Ativos, VisualDoMorador } from "../ativos/ativos";
import { type PrevisaoDeAndar, Suavizador } from "../espelho/previsao";
import { giroParaCena, menorVolta, type PontoDaCena, paraCena } from "./espaco";
import { pedeMenosMovimento } from "./movimento";
import { gravidezDe, type Situacao, situacaoDoMorador } from "./situacao";

/**
 * Os moradores na cena: onde cada um está neste quadro, como está o corpo,
 * o nome por cima e a marca de quem dirige. O corpo vem dos ativos; o resto é
 * daqui.
 */

/** Os outros moradores são desenhados dois ticks atrás, para a rota deles chegar antes de ser preciso. */
export const ATRASO_DOS_OUTROS = 2;
const COR_MINHA = 0xffc233;
const COR_DE_OUTRO = 0xff7a76;
/** Tempo para o corpo acompanhar uma mudança de direção ou de altura, em milissegundos. */
const TEMPO_DE_VIRAR_MS = 110;

export type QuadroDosMoradores = {
  estado: EstadoDoMundo;
  /** O tick do servidor agora, com fração. */
  tick: number;
  agoraMs: number;
  dtMs: number;
  velocidade: number;
  meuMoradorId: MoradorId | null;
  /** Quem dirige cada morador, pelo nome que o jogo tem dessa pessoa. */
  condutor(moradorId: MoradorId): string | null;
  previsao: PrevisaoDeAndar;
};

type Entrada = {
  visual: VisualDoMorador;
  /** Fase e aparência com que o visual foi feito: mudou, faz outro. */
  chave: string;
  suavizador: Suavizador;
  rotulo: Sprite;
  textoDoRotulo: string;
  anel: Mesh;
  marca: Mesh;
  frente: number | null;
  altura: number | null;
  previsto: boolean;
  /** Onde foi desenhado, na planta do lote, em milímetros. */
  desenhado: [number, number] | null;
  loteId: LoteId | null;
};

function ehMoradorId(valor: unknown): valor is MoradorId {
  return typeof valor === "string" && valor.startsWith("mor_");
}

function chaveDe(morador: Morador): string {
  const a = morador.aparencia;
  return `${morador.fase}/${a.corpo}/${a.pele}/${a.cabelo}/${a.roupa}/${a.semente}`;
}

/** O nome em uma plaquinha, desenhado em um canvas e levado para a cena como textura. */
function desenharRotulo(texto: string, destaque: number | null): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "600 34px ui-sans-serif, system-ui, 'Segoe UI', sans-serif";
    const largura = Math.min(canvas.width - 8, ctx.measureText(texto).width + 44);
    const x = (canvas.width - largura) / 2;
    ctx.fillStyle = "rgba(15, 18, 38, 0.82)";
    ctx.beginPath();
    ctx.roundRect(x, 10, largura, 60, 30);
    ctx.fill();
    if (destaque !== null) {
      ctx.strokeStyle = `#${destaque.toString(16).padStart(6, "0")}`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.fillStyle = "#eef0ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, canvas.width / 2, 42, canvas.width - 40);
  }
  const textura = new CanvasTexture(canvas);
  textura.colorSpace = SRGBColorSpace;
  textura.minFilter = LinearFilter;
  textura.generateMipmaps = false;
  return textura;
}

export class MoradoresDaCena {
  private readonly entradas = new Map<MoradorId, Entrada>();
  private readonly anel = new RingGeometry(0.34, 0.44, 40);
  private readonly anelFino = new RingGeometry(0.36, 0.41, 40);
  private readonly losango = new OctahedronGeometry(0.09);
  private readonly materialMeu = new MeshBasicMaterial({
    color: COR_MINHA,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly materialDeOutro = new MeshBasicMaterial({
    color: COR_DE_OUTRO,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: DoubleSide,
  });

  private readonly calmo = pedeMenosMovimento();

  constructor(
    private readonly raiz: Group,
    private readonly ativos: Ativos,
  ) {}

  private criar(morador: Morador): Entrada {
    const visual = this.ativos.criarMorador({
      moradorId: morador.id,
      fase: morador.fase,
      aparencia: morador.aparencia,
    });
    visual.raiz.traverse((filho) => {
      filho.userData.moradorId = morador.id;
    });

    const rotulo = new Sprite(
      new SpriteMaterial({ depthTest: false, transparent: true, sizeAttenuation: false }),
    );
    rotulo.renderOrder = 10;
    // Tamanho fixo na tela, qualquer que seja a distância da câmera.
    rotulo.scale.set(0.1032, 0.0215, 1);

    const anel = new Mesh(this.anel, this.materialMeu);
    anel.rotation.x = -Math.PI / 2;
    anel.visible = false;
    const marca = new Mesh(this.losango, this.materialDeOutro);
    marca.visible = false;

    this.raiz.add(visual.raiz, rotulo, anel, marca);
    return {
      visual,
      chave: chaveDe(morador),
      suavizador: new Suavizador(),
      rotulo,
      textoDoRotulo: "",
      anel,
      marca,
      frente: null,
      altura: null,
      previsto: false,
      desenhado: null,
      loteId: null,
    };
  }

  private soltar(entrada: Entrada): void {
    entrada.visual.dispose();
    entrada.rotulo.material.map?.dispose();
    entrada.rotulo.material.dispose();
    entrada.rotulo.removeFromParent();
    entrada.anel.removeFromParent();
    entrada.marca.removeFromParent();
  }

  private esconder(entrada: Entrada): void {
    entrada.visual.raiz.visible = false;
    entrada.rotulo.visible = false;
    entrada.anel.visible = false;
    entrada.marca.visible = false;
    entrada.desenhado = null;
    entrada.loteId = null;
    entrada.suavizador.reiniciar();
    entrada.frente = null;
    entrada.altura = null;
  }

  private rotular(entrada: Entrada, texto: string, destaque: number | null): void {
    if (entrada.textoDoRotulo === texto) return;
    entrada.textoDoRotulo = texto;
    entrada.rotulo.material.map?.dispose();
    entrada.rotulo.material.map = desenharRotulo(texto, destaque);
    entrada.rotulo.material.needsUpdate = true;
  }

  /** Põe cada morador onde ele está neste quadro. */
  atualizar(quadro: QuadroDosMoradores): void {
    const { estado } = quadro;
    const vivos = new Set<MoradorId>();
    const noColo: { morador: Morador; entrada: Entrada; de: MoradorId }[] = [];
    const carregadores = new Set<MoradorId>();
    for (const morador of listar(estado.moradores)) {
      if (morador.local.t === "colo") carregadores.add(morador.local.de);
    }

    for (const morador of listar(estado.moradores)) {
      vivos.add(morador.id);
      let entrada = this.entradas.get(morador.id);
      if (entrada && entrada.chave !== chaveDe(morador)) {
        // Cresceu ou mudou de aparência: outro corpo, no mesmo lugar.
        this.soltar(entrada);
        entrada = undefined;
      }
      if (!entrada) {
        entrada = this.criar(morador);
        this.entradas.set(morador.id, entrada);
      }

      const meu = morador.id === quadro.meuMoradorId;
      const previsto = meu ? quadro.previsao.posicao(quadro.agoraMs, quadro.velocidade) : null;
      const usaPrevisao = previsto !== null && quadro.previsao.ativaPara(morador.id);
      const tick = meu ? quadro.tick : quadro.tick - ATRASO_DOS_OUTROS;
      const situacao = situacaoDoMorador(
        estado,
        morador,
        tick,
        (objeto, ponto, postura) => this.ativos.apoio(objeto, ponto, postura),
        usaPrevisao ? previsto : null,
      );
      const lote = situacao ? obter(estado.lotes, situacao.loteId) : undefined;
      if (!situacao || !lote) {
        this.esconder(entrada);
        continue;
      }
      if (situacao.noColoDe) {
        noColo.push({ morador, entrada, de: situacao.noColoDe });
        continue;
      }

      // A troca entre a previsão e a rota do servidor é sempre um salto a suavizar.
      if (entrada.previsto !== usaPrevisao) entrada.suavizador.forcar();
      entrada.previsto = usaPrevisao;
      const mmPorMs = (MM_POR_TICK[morador.fase] * Math.max(1, quadro.velocidade)) / 100;
      const pos = entrada.suavizador.passo(
        situacao.pos,
        quadro.agoraMs,
        mmPorMs * quadro.dtMs * 2.5 + 40,
      );
      const mistura = Math.min(1, quadro.dtMs / TEMPO_DE_VIRAR_MS);
      entrada.frente =
        entrada.frente === null
          ? situacao.frente
          : entrada.frente + menorVolta(entrada.frente, situacao.frente) * mistura;
      entrada.altura =
        entrada.altura === null
          ? situacao.altura
          : entrada.altura + (situacao.altura - entrada.altura) * mistura;
      entrada.desenhado = pos;
      entrada.loteId = situacao.loteId;

      const [x, y, z] = paraCena(lote.origem[0] + pos[0], lote.origem[1] + pos[1], entrada.altura);
      const { raiz } = entrada.visual;
      raiz.visible = true;
      raiz.position.set(x, y, z);
      raiz.rotation.y = giroParaCena(entrada.frente);
      this.aplicarPose(entrada, morador, situacao, quadro, carregadores.has(morador.id));
      this.marcar(entrada, morador, quadro, [x, y, z], situacao);
    }

    // Quem está no colo acompanha o corpo de quem carrega, já no lugar deste quadro.
    for (const { morador, entrada, de } of noColo) {
      const carregador = this.entradas.get(de);
      if (!carregador?.visual.raiz.visible) {
        this.esconder(entrada);
        continue;
      }
      const base = carregador.visual.raiz;
      const [cx, cy, cz] = carregador.visual.colo;
      const angulo = base.rotation.y;
      const x = base.position.x + cx * Math.cos(angulo) + cz * Math.sin(angulo);
      const y = base.position.y + cy;
      const z = base.position.z - cx * Math.sin(angulo) + cz * Math.cos(angulo);
      entrada.visual.raiz.visible = true;
      entrada.visual.raiz.position.set(x, y, z);
      entrada.visual.raiz.rotation.y = angulo;
      entrada.desenhado = carregador.desenhado;
      entrada.loteId = carregador.loteId;
      entrada.visual.aplicar({
        postura: "no_colo",
        andando: false,
        agindo: false,
        animacao: null,
        carregando: false,
        gravidez: 0,
        agoraMs: quadro.agoraMs,
        dtMs: quadro.dtMs,
      });
      this.rotular(entrada, morador.nome, null);
      entrada.rotulo.visible = true;
      entrada.rotulo.position.set(x, y + entrada.visual.altura * 0.5 + 0.22, z);
      entrada.anel.visible = false;
      entrada.marca.visible = false;
    }

    for (const [id, entrada] of [...this.entradas]) {
      if (vivos.has(id)) continue;
      this.soltar(entrada);
      this.entradas.delete(id);
    }
  }

  private aplicarPose(
    entrada: Entrada,
    morador: Morador,
    situacao: Situacao,
    quadro: QuadroDosMoradores,
    carregando: boolean,
  ): void {
    entrada.visual.aplicar({
      postura: situacao.postura,
      andando: situacao.andando,
      agindo: situacao.agindo,
      animacao: situacao.animacao,
      carregando,
      gravidez: gravidezDe(quadro.estado, morador.id),
      agoraMs: quadro.agoraMs,
      dtMs: quadro.dtMs,
    });
  }

  private marcar(
    entrada: Entrada,
    morador: Morador,
    quadro: QuadroDosMoradores,
    [x, y, z]: PontoDaCena,
    situacao: Situacao,
  ): void {
    const meu = morador.id === quadro.meuMoradorId;
    const condutor = meu ? null : quadro.condutor(morador.id);
    const texto = meu
      ? `${morador.nome} · você`
      : condutor
        ? `${morador.nome} · ${condutor}`
        : morador.nome;
    this.rotular(entrada, texto, meu ? COR_MINHA : condutor ? COR_DE_OUTRO : null);

    const deitado = situacao.postura === "deitado";
    const topo = deitado
      ? 0.55
      : situacao.postura === "sentado"
        ? entrada.visual.altura * 0.78
        : entrada.visual.altura;
    entrada.rotulo.visible = true;
    entrada.rotulo.position.set(x, y + topo + 0.3, z);

    // Você: um anel cheio no chão. Outra pessoa: um anel fino e um losango sobre a cabeça.
    entrada.anel.visible = meu || condutor !== null;
    if (entrada.anel.visible) {
      entrada.anel.geometry = meu ? this.anel : this.anelFino;
      entrada.anel.material = meu ? this.materialMeu : this.materialDeOutro;
      entrada.anel.position.set(x, y + 0.03, z);
      const pulso = meu && !this.calmo ? 1 + Math.sin(quadro.agoraMs / 260) * 0.05 : 1;
      entrada.anel.scale.setScalar(pulso * Math.max(0.6, entrada.visual.altura / 1.7));
    }
    entrada.marca.visible = condutor !== null;
    if (entrada.marca.visible) {
      entrada.marca.position.set(x, y + topo + 0.62, z);
      if (!this.calmo) entrada.marca.rotation.y = quadro.agoraMs / 700;
    }
  }

  /** O que um raio pode acertar. */
  alvos(): Object3D[] {
    const saida: Object3D[] = [];
    for (const entrada of this.entradas.values()) {
      if (entrada.visual.raiz.visible) saida.push(entrada.visual.raiz);
    }
    return saida;
  }

  moradorDe(intersecao: Intersection): MoradorId | null {
    const id: unknown = intersecao.object.userData.moradorId;
    return ehMoradorId(id) && this.entradas.has(id) ? id : null;
  }

  /** Onde cada morador foi desenhado no último quadro, na planta do lote, em milímetros. */
  posicoes(): Record<string, { loteId: LoteId; pos: [number, number] }> {
    const saida: Record<string, { loteId: LoteId; pos: [number, number] }> = {};
    for (const [id, entrada] of this.entradas) {
      if (entrada.desenhado && entrada.loteId) {
        saida[id] = { loteId: entrada.loteId, pos: [entrada.desenhado[0], entrada.desenhado[1]] };
      }
    }
    return saida;
  }

  /** O ponto da cena logo acima da cabeça de um morador. */
  topoDe(moradorId: MoradorId): PontoDaCena | null {
    const entrada = this.entradas.get(moradorId);
    if (!entrada?.visual.raiz.visible) return null;
    const { position } = entrada.visual.raiz;
    return [position.x, position.y + entrada.visual.altura * 0.6, position.z];
  }

  /** Onde os pés de um morador estão na cena. */
  pesDe(moradorId: MoradorId): PontoDaCena | null {
    const entrada = this.entradas.get(moradorId);
    if (!entrada?.visual.raiz.visible) return null;
    const { position } = entrada.visual.raiz;
    return [position.x, position.y, position.z];
  }

  dispose(): void {
    for (const entrada of this.entradas.values()) this.soltar(entrada);
    this.entradas.clear();
    this.anel.dispose();
    this.anelFino.dispose();
    this.losango.dispose();
    this.materialMeu.dispose();
    this.materialDeOutro.dispose();
  }
}
