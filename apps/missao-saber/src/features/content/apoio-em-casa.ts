/**
 * Apoio em casa, por habilidade.
 *
 * Duas conversas curtas que o responsável pode puxar sem tela, ligadas à
 * habilidade que o estudante está construindo. Existe porque o relato da
 * semana responde "o que ele aprendeu" e "qual é o próximo passo", mas não
 * respondia "e eu, o que faço com isso?".
 *
 * Regras de autoria: nada exige material comprado, nenhuma frase transforma o
 * responsável em fiscal de pontos, e nenhuma delas pede que ele ensine o
 * conteúdo. O verbo é sempre perguntar, comparar ou prever em voz alta —
 * é a única melhoria do produto que aumenta o aprendizado reduzindo tela.
 */
import { skillPacks } from "./skills";
export const homeSupport: Readonly<Record<string, readonly [string, string]>> = {
  fracoes: [
    "Na cozinha, peça para dividir uma receita pela metade em voz alta, dizendo o que acontece com cada ingrediente.",
    "Corte uma fruta em partes iguais e pergunte quantas partes já passam da metade.",
  ],
  porcentagem: [
    "Diante de uma etiqueta de desconto, pergunte sobre qual valor o desconto foi calculado antes de conferirem o preço final.",
    "Peça uma estimativa de 10% de uma conta da casa e confiram juntos depois.",
  ],
  precos: [
    "No mercado, compare dois tamanhos do mesmo produto e peça o preço por unidade antes de escolherem.",
    "Escolham entre uma embalagem grande e duas pequenas, pedindo o motivo da escolha em voz alta.",
  ],
  orcamento: [
    "Combinem uma meta pequena e peça o cálculo de quantas semanas faltam guardando um valor fixo.",
    "Antes de uma compra, peça a lista do que é necessário e do que é desejo, em colunas separadas.",
  ],
  medidas: [
    "Meçam um tapete com passos e pergunte o que muda no contorno e o que muda no espaço coberto.",
    "Peça duas figuras montadas com a mesma quantidade de peças e contornos diferentes.",
  ],
  simetria: [
    "Dobre uma folha, faça um recorte e peça uma previsão do desenho antes de abrir.",
    "Procurem simetria em um azulejo, em uma fachada ou em uma folha do quintal.",
  ],
  contagem: [
    "Peça todas as combinações de duas camisetas com três calças, sem repetir nenhuma.",
    "Pergunte de quantas formas três pessoas podem se sentar em um sofá de três lugares.",
  ],
  gavetas: [
    "Com meias de três cores na gaveta, pergunte quantas é preciso pegar no escuro para garantir um par igual.",
    "Pergunte quantas pessoas em uma sala garantem que duas nasceram no mesmo mês.",
  ],
  probabilidade: [
    "Antes de jogar um dado dez vezes, peça uma previsão e comparem com o que aconteceu.",
    "Pergunte se a previsão mudaria com cem lançamentos, e por quê.",
  ],
  paridade: [
    "Distribuam pratos em duas filas iguais e pergunte quando sobra um.",
    "Contem de três em três até um número combinado e pergunte que resto sobrou.",
  ],
  padroes: [
    "Monte uma sequência com talheres e peça a peça seguinte junto com a regra em uma frase.",
    "Pergunte qual seria a décima peça da sequência sem montar todas.",
  ],
  logica: [
    "Faça uma afirmação sobre o dia e peça um exemplo que a contrarie.",
    "Peça a explicação de por que uma conclusão vale, não apenas qual é a resposta.",
  ],
};

export function homeSupportFor(skillId: string) {
  return homeSupport[skillId] ?? skillPacks.find((pack) => pack.id === skillId)?.homeSupport;
}
