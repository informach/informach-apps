import { z } from "zod";

export const toolFamilySchema = z.enum([
  "L01",
  "L02",
  "L03",
  "L04",
  "L05",
  "L06",
  "L07",
  "L08",
  "L09",
  "L10",
  "L11",
  "L12",
  "L13",
  "L14",
  "L15",
  "L16",
  "L17",
  "L18",
  "L19",
]);
export type ToolFamilyId = z.infer<typeof toolFamilySchema>;
export type ToolLaunch = {
  family: ToolFamilyId;
  mode: string;
  grade: number;
  variant: 0 | 1;
};
/** Serialized at the boundary; every tool must parse its concrete schema before use. */
export type ToolState = Record<string, unknown>;
export type ToolAssessment = {
  correct: boolean | null;
  message: string;
  summary: string;
};
export type AnswerKey = "decimal" | "fraction" | "negative" | "power" | "root" | "parentheses";
export type ToolActivity = {
  title: string;
  prompt: string;
  prediction: string;
  observation: string;
  explanation: string;
  rubric: string[];
  initialState: ToolState;
  answerLabel: string;
  answerHint?: string;
  choices?: string[];
  /** Only symbols accepted by this activity's answer grammar. Ordinary typing stays available. */
  answerKeys?: AnswerKey[];
};
export type ToolModule = {
  family: ToolFamilyId;
  modes: readonly string[];
  activity: (launch: ToolLaunch) => ToolActivity;
  parse: (launch: ToolLaunch, raw: unknown) => ToolState;
  assess: (launch: ToolLaunch, state: ToolState, answer: string) => ToolAssessment;
  summarize: (launch: ToolLaunch, state: ToolState) => string;
};
export type LabToolProps = {
  launch: ToolLaunch;
  state: ToolState;
  onChange: (state: ToolState) => void;
  disabled?: boolean;
  /** Keep givens and construction controls, withholding derived answers until help is requested. */
  hideResults?: boolean;
};
