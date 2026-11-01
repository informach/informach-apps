import { z } from "zod";
import { type GuidedStepV2, type GuidedViewport, MAX_STEP_TIMEOUT } from "./guidedPlan.ts";
import { BLOCKLY_AREAS, type Locator, type LocatorStrategy } from "./locators.ts";

/**
 * The recording bridge: a lesson platform that wants its lessons recorded by the guided mode
 * says what its own actions are made of. The page exposes, in its own world:
 *
 *   window.__gravacao = {
 *     versao: 1,
 *     verbos(): { verbo: string; exemplo: string; descricao?: string }[],
 *     agir(acao: string): Passo[] | Promise<Passo[]>,
 *     ocupado(): boolean,
 *   }
 *
 * `acao` is the text between brackets of the script's "Na tela" ("ampliar jogo"); `agir` answers
 * with plain gestures (Passo), which the robot does with the hand of a person and the waits of a
 * guided take; `ocupado` says the page is still working (loading, checking, turning a page), so
 * the next gesture waits for it. The platform never moves the pointer itself, and the app never
 * learns anything of the platform but these gestures: the same contract serves any platform.
 * `{ fazer: "continuar", acao }` asks `agir(acao)` again once the gestures before it are done, so
 * the page decides on what they opened (a list or a text box after clicking a field).
 */

export const BRIDGE_VERSION = 1;

/**
 * Where a gesture happens: an element by a CSS selector, by its accessible role and name, by its
 * label or by its text, and the spot inside it (u, v from 0 to 1 of its box; the middle when
 * absent), which is how a point of a canvas or of a game is reached.
 */
const alvoSchema = z
  .object({
    seletor: z.string().min(1).max(4000).optional(),
    papel: z
      .string()
      .regex(/^[A-Za-z]{2,40}$/)
      .optional(),
    nome: z.string().max(500).optional(),
    rotulo: z.string().min(1).max(500).optional(),
    texto: z.string().min(1).max(500).optional(),
    /** A programming block by its labels: in the palette, the workspace or the category list. */
    bloco: z
      .object({
        texto: z.string().min(1).max(500),
        area: z.enum(BLOCKLY_AREAS),
        abaixo: z.boolean().optional(),
      })
      .optional(),
    /** Only inside the single element this CSS selector names (an open menu, a dialog). */
    dentro: z.string().min(1).max(4000).optional(),
    u: z.number().min(0).max(1).optional(),
    v: z.number().min(0).max(1).optional(),
  })
  .refine((a) => a.seletor || (a.papel && a.nome !== undefined) || a.rotulo || a.texto || a.bloco, {
    message:
      "O alvo precisa de um seletor, de um papel com nome, de um rótulo, de um texto ou de um bloco.",
  });
export type Alvo = z.infer<typeof alvoSchema>;

const espera = z.enum(["acelerar", "cortar"]).optional();
const maximo = z.number().min(0.5).max(MAX_STEP_TIMEOUT).optional();

export const passoSchema = z.discriminatedUnion("fazer", [
  z.object({
    fazer: z.enum(["apontar", "clicar", "clique duplo", "clique direito"]),
    alvo: alvoSchema,
    espera,
    maximo,
    /** apontar: o ponto é onde a mão descansa (ao lado do bloco, não em cima dele). */
    exato: z.boolean().optional(),
  }),
  z.object({ fazer: z.literal("arrastar"), alvo: alvoSchema, para: alvoSchema, maximo }),
  z.object({
    fazer: z.literal("rolar"),
    alvo: alvoSchema.optional(),
    dy: z.number().finite().min(-100000).max(100000).optional(),
    ate: alvoSchema.optional(),
    espera,
    maximo,
  }),
  z.object({
    fazer: z.literal("digitar"),
    alvo: alvoSchema,
    texto: z.string().max(1000),
    substituir: z.boolean().optional(),
  }),
  z.object({ fazer: z.literal("tecla"), tecla: z.string().min(1).max(60) }),
  z.object({
    fazer: z.literal("esperar"),
    alvo: alvoSchema,
    estado: z.enum(["aparecer", "sumir", "ficar disponível"]).optional(),
    espera,
    maximo,
  }),
  z.object({ fazer: z.literal("continuar"), acao: z.string().min(1).max(500) }),
]);
export type Passo = z.infer<typeof passoSchema>;

/** What the page answered to `agir`: the gestures, or that it has no bridge. */
const answerSchema = z.union([
  z.object({ semPonte: z.literal(true) }),
  z.object({ valor: z.array(passoSchema).min(1).max(200) }),
]);

const verbSchema = z.object({
  verbo: z.string().min(1).max(200),
  exemplo: z.string().max(500),
  descricao: z.string().max(1000).optional(),
});
export type BridgeVerb = z.infer<typeof verbSchema>;

/** The page's list of verbs, or null when it has no bridge or the list is not one. */
export function bridgeVerbs(raw: unknown): BridgeVerb[] | null {
  const parsed = z
    .union([
      z.object({ semPonte: z.literal(true) }),
      z.object({ valor: z.array(verbSchema).max(500) }),
    ])
    .safeParse(raw);
  return parsed.success && "valor" in parsed.data ? parsed.data.valor : null;
}

