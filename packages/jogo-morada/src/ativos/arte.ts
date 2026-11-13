import {
  type BibliotecaDoManifesto,
  type Manifesto,
  ManifestoSchema,
  type PersonagemDoManifesto,
} from "@informach/morada-arte/manifesto";
import type { Lote, Objeto } from "@informach/morada-sim";
import type { DocumentoDeImovel } from "@informach/morada-sim/formatos";
import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  type Bone,
  BoxGeometry,
  type BufferAttribute,
  BufferGeometry,
  Group,
  type InterleavedBufferAttribute,
  LoopRepeat,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  Quaternion,
  RepeatWrapping,
  type SkinnedMesh,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";
import { clone as clonarComEsqueleto } from "three/addons/utils/SkeletonUtils.js";
import type { PontoDaCena } from "../cena/espaco";
import type { PosturaDoCorpo } from "../cena/situacao";
import { montarAberturas } from "./aberturas";
import type {
  Ativos,
  DescricaoDoMorador,
  ObjetoDaCena,
  PoseDoMorador,
  VisualDoMorador,
  VisualDosObjetos,
} from "./ativos";
import {
  ajusteDoApoio,
  bibliotecasDaPose,
  escolherClipe,
  escolherPersonagem,
  expressaoDaPose,
  pesosDaGravidez,
} from "./escolhas";
import { type ModeloDeObjeto, ObjetosDeArte } from "./objetos";
import { AtivosProcedurais } from "./procedurais";

/**
 * Os ativos com os pacotes de arte (`@informach/morada-arte`) que o servidor do
 * jogo entrega em `<origem>/arte/<arquivo>` a quem tem sessão de jogo.
 *
 * Nada espera a arte: cada morador nasce procedural e veste o corpo de verdade
 * quando o pacote dele chega. Sem manifesto, sem pacote para a fase ou com o
 * download falho, ele continua procedural. Com manifesto V2, os objetos da
 * casa também trocam o procedural pelos modelos, com seleção por instância.
 *
 * Cada arquivo é baixado uma vez por jogo; as bibliotecas de animação, só
 * quando uma pose pede (a de grávida, só no 2º trimestre). Um download que
 * falha é esquecido, e o próximo morador que precisar dele tenta de novo.
 */

/** O que veio de um GLB: a cena e as animações. */
export type PacoteLido = { scene: Object3D; animations: AnimationClip[] };

export type OpcoesDaArte = {
  /** Origem HTTP do servidor do jogo (`https://morada.exemplo`), sem barra no fim. */
  origem: string;
  /** A sessão de jogo vigente: vai no cabeçalho `Authorization` de cada pedido. */
  token(): string;
  fetch?: typeof fetch;
  /** Lê um GLB. O padrão é o `GLTFLoader` com o decodificador do meshopt, baixado sob demanda. */
  lerPacote?(dados: ArrayBuffer): Promise<PacoteLido>;
  /** Avisa uma falha de download ou de leitura, uma vez por arquivo. */
  aoFalhar?(arquivo: string, erro: unknown): void;
  lerTextura?(dados: Blob): Promise<Texture>;
};

/** Uma biblioteca de animação pronta: a entrada do manifesto e os clipes pelo nome. */
export type BibliotecaCarregada = {
  entrada: BibliotecaDoManifesto;
  clipes: Map<string, AnimationClip>;
};

/** O `GLTFLoader` e o decodificador ficam fora do arquivo principal: só quem tem arte os baixa. */
async function lerComGltfLoader(dados: ArrayBuffer): Promise<PacoteLido> {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
  ]);
  const leitor = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return leitor.parseAsync(dados, "");
}

