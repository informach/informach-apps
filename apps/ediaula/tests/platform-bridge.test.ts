import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bridgeAbsent,
  bridgeBusy,
  bridgeSteps,
  bridgeVerbs,
  locatorOf,
} from "../src/shared/platformBridge.ts";

/** A ponte de gravação: a plataforma diz de que gestos é feita cada ação sua. */

const viewport = { width: 1920, height: 1080 };

test("os gestos da plataforma viram etapas do plano, com as esperas que ela pediu", () => {
  const steps = bridgeSteps(
    {
      valor: [
        { fazer: "clicar", alvo: { papel: "button", nome: "Verificar projeto" } },
        {
          fazer: "esperar",
          alvo: { seletor: "[role=status]" },
          estado: "aparecer",
          espera: "acelerar",
          maximo: 170,
        },
        { fazer: "apontar", alvo: { seletor: "iframe.jogo", u: 0.25, v: 0.8 } },
        { fazer: "arrastar", alvo: { texto: "mover" }, para: { rotulo: "Área de trabalho" } },
        { fazer: "rolar", dy: -300 },
        { fazer: "digitar", alvo: { rotulo: "Nome" }, texto: "Lia" },
        { fazer: "tecla", tecla: "Escape" },
        { fazer: "esperar", alvo: { seletor: ".carregando" }, estado: "sumir", espera: "cortar" },
      ],
    },
    "verificar projeto",
    "etapa-3",
    viewport,
  );
  assert.deepEqual(
    steps.map((s) => [s.id, s.action]),
    [
      ["etapa-3-1", "click"],
      ["etapa-3-2", "wait"],
      ["etapa-3-3", "point"],
      ["etapa-3-4", "drag"],
      ["etapa-3-5", "scroll"],
      ["etapa-3-6", "type"],
      ["etapa-3-7", "key"],
      ["etapa-3-8", "wait"],
    ],
  );
  assert.deepEqual(steps[0].target?.locator?.strategies, [
    { by: "role", role: "button", name: "Verificar projeto" },
  ]);
  // A check on the platform's server may take minutes; it goes in sped up (no policy: the default).
  assert.equal(steps[1].timeout, 170);
  assert.equal(steps[1].wait, undefined);
  assert.deepEqual(steps[2].target?.locator?.point, { u: 0.25, v: 0.8 });
  assert.deepEqual(steps[4].delta, { x: 0, y: -300 });
  assert.deepEqual(steps[7].wait, { policy: "cut" });
  assert.equal(steps[7].until?.state, "hidden");
});

test("sem ponte ou com resposta estranha, a professora sabe o que fazer", () => {
  assert.throws(
    () => bridgeSteps({ semPonte: true }, "ampliar jogo", "a", viewport),
    /ponte de gravação/,
  );
  assert.throws(
    () => bridgeSteps({ valor: [{ fazer: "voar" }] }, "ampliar jogo", "a", viewport),
    /não entende/,
  );
  assert.throws(
    () => bridgeSteps({ valor: [{ fazer: "clicar", alvo: {} }] }, "ampliar jogo", "a", viewport),
    /não entende/,
  );
  assert.throws(() => bridgeSteps({ valor: [] }, "ampliar jogo", "a", viewport), /não entende/);
});

test("continuar: a página decide depois dos gestos anteriores", () => {
  const steps = bridgeSteps(
    {
      valor: [
        { fazer: "clicar", alvo: { texto: "jogador" } },
        { fazer: "continuar", acao: "escolher" },
      ],
    },
    "trocar",
    "a",
    viewport,
  );
  assert.equal(steps[1].action, "platform");
  assert.equal(steps[1].platform, "escolher");
  assert.throws(
    () => bridgeSteps({ valor: [{ fazer: "continuar", acao: "" }] }, "trocar", "a", viewport),
    /não entende/,
  );
});

