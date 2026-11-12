import type { Bairro, Lote } from "@informach/morada-sim";
import type { DocumentoDeImovel } from "@informach/morada-sim/formatos";
import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  Mesh,
  type MeshLambertMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { METROS_POR_MM, paraCena } from "./espaco";
import {
  comprimentoDaParede,
  ESPESSURA_DA_PAREDE_MM,
  PE_DIREITO_MM,
  pecasDaParede,
} from "./planta";

/**
 * A casa e o terreno, feitos da planta: piso por cômodo, paredes cortadas
 * pelas aberturas, o lote e o bairro em volta. Tudo o que não se mexe é
 * fundido em poucas malhas, com a cor nos vértices: uma chamada de desenho
 * para o terreno, uma para os pisos e uma para as paredes.
 */

const PISOS: Record<string, number> = {
  sala: 0xb98a5c,
  hall: 0xb98a5c,
  cozinha: 0xb7c1bd,
  quarto_casal: 0xc59877,
  quarto_crianca: 0xdcbd8c,
  banheiro: 0xa7c5c9,
};
const PISO_PADRAO = 0xc0ad95;
const FUNDACAO = 0x8b8780;
const PAREDE = 0xf2ecdf;
/** O topo de uma parede cortada é escuro: diz que ela continua para cima. */
const TOPO_DA_PAREDE = 0x3b4062;
const GRAMA_DO_BAIRRO = 0x5f8f55;
const GRAMA_DO_LOTE = 0x7db068;
const LOTE_VAZIO = 0x93a274;
const RUA = 0x4b4e62;
const CALCADA = 0xbdb7a8;
const MEIO_FIO = 0xe6dfcf;

/** Uma caixa com cor nos vértices: `lados` em tudo e `topo` na face de cima. */
function caixa(
  largura: number,
  altura: number,
  fundura: number,
  lados: number,
  topo: number,
): BufferGeometry {
  const geometria = new BoxGeometry(largura, altura, fundura);
  const total = geometria.attributes.position?.count ?? 0;
  const cores = new Float32Array(total * 3);
  const corDosLados = new Color(lados);
  const corDoTopo = new Color(topo);
  for (let i = 0; i < total; i++) {
    // Na caixa do three, os vértices 8 a 11 são a face de cima.
    const cor = i >= 8 && i <= 11 ? corDoTopo : corDosLados;
    cores[i * 3] = cor.r;
    cores[i * 3 + 1] = cor.g;
    cores[i * 3 + 2] = cor.b;
  }
  geometria.setAttribute("color", new BufferAttribute(cores, 3));
  return geometria;
}

/** Funde as peças em uma malha só e solta as geometrias de cada uma. */
function fundir(pecas: BufferGeometry[], material: MeshLambertMaterial): Mesh | null {
  if (pecas.length === 0) return null;
  const fundida = mergeGeometries(pecas);
  for (const peca of pecas) peca.dispose();
  if (!fundida) return null;
  return new Mesh(fundida, material);
}

/** Um retângulo da planta do bairro, em milímetros, como uma laje fina na cena. */
function laje(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  base: number,
  altura: number,
  lados: number,
  topo: number,
): BufferGeometry {
  const peca = caixa(
    Math.abs(x1 - x0) * METROS_POR_MM,
    altura * METROS_POR_MM,
    Math.abs(y1 - y0) * METROS_POR_MM,
    lados,
    topo,
  );
  const [x, y, z] = paraCena((x0 + x1) / 2, (y0 + y1) / 2, base + altura / 2);
  return peca.translate(x, y, z);
}

export type TerrenoMontado = { malha: Mesh | null };

/** O bairro: grama, rua na frente dos lotes, e cada lote com o seu meio-fio. */
export function montarTerreno(
  bairro: Bairro,
  lotes: readonly Lote[],
  material: MeshLambertMaterial,
): TerrenoMontado {
  const pecas: BufferGeometry[] = [];
  const [largura, fundura] = bairro.tamanho;
  // Uma margem em volta, para a câmera não ver a borda do mundo de perto.
  const margem = 30_000;
  pecas.push(
    laje(
      -margem,
      -margem,
      largura + margem,
      fundura + margem,
      -60,
      40,
      GRAMA_DO_BAIRRO,
      GRAMA_DO_BAIRRO,
    ),
  );

  // A frente das casas dá para −Y: a rua passa antes do primeiro lote.
  const frente = Math.min(...lotes.map((lote) => lote.origem[1]), fundura);
  if (lotes.length > 0 && frente > 1500) {
    const calcada = Math.min(1200, frente / 4);
    pecas.push(
      laje(
        -margem,
        frente - calcada - 200,
        largura + margem,
        frente - 200,
        -20,
        30,
        CALCADA,
        CALCADA,
      ),
    );
    pecas.push(
      laje(
        -margem,
        Math.max(-margem, frente - calcada - 4200),
        largura + margem,
        frente - calcada - 200,
        -20,
        15,
        RUA,
        RUA,
      ),
    );
  }

  for (const lote of lotes) {
    const [ox, oy] = lote.origem;
    const [lx, ly] = lote.tamanho;
    const grama = lote.imovelId ? GRAMA_DO_LOTE : LOTE_VAZIO;
    pecas.push(laje(ox, oy, ox + lx, oy + ly, -20, 25, grama, grama));
    // Meio-fio: quatro réguas baixas marcam onde o lote acaba.
    const regua = 90;
    pecas.push(laje(ox, oy, ox + lx, oy + regua, 0, 60, MEIO_FIO, MEIO_FIO));
    pecas.push(laje(ox, oy + ly - regua, ox + lx, oy + ly, 0, 60, MEIO_FIO, MEIO_FIO));
    pecas.push(laje(ox, oy, ox + regua, oy + ly, 0, 60, MEIO_FIO, MEIO_FIO));
    pecas.push(laje(ox + lx - regua, oy, ox + lx, oy + ly, 0, 60, MEIO_FIO, MEIO_FIO));
  }

  const malha = fundir(pecas, material);
  if (malha) malha.receiveShadow = true;
  return { malha };
}