export class AtivosDeArte implements Ativos {
  private readonly procedurais = new AtivosProcedurais();
  private readonly buscar: typeof fetch;
  private readonly lerPacote: (dados: ArrayBuffer) => Promise<PacoteLido>;
  private manifesto: Promise<Manifesto | null> | null = null;
  private readonly pacotes = new Map<string, Promise<PacoteLido | null>>();
  private readonly bibliotecas = new Map<string, BibliotecaCarregada | "baixando">();
  /** Tudo o que veio de um GLB, para soltar no fim. */
  private readonly lidos: PacoteLido[] = [];
  private descartado = false;
  private manifestoLido: Manifesto | null = null;
  private readonly modelos = new Map<string, ModeloDeObjeto>();
  private readonly materiais = new Map<string, MeshLambertMaterial>();
  private readonly cenasDosVaos = new Map<string, Object3D>();
  private readonly pedidosDoAmbiente = new Set<string>();
  private readonly ouvintes = new Set<() => void>();
  private notificacaoPendente = false;

  constructor(private readonly opcoes: OpcoesDaArte) {
    this.buscar = opcoes.fetch ?? ((entrada, init) => fetch(entrada, init));
    this.lerPacote = opcoes.lerPacote ?? lerComGltfLoader;
  }

  criarObjetos(objetos: readonly ObjetoDaCena[]): VisualDosObjetos {
    void this.prepararObjetos(objetos);
    const semArte = objetos.filter(
      (x) => !this.modelos.has(`${x.objeto.catalogo}@${x.objeto.versao}`),
    );
    return new ObjetosDeArte(objetos, this.modelos, this.procedurais.criarObjetos(semArte));
  }

  apoio(objeto: Objeto, ponto: string, postura: PosturaDoCorpo): number {
    const altura = this.modelos.get(`${objeto.catalogo}@${objeto.versao}`)?.entrada.apoios[ponto];
    if (altura !== undefined && (postura === "sentado" || postura === "deitado"))
      return Math.round(altura * 1000);
    return this.procedurais.apoio(objeto, ponto, postura);
  }

  aoMudar(ouvinte: () => void): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  private avisar(): void {
    if (this.notificacaoPendente || this.descartado) return;
    this.notificacaoPendente = true;
    queueMicrotask(() => {
      this.notificacaoPendente = false;
      if (!this.descartado) for (const ouvinte of this.ouvintes) ouvinte();
    });
  }

  private async prepararObjetos(objetos: readonly ObjetoDaCena[]): Promise<void> {
    const m = await this.obterManifesto();
    if (m?.versao !== 2 || this.descartado) return;
    const necessarios = new Set(objetos.map((x) => `${x.objeto.catalogo}@${x.objeto.versao}`));
    for (const entrada of m.objetos) {
      const chave = `${entrada.id}@${entrada.versao}`;
      if (
        !necessarios.has(chave) ||
        this.modelos.has(chave) ||
        this.pedidosDoAmbiente.has(entrada.arquivo)
      )
        continue;
      this.pedidosDoAmbiente.add(entrada.arquivo);
      void this.obterPacote(entrada.arquivo).then((pacote) => {
        if (pacote && !this.descartado) {
          this.modelos.set(chave, { entrada, cena: pacote.scene });
          this.avisar();
        }
        // Uma falha permite tentar de novo numa reconstrução futura da cena.
        this.pedidosDoAmbiente.delete(entrada.arquivo);
      });
    }
  }

  acabamento(id: string): MeshLambertMaterial | null {
    const pronto = this.materiais.get(id);
    if (pronto || this.descartado) return pronto ?? null;
    void this.prepararAcabamento(id);
    return null;
  }

  private async prepararAcabamento(id: string): Promise<void> {
    const m = await this.obterManifesto();
    if (m?.versao !== 2 || this.descartado || this.materiais.has(id)) return;
    const entrada = m.acabamentos.find((x) => x.id === id);
    if (!entrada || this.pedidosDoAmbiente.has(entrada.arquivo)) return;
    this.pedidosDoAmbiente.add(entrada.arquivo);
    try {
      const resposta = await this.baixar(entrada.arquivo);
      if (!resposta || this.descartado) return;
      const blob = await resposta.blob();
      const textura = this.opcoes.lerTextura
        ? await this.opcoes.lerTextura(blob)
        : new Texture(await createImageBitmap(blob, { imageOrientation: "flipY" }));
      if (this.descartado) {
        soltarTextura(textura);
        return;
      }
      textura.colorSpace = SRGBColorSpace;
      textura.wrapS = textura.wrapT = RepeatWrapping;
      textura.repeat.set(1 / entrada.escala, 1 / entrada.escala);
      textura.needsUpdate = true;
      this.materiais.set(id, new MeshLambertMaterial({ map: textura }));
      this.avisar();
    } catch (erro) {
      this.opcoes.aoFalhar?.(entrada.arquivo, erro);
    } finally {
      this.pedidosDoAmbiente.delete(entrada.arquivo);
    }
  }

