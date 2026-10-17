import type { EdiToolId } from "@informach/config/edi-tools";
import { OFFLINE_HOURS } from "../../lib/desktop-limits";

/** Sales copy for each tool. Only features present in the current editors, with their limits. */
export type ToolFeature = {
  tool: EdiToolId;
  anchor: string;
  title: { before: string; highlight: string; after: string };
  body: string;
  bullets: readonly string[];
  limits?: string;
};

export const TOOL_FEATURES: readonly ToolFeature[] = [
  {
    tool: "ediaula",
    anchor: "aula",
    title: { before: "Edite a aula como quem ", highlight: "edita um texto", after: "." },
    body: "Grave a tela com câmera, microfone e o roteiro no teleprompter. Depois, o EdiAula transcreve a sua fala no próprio computador. Apague uma palavra no texto e o corte acontece no vídeo, em todas as faixas, sem perder a sincronia.",
    bullets: [
      "Limpa “né”, “tipo” e silêncios longos de uma vez e mostra quanto tempo você ganhou",
      "Zoom automático nos cliques e cursor com destaque, sem animar quadro a quadro",
      "Vídeos em 4K ganham uma cópia leve para editar sem travar",
      "Exporta MP4 com legendas .srt e .vtt, miniatura e áudio no volume das plataformas",
    ],
    limits:
      "A fila de exportação vale para a sessão: deixe o EdiAula aberto até terminar. A gravação rápida pela placa de vídeo pede uma GPU NVIDIA.",
  },
  {
    tool: "edicaptura",
    anchor: "captura",
    title: { before: "O print que já chega ", highlight: "explicado", after: "." },
    body: "Aperte Print Screen, ajuste a região e anote ali mesmo. Setas, textos e passos numerados deixam qualquer tutorial claro na primeira leitura.",
    bullets: [
      "Região, monitor inteiro, vídeo curto ou página longa com rolagem",
      "Setas, texto, retângulos, marca-texto, caneta e passos numerados",
      "Pixelize e-mails e dados antes de compartilhar",
      "Copie e cole direto, ou exporte PNG e JPEG. O projeto continua editável",
    ],
    limits: "Vídeos sem áudio e com até 5 minutos. A rolagem é vertical e feita por você.",
  },
  {
    tool: "edifoto",
    anchor: "foto",
    title: { before: "Camadas de verdade para a ", highlight: "capa do curso", after: "." },
    body: "Ajustes que não estragam o original, máscaras, texto e os 27 modos de mesclagem que você já conhece, com prévia ao passar o mouse.",
    bullets: [
      "Exposição, contraste, temperatura e níveis em camadas de ajuste",
      "Tira o fundo verde ou azul e mantém a resolução da foto",
      "Peça à IA: ela olha a imagem, compara mesclagens e edita em camadas",
      "Exporta PNG, JPEG e WebP",
    ],
  },
  {
    tool: "edipdf",
    anchor: "pdf",
    title: { before: "O PDF do dia a dia, ", highlight: "resolvido sem drama", after: "." },
    body: "Junte arquivos, reordene páginas arrastando, preencha formulários e assine. O texto continua selecionável e os campos continuam campos.",
    bullets: [
      "Junte PDFs e fotos num arquivo só, na ordem que você escolher",
      "Corrija uma linha de texto do próprio PDF",
      "Assine desenhando, digitando ou com a foto da sua assinatura",
      "Compacte em três níveis. O arquivo nunca fica maior que o original",
    ],
    limits:
      "Ainda não faz OCR nem aplica senha. Fontes especiais do arquivo são aproximadas na edição de texto.",
  },
  {
    tool: "edisvg",
    anchor: "svg",
    title: { before: "Dê movimento ao seu ", highlight: "mascote", after: "." },
    body: "Importe um SVG, organize em camadas e grupos, escolha o movimento na timeline e exporte uma animação leve que roda em qualquer página.",
    bullets: [
      "Importação segura de SVG, com camadas, grupos e caneta",
      "Timeline com reprodução, marcadores e estados",
      "Exporta SVG animado e HTML independente",
    ],
    limits:
      "As animações usam movimentos prontos. Deformação de malha, ossos e exportação Lottie ainda não existem.",
  },
];

export const JOURNEY: readonly { tool: EdiToolId; title: string; body: string }[] = [
  {
    tool: "ediaula",
    title: "Grave a aula",
    body: "Tela, câmera e microfone, com o roteiro no teleprompter.",
  },
  {
    tool: "edicaptura",
    title: "Explique com prints",
    body: "Passo a passo anotado para o material de apoio.",
  },
  { tool: "edifoto", title: "Crie a capa", body: "Miniatura do vídeo e imagens do curso." },
  { tool: "edipdf", title: "Entregue a apostila", body: "Junte, organize, compacte e envie." },
  { tool: "edisvg", title: "Anime o mascote", body: "Uma vinheta leve para a abertura." },
];

export const FAQ: readonly { question: string; answer: string }[] = [
  {
    question: "Funciona no Mac ou no Linux?",
    answer: "Ainda não. A Suíte Edi é feita para Windows 64 bits.",
  },
  {
    question: "Posso usar em mais de um computador?",
    answer:
      "Sim, em até dois ao mesmo tempo. A suíte inteira conta como uma conexão por computador. Para trocar de máquina, desconecte uma delas em Minha conta.",
  },
  {
    question: "Preciso estar conectado à internet?",
    answer: `Só para conectar o computador e para renovar o acesso de vez em quando. Depois disso, as ferramentas funcionam por até ${OFFLINE_HOURS} horas sem rede.`,
  },
  {
    question: "A IA está incluída na assinatura?",
    answer:
      "Não. As ferramentas usam a sua conta do Claude ou do ChatGPT, ou uma chave própria da Anthropic. O consumo é cobrado por eles, não pela Edi.",
  },
  {
    question: "O que acontece com meus arquivos se eu cancelar?",
    answer: "Nada é apagado. Seus projetos e tudo o que você exportou continuam no seu computador.",
  },
  {
    question: "Como eu cancelo?",
    answer:
      "Em Minha conta, na opção Faturas, cartão e cancelamento. O acesso continua até o fim do período já pago.",
  },
];
