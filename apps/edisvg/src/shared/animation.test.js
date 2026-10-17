import assert from "node:assert/strict";
import { test } from "node:test";
import { frameAt, poseAt, transition } from "./animation.js";

test("loop, ping-pong and one-shot respect boundaries", () => {
  assert.equal(frameAt(2, 120, "loop"), 0);
  assert.equal(frameAt(1.5, 72, "ping-pong"), 54);
  assert.equal(frameAt(3, 48, "once"), 48);
  assert.equal(frameAt(-1, 72, "loop"), 0);
});
test("jump reaches peak and returns to the ground", () => {
  assert.equal(poseAt("Pular", 24, 48).y, -70);
  assert.ok(Math.abs(poseAt("Pular", 48, 48).y) < 1e-10);
});
test("jump cannot be interrupted by hover and returns to appropriate state", () => {
  assert.equal(transition("Parado", "enter"), "Acenar");
  assert.equal(transition("Acenar", "click"), "Pular");
  assert.equal(transition("Pular", "leave"), "Pular");
  assert.equal(transition("Pular", "finish", true), "Acenar");
  assert.equal(transition("Pular", "finish", false), "Parado");
});
