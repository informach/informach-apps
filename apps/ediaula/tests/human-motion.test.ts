import assert from "node:assert/strict";
import { test } from "node:test";
import {
  humanDuration,
  humanPath,
  minimumJerk,
  moveSeed,
  pathAt,
  scrollSeconds,
  smoothScroll,
  typingGaps,
} from "../src/shared/humanMotion.ts";

const from = { x: 100, y: 500 };
const to = { x: 900, y: 200 };

test("o caminho sai e chega nos pontos certos, em curva, e a mesma semente desenha o mesmo caminho", () => {
  const path = humanPath(from, to, 42);
  assert.deepEqual(pathAt(path, 0), from);
  assert.deepEqual(pathAt(path, 1), to);
  // Never the straight line: the middle is off it by a few percent of the distance.
  const mid = pathAt(path, 0.5);
  const straight = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const off = Math.hypot(mid.x - straight.x, mid.y - straight.y);
  assert.ok(off > 5, `fora da reta ${off}`);
  assert.deepEqual(humanPath(from, to, 42), path);
  // Another seed, another arc.
  assert.notDeepEqual(humanPath(from, to, 43).c1, path.c1);
});

test("a velocidade começa e termina devagar, sem salto entre quadros", () => {
  assert.equal(minimumJerk(0), 0);
  assert.equal(minimumJerk(1), 1);
  assert.ok(minimumJerk(0.05) < 0.01 && minimumJerk(0.95) > 0.99);
  const path = humanPath(from, to, 7);
  let worst = 0;
  let last = pathAt(path, 0);
  for (let i = 1; i <= 60; i++) {
    const p = pathAt(path, i / 60);
    worst = Math.max(worst, Math.hypot(p.x - last.x, p.y - last.y));
    last = p;
  }
  // 854 px in 60 frames. Minimum jerk peaks at 1.875× the average speed; the overshoot's shorter
  // way out and the arc add a little: never a jump beyond that.
  assert.ok(worst < (Math.hypot(800, 300) / 60) * 2.5, `maior passo ${worst}`);
});

test("alvo pequeno e longe passa um pouco e volta; perto, vai direto", () => {
  const far = humanPath({ x: 0, y: 0 }, { x: 1500, y: 0 }, 3, 12);
  assert.ok(far.over > 0);
  let farthest = 0;
  for (let i = 0; i <= 100; i++) farthest = Math.max(farthest, pathAt(far, i / 100).x);
  assert.ok(farthest > 1500 && farthest <= 1500 + far.over + 1e-6);
  assert.deepEqual(pathAt(far, 1), { x: 1500, y: 0 });
  const nudge = humanPath({ x: 10, y: 10 }, { x: 15, y: 12 }, 3);
  assert.equal(nudge.over, 0);
  assert.deepEqual(nudge.c1, { x: 10, y: 10 });
});

test("o tempo do movimento cresce com a distância e com alvos menores, dentro do perfil", () => {
  const near = humanDuration(80, 40, "crianca");
  const far = humanDuration(1200, 40, "crianca");
  const small = humanDuration(1200, 10, "crianca");
  assert.ok(near < far && far < small);
  assert.ok(humanDuration(1200, 40, "professora") < far);
  assert.equal(humanDuration(5, 40, "crianca"), 0.15);
  assert.ok(humanDuration(1e6, 1, "crianca") <= 2.4);
  assert.notEqual(moveSeed(from, to, 0), moveSeed(from, to, 1));
});

test("digitar tem ritmo de gente, e rolar acelera e freia em passos pequenos", () => {
  const gaps = typingGaps("olá, mundo", 5);
  assert.equal(gaps.length, 10);
  assert.ok(new Set(gaps).size > 3);
  // After the comma and the space it waits a little more.
  assert.ok(gaps[5] > 0.08);
  const steps = smoothScroll(600, 1, 30);
  assert.equal(
    steps.reduce((a, b) => a + b, 0),
    600,
  );
  assert.ok(steps[0] < steps[Math.floor(steps.length / 2)]);
  assert.ok(Math.max(...steps) < 60);
  assert.equal(scrollSeconds(100), 0.35);
  assert.equal(scrollSeconds(9000), 2.5);
});
