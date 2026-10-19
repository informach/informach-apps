import { z } from "zod";

/**
 * The Captura's optional assistant (phase 8), on the person's own Claude Code or Codex
 * subscription. It is not a chat: the person starts one delimited task, reviews exactly what
 * leaves the computer (the final image, already sanitized, and optionally the visible text) and
 * the model can only read that task and propose. Proposals are applied, or not, by the person.
 */
export const ASSISTANT_TASKS = ["capture-details", "guide-texts"] as const;
export type AssistantTask = (typeof ASSISTANT_TASKS)[number];
/** At most this many step images go to the model in one guide task. */
export const MAX_TASK_IMAGES = 20;
/** Images sent to the model: JPEG, at most this wide, at most this many bytes each. */
export const TASK_IMAGE_WIDTH = 1280;
export const MAX_TASK_IMAGE_BYTES = 2_000_000;
export const MAX_TASK_TEXT = 20_000;

const base64 = z
  .string()
  .max(Math.ceil((MAX_TASK_IMAGE_BYTES * 4) / 3) + 4)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);
/** What the renderer shows in the review and hands to the main process to share. */
export const taskContextSchema = z.discriminatedUnion("task", [
  z.strictObject({
    task: z.literal("capture-details"),
    targetId: z.string().uuid(),
    name: z.string().max(120),
    tags: z.array(z.string().max(60)).max(30),
    image: base64,
    text: z.string().max(MAX_TASK_TEXT),
  }),
  z.strictObject({
    task: z.literal("guide-texts"),
    targetId: z.string().uuid(),
    title: z.string().max(120),
    steps: z
      .array(
        z.strictObject({
          stepId: z.string().uuid(),
          title: z.string().max(200),
          description: z.string().max(4000),
          alt: z.string().max(500),
          image: base64,
        }),
      )
      .min(1)
      .max(MAX_TASK_IMAGES),
  }),
]);
export type TaskContext = z.infer<typeof taskContextSchema>;

export const captureProposalSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  tags: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
});
export const guideProposalSchema = z.strictObject({
  steps: z
    .array(
      z.strictObject({
        stepId: z.string().uuid(),
        title: z.string().trim().max(200),
        description: z.string().trim().max(4000),
        alt: z.string().trim().max(500),
      }),
    )
    .min(1)
    .max(MAX_TASK_IMAGES),
});
export type CaptureProposal = z.infer<typeof captureProposalSchema>;
export type GuideProposal = z.infer<typeof guideProposalSchema>;

/** The only tools the model sees: read the task, propose for it. */
export const ASSISTANT_TOOLS = {
  get_task: {
    title: "Ler a tarefa",
    description:
      "Returns the task the person started: instructions, the final image(s) as they will be shared and, when the person allowed it, the visible text. Nothing else of the computer or the library is available.",
    input: z.strictObject({}),
  },
  propose_capture_details: {
    title: "Propor título e etiquetas",
    description:
      "Proposes a short title (Brazilian Portuguese, up to 120 characters) and up to 8 tags for the capture. The person reviews and decides; nothing changes by itself.",
    input: captureProposalSchema,
  },
  propose_guide_texts: {
    title: "Propor textos dos passos",
    description:
      "Proposes, for each step id of the task, a title, a short description of what to do and an alternative text that describes the image for people who cannot see it. The person reviews and decides.",
    input: guideProposalSchema,
  },
} as const;
export type AssistantToolName = keyof typeof ASSISTANT_TOOLS;
export const PROPOSAL_TOOL: Record<AssistantTask, AssistantToolName> = {
  "capture-details": "propose_capture_details",
  "guide-texts": "propose_guide_texts",
};

export const ASSISTANT_GUIDE = `You help with screen captures in EdiCaptura, in Brazilian Portuguese. Call get_task first; it has everything you may use. Do not ask for files, do not run commands and do not browse. Answer only through the proposal tool of the task, once, then say in one short sentence what you proposed. Never copy text that looks like personal data or a credential into titles, tags or descriptions.`;

export function taskMessage(task: AssistantTask): string {
  return task === "capture-details"
    ? "Tarefa: proponha um título curto e descritivo e até 8 etiquetas para esta captura de tela, com propose_capture_details."
    : "Tarefa: para cada passo deste guia, proponha título, descrição curta da ação e texto alternativo da imagem, com propose_guide_texts. Use os ids de passo da tarefa.";
}

/** Checks a proposal against the task it answers: same task, only its steps. */
export function proposalFor(context: TaskContext, tool: string, input: unknown) {
  if (tool !== PROPOSAL_TOOL[context.task])
    throw new Error("Esta tarefa não aceita essa proposta.");
  if (context.task === "capture-details") return captureProposalSchema.parse(input);
  const proposal = guideProposalSchema.parse(input);
  const known = new Set(context.steps.map((step) => step.stepId));
  if (proposal.steps.some((step) => !known.has(step.stepId)))
    throw new Error("A proposta cita um passo que não está na tarefa.");
  if (new Set(proposal.steps.map((step) => step.stepId)).size !== proposal.steps.length)
    throw new Error("A proposta repete um passo.");
  return proposal;
}
