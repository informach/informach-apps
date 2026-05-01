import type { AiRuntimeConfig, AppName } from "../types";

export function getDefaultModelConfig(app: AppName, agent: string): AiRuntimeConfig {
  return {
    app,
    agent,
    model: "claude-opus-4-7",
    temperature: 0.2,
    maxOutputTokens: 4096,
  };
}
