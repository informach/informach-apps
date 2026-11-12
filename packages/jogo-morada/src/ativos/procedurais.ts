import type { Fase, Objeto, ObjetoId } from "@informach/morada-sim";
import { doCatalogo } from "@informach/morada-sim/conteudo";
import {
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  Color,
  Group,
  InstancedMesh,
  type Intersection,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { giroParaCena, METROS_POR_MM, type PontoDaCena } from "../cena/espaco";
import { pedeMenosMovimento } from "../cena/movimento";
import type { PosturaDoCorpo } from "../cena/situacao";
import type {
  Ativos,
  DescricaoDoMorador,
  ObjetoDaCena,
  PoseDoMorador,
  VisualDoMorador,
  VisualDosObjetos,
} from "./ativos";

/**
 * Os ativos sem arte: moradores são cápsulas com cabeça, do tamanho da fase e
 * com a cor da pele; móveis são caixas com a pegada e a altura do catálogo,
 * coloridas pela categoria. É o que roda no CI e em qualquer máquina, e é o
 * que aparece enquanto um pacote de arte não chegou.
 */

const ALTURAS: Record<Fase, number> = {
  colo: 0.55,
  pequeno: 0.9,
  crianca: 1.25,
  adolescente: 1.6,
  adulto: 1.72,
  idoso: 1.62,
};

/** Bebês e crianças têm a cabeça maior em relação ao corpo. */
const CABECAS: Record<Fase, number> = {
  colo: 1.45,
  pequeno: 1.3,
  crianca: 1.15,
  adolescente: 1.05,
  adulto: 1,
  idoso: 1,
};

const ROUPAS = [0xe07a3f, 0x3f8fd0, 0x4fae7a, 0xc7567c, 0x8b6fd1, 0xd9a520, 0x3aa6a0, 0xb5553c];

const CATEGORIAS: Record<string, number> = {
  armarios: 0xe6dfd0,
  banheiro: 0x9fd4d2,
  cadeiras: 0xdcb44a,
  camas: 0xcf7460,
  cozinha_eletros: 0xcf5a4e,
  cozinha_moveis: 0x94525c,
  criados: 0xeee7d8,
  estantes: 0xdb8a4c,
  luminarias: 0xf4dc8c,
  mesas: 0xb98d62,
  objetos: 0x7fa9a1,
  quadros: 0x7393cf,
  racks_tv: 0xb85c44,
  sofas: 0xdba640,
  tapetes: 0x9a7396,
};
const COR_DESCONHECIDA = 0x9aa0b4;
const NEUTRO = new Color(0xb9b4ac);

/** Altura do assento e do colchão, quando a peça é mais alta do que eles (encosto, cabeceira). */
const ASSENTO_MM = 430;
const COLCHAO_MM = 520;

class MoradorProcedural implements VisualDoMorador {
  readonly raiz = new Group();
  readonly altura: number;
  readonly colo: PontoDaCena;
  private readonly corpo = new Group();
  private readonly barriga: Mesh;
  private readonly materiais: MeshLambertMaterial[];
  private readonly curvado: number;
  private fase = 0;

  constructor(
    descricao: DescricaoDoMorador,
    geometrias: { tronco: BufferGeometry; cabeca: BufferGeometry; barriga: BufferGeometry },
    /** Sem balanço ao andar nem pulso ao agir. */
    private readonly calmo: boolean,
  ) {
    const { fase, aparencia } = descricao;
    this.altura = ALTURAS[fase];
    this.colo = [0, this.altura * 0.62, this.altura * 0.17];
    this.curvado = fase === "idoso" ? 0.1 : 0;

    const roupa = new MeshLambertMaterial({
      color: ROUPAS[Math.abs(aparencia.semente) % ROUPAS.length] ?? ROUPAS[0],
    });
    const pele = new MeshLambertMaterial({ color: aparencia.pele });
    this.materiais = [roupa, pele];

    // O corpo é montado com um metro de altura e depois ganha a altura da fase.
    const tronco = new Mesh(geometrias.tronco, roupa);
    tronco.position.y = 0.37;
    const cabeca = new Mesh(geometrias.cabeca, pele);
    cabeca.position.y = 0.86;
    cabeca.scale.setScalar(CABECAS[fase]);
    this.barriga = new Mesh(geometrias.barriga, roupa);
    this.barriga.position.set(0, 0.36, 0.1);
    this.barriga.visible = false;
    for (const malha of [tronco, cabeca, this.barriga]) {
      malha.castShadow = true;
      malha.userData.moradorId = descricao.moradorId;
    }
    this.corpo.add(tronco, cabeca, this.barriga);
    this.corpo.scale.setScalar(this.altura);
    this.raiz.add(this.corpo);
  }

  aplicar(pose: PoseDoMorador): void {
    const { corpo, altura } = this;
    const segundos = pose.agoraMs / 1000;
    corpo.position.set(0, 0, 0);
    corpo.rotation.set(this.curvado, 0, 0);
    corpo.scale.setScalar(altura);

    if (pose.gravidez > 0) {
      this.barriga.visible = true;
      this.barriga.scale.setScalar(0.45 + 0.75 * pose.gravidez);
    } else {
      this.barriga.visible = false;
    }

    switch (pose.postura) {
      case "em_pe":
        if (pose.andando && !this.calmo) {
          this.fase += pose.dtMs * 0.011;
          corpo.position.y = Math.abs(Math.sin(this.fase)) * 0.035 * altura;
          corpo.rotation.x = this.curvado + 0.09;
          corpo.rotation.z = Math.sin(this.fase) * 0.04;
        }
        break;
      case "sentado":
        // Sentado, o corpo encolhe para o tronco ficar na altura do assento.
        corpo.scale.set(altura, altura * 0.72, altura);
        break;
      case "deitado":
        // De costas, com a cabeça para o lado oposto à frente da peça.
        corpo.rotation.set(-Math.PI / 2, 0, 0);
        corpo.position.set(0, 0.16 * altura, 0.5 * altura);
        break;
      case "no_colo":
        corpo.rotation.set(0, 0, Math.PI / 2);
        corpo.position.set(0.3 * altura, 0, 0);
        break;
    }

    if (pose.agindo && !pose.andando && !this.calmo) {
      // Sem animação de verdade, um pulso diz que a ação está acontecendo.
      const pulso = 1 + Math.sin(segundos * Math.PI * 2 * 1.4) * 0.035;
      corpo.scale.y *= pulso;
    }
  }

  dispose(): void {
    for (const material of this.materiais) material.dispose();
    this.raiz.removeFromParent();
  }
}

class ObjetosProcedurais implements VisualDosObjetos {
  readonly raiz: InstancedMesh;
  private readonly material: MeshLambertMaterial;
  private visiveis: ObjetoDaCena[] = [];

  constructor(
    private readonly itens: readonly ObjetoDaCena[],
    caixa: BufferGeometry,
  ) {
    this.material = new MeshLambertMaterial({ color: 0xffffff });
    this.raiz = new InstancedMesh(caixa, this.material, Math.max(1, itens.length));
    this.raiz.castShadow = true;
    this.raiz.receiveShadow = true;
    this.definirVisiveis(() => true);
  }

  private static medidas(item: ObjetoDaCena): {
    centro: [number, number, number];
    tamanho: [number, number, number];
  } {
    // Uma peça que este cliente não conhece vira um cubo de meio metro, para não sumir.
    const pegada = item.entrada?.pegada ?? [-250, -250, 250, 250];
    const altura = item.entrada?.altura ?? 500;
    const [l0, f0, l1, f1] = pegada;
    return {
      centro: [
        ((l0 + l1) / 2) * METROS_POR_MM,
        (altura / 2) * METROS_POR_MM,
        ((f0 + f1) / 2) * METROS_POR_MM,
      ],
      tamanho: [
        Math.max(0.02, (l1 - l0) * METROS_POR_MM),
        Math.max(0.012, altura * METROS_POR_MM),
        Math.max(0.02, (f1 - f0) * METROS_POR_MM),
      ],
    };
  }

  definirVisiveis(visivel: (item: ObjetoDaCena) => boolean): void {
    this.visiveis = this.itens.filter(visivel);
    const matriz = new Matrix4();
    const giro = new Quaternion();
    const posicao = new Vector3();
    const escala = new Vector3();
    const eixo = new Vector3(0, 1, 0);
    const cor = new Color();
    this.visiveis.forEach((item, indice) => {
      const { centro, tamanho } = ObjetosProcedurais.medidas(item);
      giro.setFromAxisAngle(eixo, giroParaCena(item.objeto.giro));
      // No referencial da peça, a lateral é o X da cena e a frente é o +Z.
      posicao.set(centro[0], centro[1], centro[2]).applyQuaternion(giro);
      posicao.x += item.posicao[0];
      posicao.y += item.posicao[1];
      posicao.z += item.posicao[2];
      escala.set(tamanho[0], tamanho[1], tamanho[2]);
      this.raiz.setMatrixAt(indice, matriz.compose(posicao, giro, escala));

      cor.setHex(CATEGORIAS[item.entrada?.categoria ?? ""] ?? COR_DESCONHECIDA);
      // O que não oferece ação fica mais apagado: o olho acha primeiro o que dá para usar.
      if (!item.entrada?.comportamento) cor.lerp(NEUTRO, 0.45);
      // Uma variação leve por peça, para móveis iguais e vizinhos não virarem um bloco só.
      cor.offsetHSL(0, 0, ((indice % 5) - 2) * 0.012);
      this.raiz.setColorAt(indice, cor);
    });
    this.raiz.count = this.visiveis.length;
    this.raiz.instanceMatrix.needsUpdate = true;
    if (this.raiz.instanceColor) this.raiz.instanceColor.needsUpdate = true;
    this.raiz.computeBoundingSphere();
    this.raiz.computeBoundingBox();
  }

  objetoDe(intersecao: Intersection): ObjetoId | null {
    if (intersecao.object !== this.raiz || intersecao.instanceId === undefined) return null;
    return this.visiveis[intersecao.instanceId]?.objeto.id ?? null;
  }

  topoDe(objetoId: ObjetoId): PontoDaCena | null {
    const item = this.itens.find((candidato) => candidato.objeto.id === objetoId);
    if (!item) return null;
    const { centro, tamanho } = ObjetosProcedurais.medidas(item);
    const giro = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      giroParaCena(item.objeto.giro),
    );
    const topo = new Vector3(centro[0], centro[1] + tamanho[1] / 2, centro[2]).applyQuaternion(
      giro,
    );
    return [topo.x + item.posicao[0], topo.y + item.posicao[1], topo.z + item.posicao[2]];
  }

  dispose(): void {
    this.raiz.removeFromParent();
    this.raiz.dispose();
    this.material.dispose();
  }
}