test("apontar exato: a mão descansa onde a página disse (ao lado do bloco)", () => {
  const [exato, comum] = bridgeSteps(
    {
      valor: [
        { fazer: "apontar", alvo: { seletor: "svg" }, exato: true },
        { fazer: "apontar", alvo: { texto: "Achados" } },
      ],
    },
    "apontar bloco",
    "a",
    viewport,
  );
  assert.equal(exato.exact, true);
  assert.equal(comum.exact, undefined);
});

test("sem ponte ainda: a página que carrega é consultada de novo", () => {
  assert.equal(bridgeAbsent({ semPonte: true }), true);
  assert.equal(bridgeAbsent({ valor: [] }), false);
  assert.equal(bridgeAbsent(undefined), false);
});

test("ocupado e verbos: só o que a ponte disse conta", () => {
  assert.equal(bridgeBusy({ valor: true }), true);
  assert.equal(bridgeBusy({ valor: false }), false);
  assert.equal(bridgeBusy({ semPonte: true }), false);
  assert.equal(bridgeBusy("sim"), false);
  assert.deepEqual(bridgeVerbs({ valor: [{ verbo: "ampliar", exemplo: "ampliar jogo" }] }), [
    { verbo: "ampliar", exemplo: "ampliar jogo" },
  ]);
  assert.equal(bridgeVerbs({ semPonte: true }), null);
  assert.equal(locatorOf({ texto: "Ok" }, viewport).fingerprint.view.width, 1920);
  // A block of the programming editor, as the guided mode already finds blocks.
  assert.deepEqual(
    locatorOf({ bloco: { texto: "quando começar", area: "workspace", abaixo: true } }, viewport)
      .strategies,
    [{ by: "blockly", text: "quando começar", area: "workspace", below: true }],
  );
  const [drag] = bridgeSteps(
    {
      valor: [
        {
          fazer: "arrastar",
          alvo: { bloco: { texto: "mover", area: "flyout" } },
          para: { bloco: { texto: "quando começar", area: "workspace", abaixo: true } },
        },
      ],
    },
    "arrastar",
    "e",
    viewport,
  );
  assert.equal(drag.action, "drag");
  // A menu item only inside the open menu; a field's text replaced, not added to.
  const [item, number] = bridgeSteps(
    {
      valor: [
        { fazer: "clicar", alvo: { texto: "achados", dentro: ".blocklyDropDownDiv" } },
        {
          fazer: "digitar",
          alvo: { seletor: "input.blocklyHtmlInput" },
          texto: "0",
          substituir: true,
        },
      ],
    },
    "trocar",
    "f",
    viewport,
  );
  assert.deepEqual(item.target?.locator?.within, { by: "css", value: ".blocklyDropDownDiv" });
  assert.equal(number.replace, true);
  assert.equal(number.value, "0");
  assert.deepEqual(drag.target?.locator?.strategies, [
    { by: "blockly", text: "mover", area: "flyout" },
  ]);
});

test("segurar vira uma etapa que segura o botão no alvo ou uma tecla, pelo tempo pedido", () => {
  const steps = bridgeSteps(
    {
      valor: [
        { fazer: "segurar", alvo: { seletor: "iframe.jogo", u: 0.2, v: 0.9 }, segundos: 1.5 },
        { fazer: "segurar", tecla: "ArrowRight" },
      ],
    },
    "segurar seta da direita",
    "etapa-2",
    viewport,
  );
  assert.deepEqual(
    steps.map((s) => [s.action, s.hold, s.chord]),
    [
      ["hold", 1.5, undefined],
      ["hold", undefined, "ArrowRight"],
    ],
  );
  assert.deepEqual(steps[0].target?.locator?.point, { u: 0.2, v: 0.9 });
  assert.equal(steps[1].target, undefined);
  // Both, or neither: the platform said something the robot cannot do.
  for (const passo of [
    { fazer: "segurar", segundos: 1 },
    { fazer: "segurar", alvo: { texto: "Seta" }, tecla: "ArrowUp" },
  ])
    assert.throws(() => bridgeSteps({ valor: [passo] }, "segurar", "x", viewport));
});