export type CasaMontada = { pisos: Mesh | null; paredes: Mesh | null };

/**
 * A casa de um lote. `corte` é a altura das paredes baixas, em milímetros;
 * `null` é a parede inteira. Não há telhado: a casa é vista de cima.
 */
export function montarCasa(
  imovel: DocumentoDeImovel,
  lote: Lote,
  corte: number | null,
  material: MeshLambertMaterial,
): CasaMontada {
  const [ox, oy] = lote.origem;
  const pisos: BufferGeometry[] = [];
  const paredes: BufferGeometry[] = [];
  const espessura = ESPESSURA_DA_PAREDE_MM;

  for (const andar of imovel.andares) {
    // O piso de cada cômodo é o topo de um bloco que desce até o terreno: a fundação.
    for (const comodo of andar.comodos) {
      const cor = PISOS[comodo.tipo] ?? PISO_PADRAO;
      for (const [x0, y0, x1, y1] of comodo.ret) {
        pisos.push(
          laje(ox + x0, oy + y0, ox + x1, oy + y1, 0, Math.max(20, andar.z), FUNDACAO, cor),
        );
      }
    }

    let cx = 0;
    let cy = 0;
    for (const ponto of andar.contorno) {
      cx += ponto[0] / andar.contorno.length;
      cy += ponto[1] / andar.contorno.length;
    }

    for (const parede of andar.paredes) {
      const comprimento = comprimentoDaParede(parede);
      if (comprimento <= 0) continue;
      const dx = (parede.b[0] - parede.a[0]) / comprimento;
      const dy = (parede.b[1] - parede.a[1]) / comprimento;
      // Em torno do Y da cena, o X da peça vira a direção da parede na planta.
      const angulo = Math.atan2(dy, dx);
      for (const peca of pecasDaParede(parede, andar.aberturas, PE_DIREITO_MM, corte)) {
        // As pontas avançam meia espessura, para os cantos fecharem.
        const de = peca.de <= 0 ? -espessura / 2 : peca.de;
        const ate = peca.ate >= comprimento ? comprimento + espessura / 2 : peca.ate;
        const meio = (de + ate) / 2;
        const cortada = corte !== null && peca.z1 >= corte;
        const geometria = caixa(
          (ate - de) * METROS_POR_MM,
          (peca.z1 - peca.z0) * METROS_POR_MM,
          espessura * METROS_POR_MM,
          PAREDE,
          cortada ? TOPO_DA_PAREDE : PAREDE,
        );
        const [x, y, z] = paraCena(
          ox + parede.a[0] + dx * meio,
          oy + parede.a[1] + dy * meio,
          andar.z + (peca.z0 + peca.z1) / 2,
        );
        paredes.push(geometria.rotateY(angulo).translate(x, y, z));
      }

      // Um degrau em cada porta de fora, do terreno ao piso da casa.
      for (const abertura of andar.aberturas) {
        if (abertura.parede !== parede.id || abertura.tipo !== "porta" || !abertura.externa)
          continue;
        if (andar.z <= 60) continue;
        // A normal que aponta para longe do meio da casa.
        let nx = -dy;
        let ny = dx;
        if ((abertura.centro[0] - cx) * nx + (abertura.centro[1] - cy) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        const fundo = 520;
        const degrau = caixa(
          (abertura.largura + 300) * METROS_POR_MM,
          (andar.z / 2) * METROS_POR_MM,
          fundo * METROS_POR_MM,
          FUNDACAO,
          CALCADA,
        );
        const [x, y, z] = paraCena(
          ox + abertura.centro[0] + nx * (espessura / 2 + fundo / 2),
          oy + abertura.centro[1] + ny * (espessura / 2 + fundo / 2),
          andar.z / 4,
        );
        pisos.push(degrau.rotateY(angulo).translate(x, y, z));
      }
    }
  }

  const malhaDosPisos = fundir(pisos, material);
  if (malhaDosPisos) malhaDosPisos.receiveShadow = true;
  const malhaDasParedes = fundir(paredes, material);
  if (malhaDasParedes) {
    malhaDasParedes.castShadow = true;
    malhaDasParedes.receiveShadow = true;
  }
  return { pisos: malhaDosPisos, paredes: malhaDasParedes };
}