  criarAberturas(imovel: DocumentoDeImovel, lote: Lote, corte: number | null): Object3D {
    const m = this.manifestoLido;
    if (corte !== null || !m || m.versao !== 2) return new Group();
    for (const entrada of m.aberturas) {
      if (this.cenasDosVaos.has(entrada.arquivo) || this.pedidosDoAmbiente.has(entrada.arquivo))
        continue;
      this.pedidosDoAmbiente.add(entrada.arquivo);
      void this.obterPacote(entrada.arquivo).then((pacote) => {
        if (pacote && !this.descartado) {
          this.cenasDosVaos.set(entrada.arquivo, pacote.scene);
          this.avisar();
        }
        this.pedidosDoAmbiente.delete(entrada.arquivo);
      });
    }
    return montarAberturas(imovel, lote, m.aberturas, this.cenasDosVaos);
  }

  criarMorador(descricao: DescricaoDoMorador): VisualDoMorador {
    // O pacote só é pedido quando a cena desenha o morador pela primeira vez: quem
    // está fora do bairro (o vizinho avulso) não baixa nada.
    const visual: MoradorDeArte = new MoradorDeArte(
      descricao,
      this.procedurais.criarMorador(descricao),
      () => void this.vestir(visual, descricao),
    );
    return visual;
  }

  /** Quando o pacote do morador chega, o visual troca o corpo procedural pelo de arte. */
  private async vestir(visual: MoradorDeArte, descricao: DescricaoDoMorador): Promise<void> {
    const manifesto = await this.obterManifesto();
    if (!manifesto || visual.descartado || this.descartado) return;
    const personagem = escolherPersonagem(manifesto, descricao);
    if (!personagem) return;
    // A biblioteca principal começa a baixar junto com o corpo.
    if (personagem.biblioteca) this.biblioteca(manifesto, personagem.biblioteca);
    const pacote = await this.obterPacote(personagem.arquivo);
    if (!pacote || visual.descartado || this.descartado) return;
    visual.vestir(
      new CorpoDeArte(personagem, pacote.scene, descricao, (id) => this.biblioteca(manifesto, id)),
    );
  }

  /** A biblioteca pronta, ou `null` enquanto baixa (e começa a baixar, se ninguém pediu ainda). */
  private biblioteca(manifesto: Manifesto, id: string): BibliotecaCarregada | null {
    const atual = this.bibliotecas.get(id);
    if (atual === "baixando") return null;
    if (atual) return atual;
    const entrada = manifesto.bibliotecas.find((b) => b.id === id);
    if (!entrada) return null;
    this.bibliotecas.set(id, "baixando");
    void this.obterPacote(entrada.arquivo).then((pacote) => {
      if (!pacote) {
        this.bibliotecas.delete(id);
        return;
      }
      this.bibliotecas.set(id, {
        entrada,
        clipes: new Map(pacote.animations.map((clipe) => [clipe.name, clipe])),
      });
    });
    return null;
  }

