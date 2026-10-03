/** Reviewed against the teaching/recovery family IDs and prompts, not assessment items.
 * Several families contain more than one concept; the links intentionally preserve that choice.
 * Generic method, verification and argumentation families keep the authored lesson route.
 */
const links: { families: string[]; tools: string[] }[] = [
  {
    families: [
      "precos:comparacao",
      "precos:learn:comparacao-unitaria",
      "precos:learn:preco-unitario",
      "precos:unitario",
    ],
    tools: ["L16.preco-unitario", "L16.unidade-comum"],
  },
  { families: ["precos:unidades"], tools: ["L16.unidade-comum", "L04.conversoes"] },
  { families: ["precos:learn:custo-de-uso"], tools: ["L16.custo-por-uso"] },
  {
    families: ["precos:learn:economia-total"],
    tools: ["L16.economia-por-quantidade"],
  },
  { families: ["precos:proporcao"], tools: ["L03.taxa-unitaria"] },
  {
    families: ["precos:learn:frete-no-total", "precos:total"],
    tools: ["L16.frete-perdas-e-condicoes"],
  },
  {
    families: ["precos:learn:leve-pague", "precos:promocao", "porcentagem-n2:learn:promocao"],
    tools: ["L16.leve-pague"],
  },
  {
    families: ["precos:learn:parcelas-e-total", "orcamento:parcelas"],
    tools: ["L17.entrada-e-parcelas"],
  },
  {
    families: ["precos:learn:quantidade-util"],
    tools: ["L16.frete-perdas-e-condicoes", "L16.quantidade-util-e-frequencia"],
  },
  {
    families: ["precos:objetivo", "precos:pacotes"],
    tools: ["L16.pacotes-sobras-e-total", "L16.frete-perdas-e-condicoes"],
  },
  { families: ["orcamento:juros-simples"], tools: ["L17.juros-simples"] },
  {
    families: ["orcamento:learn:ajuste-de-plano", "orcamento:learn:necessidade-e-desejo"],
    tools: ["L16.limites-e-prioridades", "L16.justificar-replanejamento"],
  },
  {
    families: ["orcamento:learn:imprevisto", "orcamento:learn:margem-de-seguranca"],
    tools: ["L16.imprevistos-e-margem", "L03.base-percentual"],
  },
  {
    families: ["orcamento:learn:limite-por-categoria", "orcamento:restricao", "orcamento:reserva"],
    tools: ["L16.categorias-sem-duplicar"],
  },
  {
    families: [
      "orcamento:learn:meta-e-prazo",
      "orcamento:learn:poupanca-regular",
      "orcamento:meta",
    ],
    tools: ["L16.meta-prazo-contribuicao"],
  },
  { families: ["orcamento:learn:saldo", "orcamento:saldo"], tools: ["L16.entradas-e-saidas"] },
  { families: ["orcamento:recorrencia"], tools: ["L16.periodos-e-condicoes"] },
  {
    families: ["contagem:complemento", "contagem:learn:casos-com-restricao"],
    tools: ["L12.casos-e-complementar", "L12.senhas-e-restricoes"],
  },
  { families: ["contagem:learn:caminhos-em-etapas"], tools: ["L12.produto-tres-etapas"] },
  {
    families: ["contagem:learn:contagem-por-complemento"],
    tools: ["L12.casos-e-complementar", "L13.eventos-complementares"],
  },
  {
    families: ["contagem:learn:inclusao-exclusao", "contagem:sobreposicao"],
    tools: ["L12.complementar-inclusao-exclusao"],
  },
  {
    families: ["contagem:learn:lista-sem-repetir", "contagem:restricao", "contagem:sem-repeticao"],
    tools: ["L12.algarismos-e-restricoes"],
  },
  {
    families: ["contagem:learn:pares-sem-ordem", "contagem:pares"],
    tools: ["L12.escolhas-sem-ordem", "L12.contagem-dupla"],
  },
  {
    families: [
      "contagem:learn:principio-multiplicativo",
      "contagem:produto",
      "contagem-inicial:learn:combinar",
    ],
    tools: ["L12.combinacoes-visuais", "L12.arvore-de-escolhas"],
  },
  { families: ["contagem:learn:subconjuntos-simples"], tools: ["L12.subconjuntos"] },
  { families: ["contagem:ordem"], tools: ["L12.permutacoes"] },
  {
    families: ["contagem:ordem-repetida"],
    tools: ["L12.anagramas-com-repeticao", "L07.enumerar-caminhos"],
  },
  { families: ["contagem:soma"], tools: ["L12.soma-ou-produto"] },
  {
    families: [
      "gavetas:capacidade",
      "gavetas:learn:garantia-de-tres",
      "gavetas:learn:minimo-para-cota",
      "gavetas:limiar",
    ],
    tools: ["L12.cota-nas-gavetas"],
  },
  {
    families: ["gavetas:contraexemplo", "gavetas:pares-complementares"],
    tools: ["L12.categorias-e-repeticao", "L12.possivel-ou-garantido"],
  },
  {
    families: [
      "gavetas:distribuicao",
      "gavetas:learn:distribuicao-equilibrada",
      "gavetas:learn:garantia-simples",
      "gavetas:learn:teto-da-media",
      "gavetas:paridade",
    ],
    tools: ["L12.teto-media", "L12.pior-caso"],
  },
  {
    families: ["gavetas:learn:classes-de-resto", "gavetas:restos"],
    tools: ["L10.classes-de-resto", "L12.categorias-e-repeticao"],
  },
  {
    families: [
      "gavetas:learn:garantia-de-par",
      "gavetas:learn:limite-sem-repeticao",
      "gavetas:repeticao",
    ],
    tools: ["L12.primeira-repeticao"],
  },
  {
    families: [
      "probabilidade:com-reposicao",
      "probabilidade:independencia",
      "probabilidade:learn:duas-etapas",
    ],
    tools: ["L13.reposicao-e-ordem"],
  },
  {
    families: ["probabilidade:comparacao", "probabilidade:learn:comparacao-de-chances"],
    tools: ["L13.comparar-chances"],
  },
  {
    families: ["probabilidade:complemento", "probabilidade:learn:complemento"],
    tools: ["L13.eventos-complementares"],
  },
  {
    families: [
      "probabilidade:evento",
      "probabilidade:extremos",
      "probabilidade:learn:casos-equiprovaveis",
      "probabilidade:razao",
    ],
    tools: ["L13.favoraveis-e-possiveis"],
  },
  {
    families: ["probabilidade:learn:espaco-amostral", "probabilidade:produto"],
    tools: ["L13.espaco-amostral", "L12.produto", "L13.cartas-eventos-condicionais"],
  },
  {
    families: ["probabilidade:learn:frequencia-e-modelo"],
    tools: ["L13.frequencia-relativa", "L13.frequencia-e-teoria"],
  },
  {
    families: ["probabilidade:learn:sem-reposicao", "probabilidade:sem-reposicao"],
    tools: ["L13.condicional-arvore-tabela"],
  },
  {
    families: ["probabilidade:learn:valor-esperado-contagem"],
    tools: ["L13.ocorrencias-esperadas"],
  },
  {
    families: [
      "logica:contraexemplo",
      "logica:learn:contraexemplo",
      "logica-n2:learn:contraexemplo",
    ],
    tools: ["L15.contraexemplos-primos"],
  },
  {
    families: ["logica:contraposicao", "logica:learn:conversa-invalida"],
    tools: ["L15.implicacao-reciproca-contrapositiva"],
  },
  {
    families: ["logica:exclusao", "logica:learn:contradicao", "logica:learn:verdadeiros-e-falsos"],
    tools: ["L15.tabela-logica"],
  },
  { families: ["logica:generalizacao"], tools: ["L10.paridade", "L15.provas"] },
  { families: ["logica:implicacao", "logica:learn:implicacao"], tools: ["L15.implicacoes"] },
  {
    families: ["logica:learn:eliminacao", "logica:restricoes"],
    tools: ["L15.pistas-e-eliminacao"],
  },
  {
    families: [
      "logica:learn:negacao",
      "logica-n2:learn:negacao",
      "logica-n2:learn:quantificadores",
      "logica-em:learn:quantificadores",
    ],
    tools: ["L15.quantificadores", "L15.quantificadores-negacao"],
  },
  {
    families: [
      "logica:learn:posicoes-com-restricoes",
      "logica:ordem",
      "problemas-com-desenho:learn:ordenar",
    ],
    tools: ["L15.pistas-com-desenho"],
  },
  { families: ["logica:prova"], tools: ["L15.conjectura-ou-teorema"] },
  {
    families: [
      "contagem-casos:learn:algarismos-distintos",
      "contagem-casos:learn:casos-com-sobreposicao",
      "contagem-casos:learn:contagem-com-restricao",
      "contagem-casos:learn:listar-casos",
    ],
    tools: ["L12.algarismos-e-restricoes"],
  },
  {
    families: ["contagem-casos:learn:anagramas", "contagem-casos:learn:permutacao-simples"],
    tools: ["L12.permutacoes"],
  },
  { families: ["contagem-casos:learn:arranjo"], tools: ["L12.arranjo-combinacao"] },
  { families: ["contagem-casos:learn:bloco-junto"], tools: ["L12.filas-com-bloco"] },
  {
    families: ["contagem-casos:learn:caminhos-na-malha"],
    tools: ["L07.enumerar-caminhos", "L12.anagramas-com-repeticao"],
  },
  {
    families: ["contagem-casos:learn:combinacao-de-tres", "contagem-casos:learn:pares-sem-ordem"],
    tools: ["L12.escolhas-sem-ordem"],
  },
  {
    families: ["contagem-casos:learn:complementar"],
    tools: ["L12.complementar-inclusao-exclusao"],
  },
  { families: ["contagem-casos:learn:divisores"], tools: ["L10.primos-divisores"] },
  { families: ["contagem-casos:learn:mesa-redonda"], tools: ["L12.mesa-redonda"] },
  { families: ["contagem-casos:learn:objetos-identicos"], tools: ["L12.repeticoes-distribuicoes"] },
  { families: ["contagem-casos:learn:principio-multiplicativo"], tools: ["L12.produto"] },
  {
    families: ["invariantes:learn:contagem-dupla"],
    tools: ["L12.relacoes-contagem-dupla", "L12.contagem-dupla"],
  },
  { families: ["invariantes:learn:diferenca-invariante"], tools: ["L15.processo-diferenca"] },
  {
    families: ["invariantes:learn:paridade-invariante"],
    tools: ["L15.processo-copos", "L15.processo-bolas", "L10.invariante"],
  },
  {
    families: ["invariantes:learn:soma-invariante"],
    tools: ["L15.processo-soma", "L10.invariante"],
  },
  {
    families: ["invariantes:learn:argumento-completo"],
    tools: [
      "L15.processo-sinais",
      "L15.processo-camaleoes",
      "L15.processo-diferenca-absoluta",
      "L10.invariantes",
      "L12.teto-media",
    ],
  },
  { families: ["logica-n2:learn:encadear-implicacoes"], tools: ["L15.encadear-implicacoes"] },
  {
    families: ["logica-n2:learn:tabela-logica", "logica-em:learn:deducao"],
    tools: ["L15.associacoes-por-pistas"],
  },
  {
    families: ["logica-n2:learn:verdade-e-mentira", "logica-em:learn:verdade-mentira"],
    tools: ["L15.auto-referencia"],
  },
  {
    families: ["porcentagem-n2:learn:comparar-ofertas"],
    tools: ["L03.aumento-e-desconto", "L16.ofertas"],
  },
  {
    families: ["porcentagem-n2:learn:ler-percentual-em-tabela"],
    tools: ["L14.percentuais-em-dados", "L14.totais-diferencas"],
  },
  {
    families: [
      "juros:learn:comparar-formas-de-pagamento",
      "juros:learn:custo-do-parcelamento",
      "juros:learn:entrada-e-parcelas",
      "juros:learn:juros-embutidos",
    ],
    tools: ["L17.entrada-e-parcelas", "L17.comparar-creditos"],
  },
  {
    families: ["juros:learn:divida-versus-poupanca"],
    tools: ["L16.meta-prazo-contribuicao", "L17.divida-versus-poupar"],
  },
  {
    families: ["juros:learn:juros-compostos", "juros:learn:rotativo-do-cartao"],
    tools: ["L17.juros-compostos"],
  },
  {
    families: ["juros:learn:juros-simples", "juros:learn:montante", "juros:learn:taxa"],
    tools: ["L17.juros-simples"],
  },
  { families: ["juros:learn:simples-versus-compostos"], tools: ["L17.linear-exponencial"] },
  {
    families: [
      "orcamento-n2:learn:analise-de-orcamento",
      "orcamento-n2:learn:saldo",
      "orcamento-n2:learn:restricao-de-orcamento",
    ],
    tools: ["L16.receitas-despesas-saldo"],
  },
  { families: ["orcamento-n2:learn:comparar-alternativas"], tools: ["L16.passe-ou-avulso"] },
  { families: ["orcamento-n2:learn:custo-de-oportunidade"], tools: ["L16.custo-oportunidade"] },
  { families: ["orcamento-n2:learn:fixo-e-variavel"], tools: ["L16.categorias-sem-duplicar"] },
  {
    families: ["orcamento-n2:learn:meta", "orcamento-n2:learn:reserva-de-emergencia"],
    tools: ["L16.metas-e-imprevistos"],
  },
  {
    families: ["orcamento-n2:learn:porcentagem-do-orcamento"],
    tools: ["L16.receitas-despesas-saldo", "L03.base-percentual"],
  },
  { families: ["orcamento-n2:learn:prioridade"], tools: ["L16.limites-e-prioridades"] },
  { families: ["inflacao:learn:acumulado"], tools: ["L17.oscilacao-perdas"] },
  { families: ["inflacao:learn:cesta-com-pesos"], tools: ["L17.indice-ponderado"] },
  {
    families: ["inflacao:learn:conceito", "inflacao:learn:poder-de-compra"],
    tools: ["L17.cesta-e-poder-compra", "L17.nominal-real"],
  },
  {
    families: ["inflacao:learn:corrigir-valores", "inflacao:learn:reajuste"],
    tools: ["L17.valores-no-tempo", "L03.aumento-e-desconto"],
  },
  {
    families: ["inflacao:learn:decisao", "inflacao:learn:ganho-real"],
    tools: ["L17.nominal-real"],
  },
  { families: ["inflacao:learn:indice"], tools: ["L17.preco-retorno"] },
  { families: ["inflacao:learn:ler-grafico"], tools: ["L17.valores-no-tempo", "L14.graficos"] },
  { families: ["investimentos:learn:aportes"], tools: ["L17.crescimento-e-aportes"] },
  {
    families: ["investimentos:learn:carteira", "investimentos:learn:diversificacao"],
    tools: ["L17.pesos-carteira", "L17.diversificacao"],
  },
  {
    families: ["investimentos:learn:conceito", "investimentos:learn:rendimento"],
    tools: ["L17.rendimento-e-premissas"],
  },
  { families: ["investimentos:learn:crescimento"], tools: ["L17.juros-compostos"] },
  { families: ["investimentos:learn:decisao"], tools: ["L17.objetivos-custos-cenarios"] },
  {
    families: ["investimentos:learn:liquidez", "investimentos:learn:risco-retorno"],
    tools: ["L17.risco-liquidez-prazo", "L17.cenarios-carteira"],
  },
  { families: ["tabelas:learn:barras"], tools: ["L14.tabela-barras"] },
  { families: ["tabelas:learn:completar"], tools: ["L14.completar-valores"] },
  { families: ["tabelas:learn:localizar"], tools: ["L14.linha-coluna"] },
  {
    families: ["tabelas:learn:responder", "tabelas:learn:totais"],
    tools: ["L14.totais-diferencas"],
  },
  { families: ["combinacoes:learn:combinacao"], tools: ["L12.escolhas-sem-ordem"] },
  {
    families: ["combinacoes:learn:complementar", "combinacoes:learn:multiplicativo"],
    tools: ["L12.senhas-e-restricoes"],
  },
  { families: ["combinacoes:learn:estrategia"], tools: ["L12.algarismos-e-restricoes"] },
  { families: ["combinacoes:learn:repeticao"], tools: ["L12.anagramas-com-repeticao"] },
  {
    families: ["probabilidade-em:learn:condicional"],
    tools: ["L13.dados-condicional", "L13.cartas-eventos-condicionais"],
  },
  { families: ["probabilidade-em:learn:contagem"], tools: ["L13.contagem-combinatoria"] },
  { families: ["probabilidade-em:learn:decidir"], tools: ["L13.valor-esperado-e-risco"] },
  { families: ["probabilidade-em:learn:equiprovavel"], tools: ["L13.dados-somas"] },
  { families: ["probabilidade-em:learn:regras"], tools: ["L13.uniao-complemento-independencia"] },
  { families: ["argumentacao-em:learn:casos-absurdo"], tools: ["L15.argumento-completo"] },
  {
    families: ["argumentacao-em:learn:escrever"],
    tools: ["L15.implicacao-reciproca-contrapositiva", "L15.escrever-prova"],
  },
  { families: ["argumentacao-em:learn:gavetas"], tools: ["L12.cota-nas-gavetas"] },
  {
    families: ["argumentacao-em:learn:implicacao"],
    tools: ["L15.implicacao-reciproca-contrapositiva"],
  },
  { families: ["argumentacao-em:learn:ler-solucao"], tools: ["L15.revisar-prova"] },
  {
    families: ["inducao:learn:estrutura"],
    tools: ["L15.inducao", "L15.inducao-somas-desigualdades"],
  },
  { families: ["inducao:learn:somas"], tools: ["L15.inducao-quadrados"] },
  { families: ["logica-em:learn:conectivos"], tools: ["L15.conectivos-basicos"] },
  { families: ["logica-em:learn:validade"], tools: ["L15.validade-falacias"] },
  {
    families: ["modelos-financeiros:learn:comparar"],
    tools: ["L17.ponto-equilibrio", "L11.intersecoes-sistemas"],
  },
  {
    families: ["modelos-financeiros:learn:decidir", "cenarios:learn:sensibilidade"],
    tools: ["L16.meta-prazo-contribuicao"],
  },
  { families: ["modelos-financeiros:learn:equivalentes"], tools: ["L17.taxas-equivalentes"] },
  { families: ["modelos-financeiros:learn:linear-exponencial"], tools: ["L17.linear-exponencial"] },
  {
    families: ["modelos-financeiros:learn:parametros"],
    tools: ["L17.crescimento-e-aportes", "L11.afim"],
  },
  {
    families: ["equivalencia-temporal:learn:antecipar"],
    tools: ["L03.aumento-e-desconto", "L17.juros-compostos"],
  },
  {
    families: ["equivalencia-temporal:learn:decidir"],
    tools: ["L17.comparar-premissas", "L17.divida-versus-poupar"],
  },
  { families: ["equivalencia-temporal:learn:fluxos"], tools: ["L17.fluxos-em-datas"] },
  {
    families: ["equivalencia-temporal:learn:parcelas"],
    tools: ["L17.entrada-e-parcelas", "L17.valor-presente-parcelas"],
  },
  {
    families: ["equivalencia-temporal:learn:presente-futuro"],
    tools: ["L17.presente-futuro", "L17.juros-compostos"],
  },
  { families: ["renda-fixa:learn:credito"], tools: ["L17.credito-garantias"] },
  { families: ["renda-fixa:learn:escolher"], tools: ["L17.comparar-objetivos"] },
  { families: ["renda-fixa:learn:liquidez"], tools: ["L17.prazo-carencia-liquidez"] },
  { families: ["renda-fixa:learn:liquido"], tools: ["L17.impostos-taxas-liquido"] },
  {
    families: ["renda-fixa:learn:remuneracao"],
    tools: ["L17.prefixado-posfixado-inflacao", "L17.juros-compostos"],
  },
  { families: ["renda-variavel:learn:carteira"], tools: ["L17.pesos-carteira"] },
  { families: ["renda-variavel:learn:cenarios-rv"], tools: ["L17.cenarios-carteira"] },
  { families: ["renda-variavel:learn:oscilacao"], tools: ["L17.oscilacao-perdas"] },
  { families: ["renda-variavel:learn:passado"], tools: ["L17.medias-e-passado"] },
  { families: ["renda-variavel:learn:variacao"], tools: ["L17.preco-retorno"] },
  {
    families: ["cenarios:learn:alternativas"],
    tools: ["L17.entrada-e-parcelas", "L17.multiplos-criterios"],
  },
  { families: ["cenarios:learn:concluir"], tools: ["L17.conclusao-condicional"] },
  { families: ["cenarios:learn:premissas"], tools: ["L17.dados-premissas-faltantes"] },
  {
    families: ["cenarios:learn:tres-cenarios"],
    tools: ["L03.aumento-e-desconto", "L17.tres-cenarios"],
  },
  {
    families: ["medir-e-comparar:learn:dinheiro"],
    tools: ["L16.moedas-preco-troco"],
  },
  {
    families: ["problemas-com-desenho:learn:explicar"],
    tools: ["L01.juntar-tirar", "L16.moedas-preco-troco"],
  },
];

export const reasoningConceptLinks: Record<string, string[]> = Object.fromEntries(
  links.flatMap(({ families, tools }) => families.map((family) => [family, tools])),
);