export class AtivosProcedurais implements Ativos {
  private readonly caixa: BufferGeometry;
  private readonly tronco: BufferGeometry;
  private readonly cabeca: BufferGeometry;
  private readonly barriga: BufferGeometry;
  private readonly calmo = pedeMenosMovimento();

  constructor() {
    // Uma caixa unitária centrada: cada instância leva o próprio centro e tamanho.
    this.caixa = new BoxGeometry(1, 1, 1);
    this.tronco = new CapsuleGeometry(0.16, 0.42, 4, 12);
    // A cabeça leva um nariz: sem ele não se vê para onde a cápsula olha.
    const cranio = new SphereGeometry(0.125, 16, 12);
    const nariz = new SphereGeometry(0.035, 8, 6).translate(0, -0.01, 0.125);
    this.cabeca = mergeGeometries([cranio, nariz]) ?? cranio;
    if (this.cabeca !== cranio) cranio.dispose();
    nariz.dispose();
    this.barriga = new SphereGeometry(0.13, 12, 10);
  }

  criarObjetos(objetos: readonly ObjetoDaCena[]): VisualDosObjetos {
    return new ObjetosProcedurais(objetos, this.caixa);
  }

  criarMorador(descricao: DescricaoDoMorador): VisualDoMorador {
    return new MoradorProcedural(
      descricao,
      { tronco: this.tronco, cabeca: this.cabeca, barriga: this.barriga },
      this.calmo,
    );
  }

  apoio(objeto: Objeto, ponto: string, postura: PosturaDoCorpo): number {
    const entrada = doCatalogo(objeto.catalogo);
    const altura = entrada?.altura ?? 0;
    if (postura === "sentado") return Math.min(altura, ASSENTO_MM);
    if (postura === "deitado") {
      // No beliche, o segundo lugar é a cama de cima.
      if (entrada?.comportamento === "beliche" && ponto.endsWith("_2")) {
        return Math.round(altura * 0.62);
      }
      return Math.min(altura, COLCHAO_MM);
    }
    return 0;
  }

  dispose(): void {
    this.caixa.dispose();
    this.tronco.dispose();
    this.cabeca.dispose();
    this.barriga.dispose();
  }
}