const NO_BRIDGE =
  "Esta página não tem a ponte de gravação: use os verbos do EdiAula (clicar, apontar, arrastar, esperar…) ou marque a etapa à mão.";

/** A gesture's target as the guided mode looks for it. */
export function locatorOf(alvo: Alvo, viewport: GuidedViewport): Locator {
  const strategies: LocatorStrategy[] = [];
  if (alvo.seletor) strategies.push({ by: "css", value: alvo.seletor });
  if (alvo.papel && alvo.nome !== undefined)
    strategies.push({ by: "role", role: alvo.papel, name: alvo.nome });
  if (alvo.rotulo) strategies.push({ by: "label", value: alvo.rotulo });
  if (alvo.texto) strategies.push({ by: "text", value: alvo.texto });
  if (alvo.bloco)
    strategies.push({
      by: "blockly",
      text: alvo.bloco.texto,
      area: alvo.bloco.area,
      ...(alvo.bloco.abaixo ? { below: true } : {}),
    });
  return {
    strategies,
    ...(alvo.dentro ? { within: { by: "css" as const, value: alvo.dentro } } : {}),
    point: { u: alvo.u ?? 0.5, v: alvo.v ?? 0.5 },
    fingerprint: {
      tag: "",
      text: alvo.nome ?? alvo.rotulo ?? alvo.texto ?? alvo.bloco?.texto ?? "",
      rect: { x: 0, y: 0, width: 0, height: 0 },
      view: { width: viewport.width, height: viewport.height },
      cursor: "",
    },
  };
}

const STATES = { aparecer: "visible", sumir: "hidden", "ficar disponível": "enabled" } as const;

/**
 * The steps of the plan the page's answer to `agir(action)` becomes, each one a gesture with the
 * waits it asked for. Throws what to tell the teacher when the page has no bridge or answered
 * something else.
 */
export function bridgeSteps(
  raw: unknown,
  action: string,
  id: string,
  viewport: GuidedViewport,
): GuidedStepV2[] {
  const parsed = answerSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      `A plataforma respondeu a “${action}” com algo que o EdiAula não entende: ${parsed.error.issues[0]?.message ?? "formato inválido"}.`,
    );
  if ("semPonte" in parsed.data) throw new Error(NO_BRIDGE);
  return parsed.data.valor.map((passo, k) => gestureStep(passo, `${id}-${k + 1}`, viewport));
}

/** One gesture as a step of the plan, without its times. */
function gestureStep(passo: Passo, id: string, viewport: GuidedViewport): GuidedStepV2 {
  const at = (alvo: Alvo) => ({ locator: locatorOf(alvo, viewport) });
  const base = { id, speech: "", at: 0 };
  const wait =
    "espera" in passo && passo.espera === "cortar" ? { wait: { policy: "cut" as const } } : {};
  const timeout = "maximo" in passo && passo.maximo ? { timeout: passo.maximo } : {};
  switch (passo.fazer) {
    case "apontar":
    case "clicar":
    case "clique duplo":
    case "clique direito":
      return {
        ...base,
        action:
          passo.fazer === "apontar"
            ? "point"
            : passo.fazer === "clicar"
              ? "click"
              : passo.fazer === "clique duplo"
                ? "doubleClick"
                : "rightClick",
        target: at(passo.alvo),
        ...(passo.fazer === "apontar" && passo.exato ? { exact: true } : {}),
        ...wait,
        ...timeout,
      };
    case "arrastar":
      return {
        ...base,
        action: "drag",
        target: at(passo.alvo),
        to: { target: at(passo.para) },
        ...timeout,
      };
    case "rolar":
      return {
        ...base,
        action: "scroll",
        ...(passo.alvo ? { target: at(passo.alvo) } : {}),
        delta: { x: 0, y: passo.dy ?? 400 },
        ...(passo.ate
          ? { until: { locator: locatorOf(passo.ate, viewport), state: "visible" } }
          : {}),
        ...wait,
        ...timeout,
      };
    case "digitar":
      return {
        ...base,
        action: "type",
        target: at(passo.alvo),
        value: passo.texto,
        ...(passo.substituir ? { replace: true } : {}),
      };
    case "tecla":
      return { ...base, action: "key", chord: passo.tecla };
    case "esperar":
      return {
        ...base,
        action: "wait",
        until: {
          locator: locatorOf(passo.alvo, viewport),
          state: STATES[passo.estado ?? "aparecer"],
        },
        ...wait,
        ...timeout,
      };
    case "continuar":
      // Asked of the page again when its turn comes (shared/guidedRunner.ts runPlatform).
      return { ...base, action: "platform", platform: passo.acao };
  }
}

/** True when the page answered that it has no bridge (yet: a page still loading puts it later). */
export function bridgeAbsent(raw: unknown): boolean {
  return z.object({ semPonte: z.literal(true) }).safeParse(raw).success;
}

/** The page's `ocupado()`: true while it works, false when it has no bridge. */
export function bridgeBusy(raw: unknown): boolean {
  const parsed = z
    .union([z.object({ semPonte: z.literal(true) }), z.object({ valor: z.unknown() })])
    .safeParse(raw);
  return parsed.success && "valor" in parsed.data && parsed.data.valor === true;
}
