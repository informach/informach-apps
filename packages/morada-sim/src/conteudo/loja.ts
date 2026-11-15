import type { CatalogoDaLoja, OfertaDeMovel } from "../comandos/loja";

/** Preços iniciais em moeda fictícia, sem ligação com assinatura ou dinheiro real. */
export const POLITICA_DE_PRECOS = 1;
const OFERTAS_INICIAIS: readonly Readonly<OfertaDeMovel>[] = [
  {
    catalogo: "rack_pes_2portas_vermelho",
    versaoDoCatalogo: 1,
    rotulo: "Rack com duas portas",
    compraCentavos: 24_000,
    revendaCentavos: 12_000,
  },
  {
    catalogo: "sofa_classico_mostarda",
    versaoDoCatalogo: 1,
    rotulo: "Sofá de três lugares",
    compraCentavos: 46_000,
    revendaCentavos: 23_000,
  },
  {
    catalogo: "mesa_lateral_redonda_prateleira_verde",
    versaoDoCatalogo: 1,
    rotulo: "Mesa lateral redonda",
    compraCentavos: 9_500,
    revendaCentavos: 4_750,
  },
  {
    catalogo: "poltrona_capitone_couro",
    versaoDoCatalogo: 1,
    rotulo: "Poltrona de couro",
    compraCentavos: 22_000,
    revendaCentavos: 11_000,
  },
  {
    catalogo: "cadeira_jantar_alta_amarela",
    versaoDoCatalogo: 1,
    rotulo: "Cadeira de jantar",
    compraCentavos: 9_000,
    revendaCentavos: 4_500,
  },
  {
    catalogo: "cama_casal_classica_terracota",
    versaoDoCatalogo: 1,
    rotulo: "Cama de casal",
    compraCentavos: 65_000,
    revendaCentavos: 32_500,
  },
  {
    catalogo: "criado_classico_branco",
    versaoDoCatalogo: 1,
    rotulo: "Mesa de cabeceira",
    compraCentavos: 12_000,
    revendaCentavos: 6_000,
  },
  {
    catalogo: "geladeira_retro_uma_porta_vermelha",
    versaoDoCatalogo: 1,
    rotulo: "Geladeira de uma porta",
    compraCentavos: 78_000,
    revendaCentavos: 39_000,
  },
];

/** Cópia própria para admissão no mundo; persistência e comandos entram no incremento seguinte. */
export function montarLojaInicial(): CatalogoDaLoja {
  return {
    formato: "morada.loja",
    versao: 1,
    politicaDePrecos: POLITICA_DE_PRECOS,
    ofertas: OFERTAS_INICIAIS.map((oferta) => ({ ...oferta })),
  };
}
