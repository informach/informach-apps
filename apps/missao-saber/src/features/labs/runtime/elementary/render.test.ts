import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ToolLaunch } from "../types";
import { ElementaryTool } from "./components";
import { countingTool } from "./counting";
import { fractionsTool } from "./fractions";
import { elementaryTools } from "./index";
import { measuresTool } from "./measures";
import { ratiosTool } from "./ratios";
import { solidsTool } from "./solids";

describe("elementary representations", () => {
  it("offers real tray moves and shows the collection after arrival before crossing departures", () => {
    const halves: ToolLaunch = { family: "L01", mode: "dobro-metade-grupos", grade: 2, variant: 0 };
    const trays = renderToStaticMarkup(
      createElement(ElementaryTool, {
        launch: halves,
        state: countingTool.activity(halves).initialState,
        onChange: () => {},
      }),
    );
    expect(trays).toContain("Fichas ainda na mesa: 12 fichas");
    expect(trays).toContain("Colocar uma ficha na bandeja 1");
    expect(trays).toContain("Devolver uma ficha da bandeja 2");
    const steps = { ...halves, mode: "passos-e-explicacao" };
    const joined = renderToStaticMarkup(
      createElement(ElementaryTool, {
        launch: steps,
        state: { ...countingTool.activity(steps).initialState, total: 5, other: 3, removed: 7 },
        onChange: () => {},
      }),
    );
    expect(joined).toContain("Depois da chegada: 8 fichas, 7 riscadas");
  });
  it("does not introduce metric formulas or measurement controls while children count basic faces", () => {
    const launch: ToolLaunch = { family: "L19", mode: "solidos-basicos", grade: 2, variant: 0 };
    for (const shape of ["bloco", "cilindro", "esfera"]) {
      const html = renderToStaticMarkup(
        createElement(ElementaryTool, {
          launch,
          state: { ...solidsTool.activity(launch).initialState, shape },
          hideResults: true,
          onChange: () => {},
        }),
      );
      expect(html).not.toMatch(/ cm|>r=|>h=|type="range"/);
      expect(html).toContain("Girar a vista");
      expect(html).toContain(shape === "bloco" ? "frente" : "curva");
    }
  });
  it("hides computed summaries in every transfer renderer while preserving controls and geometry", () => {
    for (const tool of elementaryTools)
      for (const mode of tool.modes) {
        const launch: ToolLaunch = { family: tool.family, mode, grade: 8, variant: 1 };
        const html = renderToStaticMarkup(
          createElement(ElementaryTool, {
            launch,
            state: tool.activity(launch).initialState,
            hideResults: true,
            onChange: () => {},
          }),
        );
        expect(html, `${tool.family}.${mode}`).not.toContain('role="status"');
        expect(html).toContain("Controles da montagem");
        expect(html).not.toContain("NaN");
      }
  });
  it("renders alternate fraction representations from the same painted state without a painted-total hint", () => {
    const launch: ToolLaunch = { family: "L02", mode: "partes-iguais", grade: 6, variant: 0 };
    const state = fractionsTool.activity(launch).initialState;
    for (const representation of ["regiao", "reta"]) {
      const html = renderToStaticMarkup(
        createElement(ElementaryTool, {
          launch,
          state: { ...state, representation },
          hideResults: true,
          onChange: () => {},
        }),
      );
      expect(html).toContain(
        representation === "regiao" ? "Células de mesma área" : "Reta A, de 0 a 1 m",
      );
      expect(html).toContain("Pintar parte 1 da faixa A");
      expect(html).not.toContain("Pintado:");
    }
  });
  it("keeps the double-line givens and timeline endpoints without their calculated answers", () => {
    const ratio: ToolLaunch = { family: "L03", mode: "taxa-unitaria", grade: 6, variant: 0 };
    const ratios = renderToStaticMarkup(
      createElement(ElementaryTool, {
        launch: ratio,
        state: ratiosTool.activity(ratio).initialState,
        hideResults: true,
        onChange: () => {},
      }),
    );
    expect(ratios).toContain("Dupla reta");
    expect(ratios).toContain("2 corresponde a 200");
    expect(ratios).toContain("1 corresponde a ?");
    const clock: ToolLaunch = { family: "L04", mode: "relogio-e-duracao", grade: 4, variant: 1 };
    const time = renderToStaticMarkup(
      createElement(ElementaryTool, {
        launch: clock,
        state: measuresTool.activity(clock).initialState,
        hideResults: true,
        onChange: () => {},
      }),
    );
    expect(time).toContain("Linha do tempo de 23:40 até 00:25 do dia seguinte");
    expect(time).not.toContain("45 minutos");
    const choose: ToolLaunch = { family: "L04", mode: "escolher-unidade", grade: 3, variant: 1 };
    const units = renderToStaticMarkup(
      createElement(ElementaryTool, {
        launch: choose,
        state: measuresTool.activity(choose).initialState,
        hideResults: true,
        onChange: () => {},
      }),
    );
    expect(units).toContain("<span>m<br/></span>");
    expect(units).toContain("<span>kg<br/></span>");
    expect(units).toContain("<span>L<br/></span>");
  });
  it("supports simultaneous comparison renderers with unique control IDs and real disabled boundaries", () => {
    const launch: ToolLaunch = {
      family: "L19",
      mode: "coordenadas-capacidade-embalagem",
      grade: 9,
      variant: 0,
    };
    const state = solidsTool.activity(launch).initialState;
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(ElementaryTool, { launch, state, disabled: true, onChange: () => {} }),
        createElement(ElementaryTool, { launch, state, onChange: () => {} }),
      ),
    );
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html.match(/<fieldset disabled=/g)).toHaveLength(1);
    expect(html).toContain("ponto P (1, 1, 1) cm");
  });
  it("renders every published mode with a disabled read-only comparison boundary", () => {
    for (const tool of elementaryTools)
      for (const mode of tool.modes) {
        const launch: ToolLaunch = { family: tool.family, mode, grade: 6, variant: 0 };
        const html = renderToStaticMarkup(
          createElement(ElementaryTool, {
            launch,
            state: tool.activity(launch).initialState,
            disabled: true,
            onChange: () => {
              throw new Error("Rendering may not change a saved montage.");
            },
          }),
        );
        expect(html, `${tool.family}.${mode}`).toContain("<fieldset disabled=");
        expect(html).toContain("Controles da montagem");
        expect(html).toContain('role="status"');
        expect(html).not.toContain("NaN");
        expect(html).not.toContain("Infinity");
      }
  });
  it("gives fraction pieces a full-size selection alternative and uses the full available scale", () => {
    const tool = elementaryTools.find((entry) => entry.family === "L02");
    if (!tool) throw new Error("Missing fraction tool");
    const launch: ToolLaunch = {
      family: "L02",
      mode: "fracao-decimal-unidade",
      grade: 6,
      variant: 0,
    };
    const html = renderToStaticMarkup(
      createElement(ElementaryTool, {
        launch,
        state: tool.activity(launch).initialState,
        onChange: () => {},
      }),
    );
    expect(html).toContain("Selecionar parte da faixa A");
    expect(html).toContain("Pintar parte 1 da faixa A");
    expect(html).toContain("width:100%");
    expect(html).not.toContain('type="number"');
  });
});
