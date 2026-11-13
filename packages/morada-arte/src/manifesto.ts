import { z } from "zod";

/**
 * O manifesto dos pacotes de arte (`manifest.json`): o que o cliente do jogo lê
 * para saber quais arquivos existem, de quem são e como usá-los. Este módulo
 * não importa nada do empacotador (só o Zod): o cliente pode importar o tipo
 * e o esquema sem trazer o resto.
 */

export const FORMATO_DO_MANIFESTO = "morada-arte";
export const VERSAO_DO_MANIFESTO = 2;

/** O nome do manifesto na pasta dos pacotes. */
export const ARQUIVO_DO_MANIFESTO = "manifest.json";

/**
 * Ao lado de cada arquivo, o empacotador grava uma cópia comprimida em brotli
 * com este sufixo (`lia.0123456789.glb.br`), que o servidor entrega a quem aceita.
 */
export const SUFIXO_BROTLI = ".br";

const ponto = z.tuple([z.number(), z.number(), z.number()]);
const arquivo = z.string().regex(/^[a-z0-9_-]+\.[0-9a-f]{10}\.glb$/, "nome com hash do conteúdo");
const inteiro = z.number().int().nonnegative();

export const ExpressaoSchema = z.strictObject({
  /** `neutro`, `feliz`, `triste`, `bravo`, `dormindo`, `chorando`, `surpreso`. */
  nome: z.string().min(1),
  /** Nome do nó da malha deste rosto no GLB; só um rosto fica visível por vez. */
  no: z.string().min(1),
  /** Formas de fala deste rosto (`fala_X`, `fala_M`, `fala_A`, `fala_E`, `fala_I`, `fala_O`, `fala_F`), ou vazio. */
  fala: z.array(z.string()),
});

export const PersonagemDoManifestoSchema = z.strictObject({
  id: z.string().min(1),
  nome: z.string().min(1),
  arquivo,
  bytes: inteiro,
  /** Corpo da biblioteca de arte de que o pacote foi feito. */
  corpo: z.string().min(1),
  sexo: z.enum(["m", "f"]),
  /** Faixa de idade do corpo na biblioteca (`recem`, `colo`, `pequeno`, `crianca`, `adolescente`, `adulto`, `idoso`). */
  faixa: z.string().min(1),
  /** Altura de pé, em metros (a caixa do corpo na pose de descanso). */
  altura: z.number().positive(),
  /** Id da biblioteca de animação deste esqueleto; `null` em quem não tem animações (o recém-nascido). */
  biblioteca: z.string().nullable(),
  /** Biblioteca para o 2º e o 3º trimestres de gravidez, se o corpo engravida. */
  bibliotecaDeGravida: z.string().nullable(),
  /** Nó da malha do corpo (pele, roupas e cabelo), sempre visível. */
  noDoCorpo: z.string().min(1),
  /** Nó da chupeta, que o cliente pode esconder; `null` em quem não tem. */
  noDaChupeta: z.string().nullable(),
  /** A primeira é a que aparece ao carregar. */
  expressoes: z.array(ExpressaoSchema).min(1),
  /**
   * Formas de gravidez da malha do corpo, na ordem dos estágios (`gravidez_1..3`),
   * ou vazio. Cada estágio é uma forma inteira: para ir de um ao outro, o peso
   * de um desce enquanto o do seguinte sobe.
   */
  gravidez: z.array(z.string()),
  /**
   * A malha do corpo traz os atributos `_JOINTS_DOBRADO` e `_WEIGHTS_DOBRADO`:
   * os pesos que a saia usa quando o corpo senta, deita ou agacha.
   */
  pesosDobrado: z.boolean(),
  ancoras: z.strictObject({
    /** Onde fica um bebê que este corpo carrega, no referencial da raiz, em metros. */
    colo: ponto,
    /** `true` quando o colo foi medido no clipe de segurar bebê; `false` quando é uma proporção da altura. */
    coloMedido: z.boolean(),
    /** Centro da cabeça (o osso `Head`) na pose de descanso. */
    cabeca: ponto,
    /** Ossos em que um objeto de mão fica preso, e onde estão na pose de descanso. */
    maos: z.strictObject({
      esq: z.strictObject({ osso: z.string(), posicao: ponto }),
      dir: z.strictObject({ osso: z.string(), posicao: ponto }),
    }),
  }),
  desenho: z.strictObject({
    /** Chamadas de desenho com um rosto visível (e a chupeta, se houver). */
    chamadas: inteiro,
    /** Triângulos desenhados com o rosto neutro. */
    triangulos: inteiro,
    vertices: inteiro,
    texturas: inteiro,
  }),
  /** A aparência do morador na simulação para a qual o pacote foi feito, quando há. */
  sim: z
    .strictObject({ corpo: z.string(), pele: inteiro, cabelo: z.string(), roupa: z.string() })
    .nullable(),
});

