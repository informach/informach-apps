import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ToolLaunch } from "../types";
import { ReasoningTool } from "./components";
import { reasoningTools } from "./index";

describe("representações de raciocínio renderizam nos dois roteiros", () => {
  for (const tool of reasoningTools)
    for (const mode of tool.modes)
      for (const variant of [0, 1] satisfies (0 | 1)[]) {
        it(`${tool.family}.${mode}/${variant}: controles têm representação e comparação bloqueada`, () => {
          const launch: ToolLaunch = { family: tool.family, mode, variant, grade: 8 };
          const state = tool.activity(launch).initialState;
          const markup = renderToStaticMarkup(
            createElement(ReasoningTool, {
              launch,
              state,
              disabled: true,
              onChange: () => {
                throw new Error("Renderização não pode alterar a montagem.");
              },
            }),
          );
          expect(markup).toContain('<fieldset disabled=""');
          expect(markup).toContain("Controles da investigação");
          expect(markup).toMatch(/<(button|input|select)/);
          expect(markup).not.toMatch(/NaN|Infinity|undefined/);
        });
      }
});