  private obterManifesto(): Promise<Manifesto | null> {
    if (!this.manifesto) {
      const pedido = this.baixar("manifest.json").then(async (resposta) => {
        if (!resposta) return null;
        try {
          const lido = ManifestoSchema.safeParse(await resposta.json());
          if (lido.success) {
            this.manifestoLido = lido.data;
            return lido.data;
          }
          this.opcoes.aoFalhar?.("manifest.json", lido.error);
        } catch (erro) {
          this.opcoes.aoFalhar?.("manifest.json", erro);
        }
        return null;
      });
      this.manifesto = pedido;
      // Sem manifesto, o próximo morador pergunta de novo.
      void pedido.then((manifesto) => {
        if (!manifesto && this.manifesto === pedido) this.manifesto = null;
      });
    }
    return this.manifesto;
  }

  private obterPacote(arquivo: string): Promise<PacoteLido | null> {
    let pedido = this.pacotes.get(arquivo);
    if (!pedido) {
      pedido = this.baixar(arquivo).then(async (resposta) => {
        if (!resposta) return null;
        try {
          const pacote = await this.lerPacote(await resposta.arrayBuffer());
          if (this.descartado) {
            soltarPacote(pacote);
            return null;
          }
          this.lidos.push(pacote);
          return pacote;
        } catch (erro) {
          this.opcoes.aoFalhar?.(arquivo, erro);
          return null;
        }
      });
      this.pacotes.set(arquivo, pedido);
      const feito = pedido;
      void feito.then((pacote) => {
        if (!pacote && this.pacotes.get(arquivo) === feito) this.pacotes.delete(arquivo);
      });
    }
    return pedido;
  }

  /** Um arquivo do servidor do jogo, com a sessão. `null` em qualquer falha (já avisada). */
  private async baixar(arquivo: string): Promise<Response | null> {
    try {
      const resposta = await this.buscar(`${this.opcoes.origem}/arte/${arquivo}`, {
        headers: { authorization: `Bearer ${this.opcoes.token()}` },
        credentials: "omit",
      });
      if (resposta.ok) return resposta;
      this.opcoes.aoFalhar?.(arquivo, new Error(`HTTP ${resposta.status}`));
    } catch (erro) {
      this.opcoes.aoFalhar?.(arquivo, erro);
    }
    return null;
  }

  dispose(): void {
    this.descartado = true;
    this.procedurais.dispose();
    for (const pacote of this.lidos.splice(0)) soltarPacote(pacote);
    this.bibliotecas.clear();
    this.pacotes.clear();
    this.ouvintes.clear();
    this.modelos.clear();
    this.cenasDosVaos.clear();
    for (const material of this.materiais.values()) {
      if (material.map) soltarTextura(material.map);
      material.dispose();
    }
    this.materiais.clear();
  }
}

function soltarTextura(textura: Texture): void {
  textura.dispose();
  const imagem: unknown = textura.image;
  if (typeof ImageBitmap !== "undefined" && imagem instanceof ImageBitmap) imagem.close();
}

/** Solta geometrias, materiais e texturas de um GLB. */
function soltarPacote(pacote: PacoteLido): void {
  pacote.scene.traverse((objeto) => {
    if (!(objeto as Mesh).isMesh) return;
    const malha = objeto as Mesh;
    malha.geometry.dispose();
    const materiais = Array.isArray(malha.material) ? malha.material : [malha.material];
    for (const material of materiais) {
      for (const valor of Object.values(material)) {
        if (valor && typeof valor === "object" && (valor as { isTexture?: boolean }).isTexture) {
          (valor as { dispose(): void }).dispose();
        }
      }
      material.dispose();
    }
  });
}

/**
 * O visual que a cena recebe: começa com o corpo procedural e troca pelo de
 * arte, dentro da mesma raiz, quando ele chega. A cena não percebe a troca.
 */
class MoradorDeArte implements VisualDoMorador {
  readonly raiz = new Group();
  descartado = false;
  private corpo: VisualDoMorador;
  private pedirCorpo: (() => void) | null;

  constructor(
    private readonly descricao: DescricaoDoMorador,
    provisorio: VisualDoMorador,
    pedirCorpo: () => void,
  ) {
    this.pedirCorpo = pedirCorpo;
    this.corpo = provisorio;
    this.raiz.add(provisorio.raiz);
  }

  get altura(): number {
    return this.corpo.altura;
  }