export const ClipeDoManifestoSchema = z.strictObject({
  /** Nome da animação dentro do GLB (o id da biblioteca de arte). */
  nome: z.string().min(1),
  /** Duração em segundos. */
  duracao: z.number().nonnegative(),
  /** Termina onde começa: pode repetir. */
  ciclo: z.boolean(),
  /** Clipe com deslocamento no quadril (`.rm`): o corpo anda dentro do clipe. */
  deslocamento: z.boolean(),
  /** Pose dobrada (sentado, deitado, agachado, ajoelhado): usar os pesos dobrados da saia. */
  dobrada: z.boolean(),
  /** O que o clipe espera na cena (`info.json`, coordenadas do Blender: x, y no chão, alturas em z), quando há. */
  apoio: z.record(z.string(), z.unknown()).nullable(),
});

export const BibliotecaDoManifestoSchema = z.strictObject({
  /** Id da biblioteca: o esqueleto de origem (`adulto`, `idoso`, `crianca_m`, `bebe_m`, `adulta_gravida`). */
  id: z.string().min(1),
  arquivo,
  bytes: inteiro,
  /** Fase dos moradores que usam esta biblioteca. */
  faixa: z.string().min(1),
  gravida: z.boolean(),
  clipes: z.array(ClipeDoManifestoSchema),
  /** Clipe de cada postura básica da cena, ou `null` se a biblioteca não tem. */
  posturas: z.record(z.string(), z.string().nullable()),
  /**
   * Para cada nome de animação que o jogo pede: o clipe que toca. `substituto`
   * diz que a biblioteca não tem o gesto pedido e este é o mais próximo;
   * `clipe: null`, que não há nada parecido.
   */
  interacoes: z.record(
    z.string(),
    z.strictObject({ clipe: z.string().nullable(), substituto: z.boolean() }),
  ),
});

const desenho = z.strictObject({
  chamadas: inteiro,
  triangulos: inteiro,
  vertices: inteiro,
  texturas: inteiro,
});

/** Limites medidos no GLB, em metros no referencial do objeto. */
export const ObjetoDoManifestoSchema = z.strictObject({
  id: z.string().min(1),
  versao: z.number().int().positive(),
  arquivo,
  bytes: inteiro,
  limites: z.tuple([ponto, ponto]),
  /** Alturas das superfícies de uso, em metros, por id do ponto da simulação. */
  apoios: z.record(z.string(), z.number().nonnegative()),
  desenho,
});

export const AcabamentoDoManifestoSchema = z.strictObject({
  id: z.string().min(1),
  arquivo: z.string().regex(/^[a-z0-9_-]+\.[0-9a-f]{10}\.png$/),
  bytes: inteiro,
  /** Tamanho de uma repetição em metros (piso 2 m, parede 3 m). */
  escala: z.number().positive(),
});

export const AberturaDoManifestoSchema = z.strictObject({
  id: z.string().min(1),
  tipo: z.enum(["porta", "janela"]),
  largura: z.number().positive(),
  altura: z.number().positive(),
  peitoril: z.number().nonnegative(),
  arquivo,
  bytes: inteiro,
  desenho,
});

const campos = {
  formato: z.literal(FORMATO_DO_MANIFESTO),
  arte: z.strictObject({
    repositorio: z.string().min(1),
    /** Commit do repositório de arte de que os pacotes saíram. */
    commit: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .nullable(),
  }),
  personagens: z.array(PersonagemDoManifestoSchema),
  bibliotecas: z.array(BibliotecaDoManifestoSchema),
};

/** V1 continua legível; só os novos empacotamentos emitem V2. */
export const ManifestoSchema = z.discriminatedUnion("versao", [
  z.strictObject({ ...campos, versao: z.literal(1) }),
  z.strictObject({
    ...campos,
    versao: z.literal(2),
    objetos: z.array(ObjetoDoManifestoSchema),
    acabamentos: z.array(AcabamentoDoManifestoSchema),
    aberturas: z.array(AberturaDoManifestoSchema),
  }),
]);

export type Manifesto = z.infer<typeof ManifestoSchema>;
export type PersonagemDoManifesto = z.infer<typeof PersonagemDoManifestoSchema>;
export type BibliotecaDoManifesto = z.infer<typeof BibliotecaDoManifestoSchema>;
export type ClipeDoManifesto = z.infer<typeof ClipeDoManifestoSchema>;
export type ObjetoDoManifesto = z.infer<typeof ObjetoDoManifestoSchema>;
export type AcabamentoDoManifesto = z.infer<typeof AcabamentoDoManifestoSchema>;
export type AberturaDoManifesto = z.infer<typeof AberturaDoManifestoSchema>;

/**
 * Todos os arquivos que um manifesto cita, mais ele mesmo: é a lista inteira
 * do que pode ser servido. Nenhum outro nome da pasta é entregue.
 */
export function arquivosDoManifesto(manifesto: Manifesto): string[] {
  return [
    ...new Set([
      ARQUIVO_DO_MANIFESTO,
      ...manifesto.personagens.map((p) => p.arquivo),
      ...manifesto.bibliotecas.map((b) => b.arquivo),
      ...(manifesto.versao === 2
        ? [...manifesto.objetos, ...manifesto.acabamentos, ...manifesto.aberturas].map(
            (x) => x.arquivo,
          )
        : []),
    ]),
  ];
}
