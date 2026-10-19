import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
export function clientCommand(bin: string, args: string[]): { command: string; args: string[] } {
  if (!bin.toLowerCase().endsWith(".cmd")) return { command: bin, args };
  const name = basename(bin).toLowerCase();
  const script =
    name === "codex.cmd"
      ? join(dirname(bin), "node_modules", "@openai", "codex", "bin", "codex.js")
      : name === "claude.cmd"
        ? join(dirname(bin), "node_modules", "@anthropic-ai", "claude-code", "cli.js")
        : null;
  if (!script || !existsSync(script))
    throw new Error("Reinstale o cliente oficial para continuar.");
  return { command: "node.exe", args: [script, ...args] };
}
export function personalClientEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "CODEX_API_KEY",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
  ])
    delete env[key];
  return env;
}