  get colo(): PontoDaCena {
    return this.corpo.colo;
  }

  vestir(corpo: VisualDoMorador): void {
    if (this.descartado) {
      corpo.dispose();
      return;
    }
    // A cena marca cada objeto com o morador para saber em quem o clique acertou.
    corpo.raiz.traverse((filho) => {
      filho.userData.moradorId = this.descricao.moradorId;
    });
    const anterior = this.corpo;
    this.corpo = corpo;
    this.raiz.add(corpo.raiz);
    anterior.dispose();
  }

  aplicar(pose: PoseDoMorador): void {
    if (this.pedirCorpo) {
      const pedir = this.pedirCorpo;
      this.pedirCorpo = null;
      pedir();
    }
    this.corpo.aplicar(pose);
  }

  dispose(): void {
    this.descartado = true;
    this.corpo.dispose();
    this.raiz.removeFromParent();
  }
}

/** A cópia de uma geometria que divide os atributos com a original: só a lista de atributos é dela. */
function geometriaPropria(original: BufferGeometry): BufferGeometry {
  const copia = new BufferGeometry();
  copia.setIndex(original.index);
  for (const [nome, atributo] of Object.entries(original.attributes)) {
    copia.setAttribute(nome, atributo);
  }
  copia.morphAttributes = { ...original.morphAttributes };
  copia.morphTargetsRelative = original.morphTargetsRelative;
  for (const grupo of original.groups)
    copia.addGroup(grupo.start, grupo.count, grupo.materialIndex);
  copia.boundingBox = original.boundingBox;
  copia.boundingSphere = original.boundingSphere;
  return copia;
}

type Atributo = BufferAttribute | InterleavedBufferAttribute;

/** Um corpo que troca os pesos da pele ao dobrar (a saia sentada ou deitada). */
type Dobravel = {
  geometria: BufferGeometry;
  pano: [Atributo, Atributo];
  dobrado: [Atributo, Atributo];
};

/** Ossos que não existem no esqueleto não entram: o `colo` cai na âncora do manifesto. */
function ossoDe(modelo: Object3D, nome: string): Bone | null {
  const achado = modelo.getObjectByName(nome);
  return achado && (achado as Bone).isBone ? (achado as Bone) : null;
}

/** De bruços para cima e atravessado: a cabeça vai para a mão esquerda de quem carrega (+X). */
const DEITADO_NO_COLO = new Quaternion().setFromRotationMatrix(
  new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)),
);
/** De costas, a cabeça para trás: como o procedural deita quem não tem clipe de deitar. */
const DEITADO_DE_COSTAS = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const SEM_GIRO = new Quaternion();

const _inversa = new Matrix4();
const _esquerda = new Vector3();
const _direita = new Vector3();

/**
 * Um personagem de um pacote, com o próprio esqueleto (uma cópia da cena do
 * GLB que divide geometria, materiais e texturas com as outras cópias) e o
 * próprio misturador de animações.
 */
class CorpoDeArte implements VisualDoMorador {
  readonly raiz = new Group();
  readonly altura: number;
  private coloAtual: PontoDaCena;
  /** Onde o modelo fica dentro da raiz: desce para o apoio, deita no colo. */
  private readonly postura = new Group();
  private readonly modelo: Object3D;
  private readonly misturador: AnimationMixer;
  private readonly rostos = new Map<string, Object3D>();
  private readonly malhasDoCorpo: SkinnedMesh[] = [];
  private readonly dobraveis: Dobravel[] = [];
  private readonly descanso: { osso: Bone; p: Vector3; q: Quaternion; s: Vector3 }[] = [];
  private readonly maos: [Bone, Bone] | null;
  private readonly alvo: Mesh;
  private acao: AnimationAction | null = null;
  private clipeAtual: AnimationClip | null = null;
  private expressaoAtual = "";
  private dobrada = false;

