import { z } from "zod";
export const EDITOR_GUIDE =
  "Você é o assistente do EdiSVG. Responda em português. Use get_overview antes de editar. As transformações são globais no mascote; não prometa IK, malha ou edição individual. Chaves são marcadores e não interpolam propriedades. Use somente as ferramentas do EdiSVG para editar. Não execute comandos, não acesse arquivos ou a web. As alterações são reversíveis com undo. Não diga que salvou um arquivo se apenas modificou o projeto na memória.";
export const AI_TOOLS = {
  get_overview: {
    description: "Inspeciona o projeto aberto, seleção, animação, transformações e capacidades.",
    input: z.object({}).strict(),
  },
  set_transform: {
    description: "Ajusta a transformação global do mascote.",
    input: z
      .object({
        x: z.number().min(-10000).max(10000).optional(),
        y: z.number().min(-10000).max(10000).optional(),
        rotation: z.number().min(-3600).max(3600).optional(),
        opacity: z.number().min(0).max(100).optional(),
        sx: z.number().min(0.01).max(20).optional(),
        sy: z.number().min(0.01).max(20).optional(),
      })
      .strict(),
  },
  set_animation: {
    description: "Seleciona uma das animações predefinidas.",
    input: z.object({ name: z.enum(["Parado", "Acenar", "Pular"]) }).strict(),
  },
  rename_project: {
    description: "Altera o nome do mascote/projeto.",
    input: z.object({ name: z.string().min(1).max(120) }).strict(),
  },
  seek_frame: {
    description: "Posiciona o cursor em um quadro da animação atual.",
    input: z.object({ frame: z.number().int().min(0).max(120) }).strict(),
  },
  add_keyframe: {
    description: "Adiciona um marcador de chave, sem interpolação independente.",
    input: z.object({ frame: z.number().int().min(0).max(120) }).strict(),
  },
  undo: {
    description:
      "Desfaz a última edição do projeto, manual ou feita pela IA. Não é restrito à última ação do assistente.",
    input: z.object({}).strict(),
  },
  redo: {
    description: "Refaz a última edição desfeita no histórico compartilhado do projeto.",
    input: z.object({}).strict(),
  },
};
