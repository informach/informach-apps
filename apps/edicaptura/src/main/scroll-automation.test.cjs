const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ScrollAutomation } = require("./scroll-automation.ts");
const target = {
  handle: "123",
  identity: "123:4:5",
  bounds: { x: -100, y: 20, width: 300, height: 200 },
};
const region = { x: -80, y: 50, width: 200, height: 100 };
function harness(now) {
  const calls = [];
  let release,
    moved = false,
    denied = false,
    activated = false;
  const auto = new ScrollAutomation(
    async (signal) => ({
      preparationMs: 0,
      close() {},
      query: async (request) => {
        calls.push(request);
        if (request.op === "windows") return [target];
        if (request.op === "focus" && release)
          await new Promise((resolve) => {
            release = resolve;
          });
        signal.throwIfAborted();
        if (request.op === "focus") return { window: target, focused: !denied };
        if (request.op === "foreground" && denied && !activated)
          return { ...target, handle: "456", identity: "456:4:5" };
        return moved ? { ...target, bounds: { ...target.bounds, x: 0 } } : target;
      },
    }),
    now,
  );
  return {
    auto,
    calls,
    deny: () => {
      denied = true;
    },
    activate: () => {
      activated = true;
    },
    hold: () => {
      release = () => {};
    },
    release: () => release(),
    move: () => {
      moved = true;
    },
  };
}
test("only current authorized tokens/axis/region can focus and wheel, with bounded step limits", async () => {
  const h = harness();
  const [item] = await h.auto.list(["123"], region);
  for (const invalid of [
    { token: item.token, axis: "vertical", authorized: false },
    { token: "123", axis: "vertical", authorized: true },
    { token: item.token, axis: "diagonal", authorized: true },
  ])
    await assert.rejects(h.auto.start(invalid, region));
  assert.equal(h.calls.filter((c) => c.op === "focus").length, 0);
  await assert.rejects(
    h.auto.start({ token: item.token, axis: "vertical", authorized: true }, { ...region, x: -101 }),
    /contenha/,
  );
  await h.auto.start(
    { token: item.token, axis: "horizontal", authorized: true, maxSteps: 1 },
    region,
  );
  await h.auto.wheel(region);
  assert.equal(h.calls.at(-1).delta, 120);
  await assert.rejects(h.auto.wheel(region), /Limite/);
  assert.equal(h.auto.running, false);
  assert.equal(h.calls.filter((c) => c.op === "wheel").length, 1);
});
test("denied focus waits without wheel, validates activation, and cancels without late restart", async () => {
  const h = harness(),
    [item] = await h.auto.list(["123"], region);
  h.deny();
  await h.auto.start({ token: item.token, axis: "horizontal", authorized: true }, region);
  assert.equal(h.auto.waiting, true);
  assert.equal(h.auto.running, false);
  await assert.rejects(h.auto.wheel(region), /encerrada/);
  assert.equal(await h.auto.waitForTarget(), false);
  assert.equal(h.calls.filter((c) => c.op === "wheel").length, 0);
  h.activate();
  assert.equal(await h.auto.waitForTarget(), true);
  await h.auto.wheel(region);
  h.auto.stop();
  const next = await h.auto.list(["123"], region);
  await h.auto.start({ token: next[0].token, axis: "vertical", authorized: true }, region);
  h.auto.stop();
  await assert.rejects(h.auto.waitForTarget(), /encerrada/);
  assert.equal(h.auto.waiting, false);
  assert.equal(h.calls.filter((c) => c.op === "wheel").length, 1);
});
test("cancel during helper preparation closes late helper and never exposes targets", async () => {
  let release,
    closed = false;
  const auto = new ScrollAutomation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = auto.list(["123"], region);
  auto.stop();
  release({
    close: () => {
      closed = true;
    },
    query: () => {
      throw Error("must not query");
    },
  });
  await assert.rejects(pending, /cancelada/);
  assert.equal(closed, true);
});
test("activation timeout and moved target stop polling without sending any wheel", async () => {
  let time = 0;
  const h = harness(() => time);
  h.deny();
  const [item] = await h.auto.list(["123"], region);
  await h.auto.start({ token: item.token, axis: "vertical", authorized: true }, region);
  time = 30000;
  await assert.rejects(h.auto.waitForTarget(), /30 segundos/);
  assert.equal(h.auto.waiting, false);
  await assert.rejects(h.auto.waitForTarget(), /encerrada/);
  const [second] = await h.auto.list(["123"], region);
  await h.auto.start({ token: second.token, axis: "vertical", authorized: true }, region);
  h.move();
  await assert.rejects(h.auto.waitForTarget(), /TARGET_CHANGED/);
  assert.equal(h.auto.waiting, false);
  assert.equal(h.calls.filter((c) => c.op === "wheel").length, 0);
});
test("cancel during focus does not activate late automation and stale tokens cannot restart", async () => {
  const h = harness(),
    [item] = await h.auto.list(["123"], region);
  h.hold();
  const start = h.auto.start({ token: item.token, axis: "vertical", authorized: true }, region);
  h.auto.stop();
  h.release();
  await assert.rejects(start);
  assert.equal(h.auto.running, false);
  await assert.rejects(
    h.auto.start({ token: item.token, axis: "vertical", authorized: true }, region),
    /Escolha/,
  );
  assert.equal(h.calls.filter((c) => c.op === "wheel").length, 0);
});
test("changed target result stops immediately and never dispatches another wheel", async () => {
  const h = harness(),
    [item] = await h.auto.list(["123"], region);
  await h.auto.start({ token: item.token, axis: "vertical", authorized: true }, region);
  h.move();
  await assert.rejects(h.auto.wheel(region), /TARGET_CHANGED/);
  assert.equal(h.auto.running, false);
  await assert.rejects(h.auto.wheel(region), /encerrada/);
  assert.equal(h.calls.filter((c) => c.op === "wheel").length, 1);
});