  constructor(
    private readonly personagem: PersonagemDoManifesto,
    cena: Object3D,
    descricao: DescricaoDoMorador,
    private readonly biblioteca: (id: string) => BibliotecaCarregada | null,
  ) {
    this.altura = personagem.altura;
    this.coloAtual = personagem.ancoras.colo;
    // Os próprios ossos; geometria, materiais e texturas ficam divididos com as outras cópias.
    this.modelo = clonarComEsqueleto(cena);
    this.postura.add(this.modelo);
    this.raiz.add(this.postura);
    this.misturador = new AnimationMixer(this.modelo);

    this.modelo.traverse((objeto) => {
      const malha = objeto as SkinnedMesh;
      if (!malha.isSkinnedMesh) return;
      // A caixa da malha quantizada não acompanha a pose; e o clique acerta a caixa de `alvo`.
      malha.frustumCulled = false;
      malha.castShadow = true;
      malha.raycast = () => undefined;
    });
    for (const expressao of personagem.expressoes) {
      const no = this.modelo.getObjectByName(expressao.no);
      if (no) this.rostos.set(expressao.nome, no);
    }
    this.modelo.getObjectByName(personagem.noDoCorpo)?.traverse((objeto) => {
      const malha = objeto as SkinnedMesh;
      if (!malha.isSkinnedMesh) return;
      this.malhasDoCorpo.push(malha);
      const g = malha.geometry;
      const juntas = g.getAttribute("_joints_dobrado");
      const pesos = g.getAttribute("_weights_dobrado");
      if (!personagem.pesosDobrado || !juntas || !pesos) return;
      // Trocar os pesos mexe na geometria: cada morador leva a sua, com os mesmos atributos.
      const propria = geometriaPropria(g);
      malha.geometry = propria;
      this.dobraveis.push({
        geometria: propria,
        pano: [g.getAttribute("skinIndex"), g.getAttribute("skinWeight")],
        dobrado: [juntas, pesos],
      });
    });
    this.modelo.traverse((objeto) => {
      const osso = objeto as Bone;
      if (!osso.isBone) return;
      this.descanso.push({
        osso,
        p: osso.position.clone(),
        q: osso.quaternion.clone(),
        s: osso.scale.clone(),
      });
    });
    const esquerda = ossoDe(this.modelo, personagem.ancoras.maos.esq.osso);
    const direita = ossoDe(this.modelo, personagem.ancoras.maos.dir.osso);
    this.maos = esquerda && direita ? [esquerda, direita] : null;

    // O alvo do clique: uma caixa invisível do tamanho do corpo, que acompanha a postura.
    this.alvo = new Mesh(
      new BoxGeometry(this.altura * 0.32, this.altura, this.altura * 0.22),
      new MeshBasicMaterial({ visible: false }),
    );
    this.alvo.position.y = this.altura / 2;
    this.alvo.userData.moradorId = descricao.moradorId;
    this.postura.add(this.alvo);
    this.expressao(personagem.expressoes[0]?.nome ?? "");
  }

  get colo(): PontoDaCena {
    return this.coloAtual;
  }

  aplicar(pose: PoseDoMorador): void {
    const bibliotecas = bibliotecasDaPose(this.personagem, pose.gravidez)
      .map((id) => this.biblioteca(id))
      .filter((b): b is BibliotecaCarregada => b !== null);
    const escolha = escolherClipe(
      bibliotecas.map((b) => b.entrada),
      pose,
    );
    const clipe = escolha
      ? (bibliotecas
          .find((b) => b.entrada === escolha.biblioteca)
          ?.clipes.get(escolha.clipe.nome) ?? null)
      : null;
    this.tocar(clipe);
    this.dobrar(escolha?.clipe.dobrada === true);
    this.misturador.update(Math.max(0, pose.dtMs) / 1000);

    // Onde o modelo fica dentro da raiz.
    const [ax, ay, az] = ajusteDoApoio(escolha?.clipe ?? null, pose.postura);
    if (pose.postura === "no_colo") {
      // Deitado entre as mãos de quem carrega, o meio do corpo no colo.
      const k = this.altura / 0.5;
      this.postura.quaternion.copy(DEITADO_NO_COLO);
      this.postura.position.set(-0.27 * k, 0.06, 0.05);
    } else if (pose.postura === "deitado" && !clipe) {
      this.postura.quaternion.copy(DEITADO_DE_COSTAS);
      this.postura.position.set(0, 0.16 * this.altura, 0.5 * this.altura);
    } else {
      this.postura.quaternion.copy(SEM_GIRO);
      this.postura.position.set(ax, ay, az);
    }

    this.expressao(expressaoDaPose(this.personagem, pose));
    this.gravidez(pose.gravidez);
    this.medirColo(pose.carregando && clipe !== null);
  }

