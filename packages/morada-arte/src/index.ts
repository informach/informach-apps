export { CLIPES_DO_JOGO, type PedidoDeClipe, POSE_DOBRADA, POSTURAS } from "./animacao/jogo";
export { empacotar, type OpcoesDoEmpacotador, type Resultado } from "./empacotar";
export { ErroDeArte } from "./erros";
export { Biblioteca } from "./leitura/biblioteca";
export {
  ARQUIVO_DO_MANIFESTO,
  arquivosDoManifesto,
  type BibliotecaDoManifesto,
  type ClipeDoManifesto,
  FORMATO_DO_MANIFESTO,
  type Manifesto,
  ManifestoSchema,
  type PersonagemDoManifesto,
  SUFIXO_BROTLI,
  VERSAO_DO_MANIFESTO,
} from "./manifesto";
export { ElencoDeEntradaSchema, type Personagem, PersonagemSchema } from "./personagem/esquema";
export { EXPRESSOES_DO_JOGO, montarPersonagem } from "./personagem/montagem";
export { ELENCO_DA_PROVA } from "./personagem/prova";
export { personagemDoElenco, resolver } from "./personagem/resolucao";
export { ATRIBUTO_OSSOS_DOBRADO, ATRIBUTO_PESOS_DOBRADO } from "./saida/glb";