  /** Troca de clipe com uma passagem curta; sem clipe, volta à pose de descanso. */
  private tocar(clipe: AnimationClip | null): void {
    if (clipe === this.clipeAtual) return;
    this.clipeAtual = clipe;
    const anterior = this.acao;
    if (!clipe) {
      this.misturador.stopAllAction();
      this.acao = null;
      this.descansar();
      return;
    }
    const acao = this.misturador.clipAction(clipe);
    acao.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
    acao.reset().play();
    if (anterior) acao.crossFadeFrom(anterior, 0.25, false);
    this.acao = acao;
  }

  private descansar(): void {
    for (const { osso, p, q, s } of this.descanso) {
      osso.position.copy(p);
      osso.quaternion.copy(q);
      osso.scale.copy(s);
    }
  }

  private dobrar(dobrada: boolean): void {
    if (dobrada === this.dobrada) return;
    this.dobrada = dobrada;
    for (const d of this.dobraveis) {
      const [juntas, pesos] = dobrada ? d.dobrado : d.pano;
      d.geometria.setAttribute("skinIndex", juntas);
      d.geometria.setAttribute("skinWeight", pesos);
    }
  }

  private expressao(nome: string): void {
    const alvo = this.rostos.has(nome) ? nome : (this.personagem.expressoes[0]?.nome ?? "");
    if (alvo === this.expressaoAtual) return;
    this.expressaoAtual = alvo;
    for (const [chave, no] of this.rostos) no.visible = chave === alvo;
  }

  private gravidez(valor: number): void {
    const formas = this.personagem.gravidez;
    if (formas.length === 0) return;
    const pesos = pesosDaGravidez(formas, valor);
    for (const malha of this.malhasDoCorpo) {
      const indices = malha.morphTargetDictionary;
      const influencias = malha.morphTargetInfluences;
      if (!indices || !influencias) continue;
      formas.forEach((forma, k) => {
        const i = indices[forma];
        if (i !== undefined) influencias[i] = pesos[k] ?? 0;
      });
    }
  }

  /**
   * Segurando o bebê, o colo é o meio das duas mãos neste quadro, no
   * referencial da raiz: o bebê acompanha o embalo. Fora disso, a âncora do
   * manifesto.
   */
  private medirColo(segurando: boolean): void {
    if (!segurando || !this.maos) {
      this.coloAtual = this.personagem.ancoras.colo;
      return;
    }
    this.raiz.updateMatrixWorld(true);
    _inversa.copy(this.raiz.matrixWorld).invert();
    const [esquerda, direita] = this.maos;
    _esquerda.setFromMatrixPosition(esquerda.matrixWorld).applyMatrix4(_inversa);
    _direita.setFromMatrixPosition(direita.matrixWorld).applyMatrix4(_inversa);
    _esquerda.add(_direita).multiplyScalar(0.5);
    this.coloAtual = [_esquerda.x, _esquerda.y, _esquerda.z];
  }

  dispose(): void {
    this.misturador.stopAllAction();
    this.misturador.uncacheRoot(this.modelo);
    // As geometrias próprias dividem os atributos com o pacote: soltá-las tiraria
    // da placa os buffers que os outros moradores usam. Só o alvo é deste corpo.
    this.alvo.geometry.dispose();
    (this.alvo.material as MeshBasicMaterial).dispose();
    this.raiz.removeFromParent();
  }
}
