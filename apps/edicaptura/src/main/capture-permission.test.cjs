const { test } = require("node:test");
const assert = require("node:assert/strict");
const { allowCapturePermission: allow } = require("./capture-permission.cjs");
const request = {
  trusted: true,
  mode: "video",
  started: true,
  permission: "media",
  details: { mediaTypes: [] },
};
const withSound = { microphone: true, system: true };
test("autoriza tela no Electron 42 e na API display-capture", () => {
  assert.equal(allow(request), true);
  assert.equal(
    allow({ ...request, permission: "display-capture", details: { mediaTypes: ["video"] } }),
    true,
  );
});
test("nega câmera, microfone, outras janelas e gravação não iniciada sem opções de áudio", () => {
  for (const patch of [
    { trusted: false },
    { started: false },
    { mode: "scroll" },
    { permission: "notifications" },
    { details: { mediaTypes: ["video"] } },
    { details: { mediaTypes: ["audio"] } },
    { details: { mediaTypes: [], isMainFrame: false } },
    { permission: "display-capture", details: { mediaTypes: ["audio"] } },
  ])
    assert.equal(allow({ ...request, ...patch }), false);
});
test("microfone e áudio do PC só quando a pessoa ligou cada um", () => {
  const mic = { ...request, details: { mediaTypes: ["audio"] } };
  assert.equal(allow({ ...mic, audio: { microphone: true, system: false } }), true);
  // The meter opens the microphone during the countdown, before the screen capture starts.
  assert.equal(allow({ ...mic, started: false, audio: withSound }), true);
  assert.equal(allow({ ...mic, audio: { microphone: false, system: true } }), false);
  assert.equal(
    allow({ ...request, details: { mediaTypes: ["audio", "video"] }, audio: withSound }),
    false,
  );
  assert.equal(allow({ ...mic, mode: "scroll", audio: withSound }), false);
  assert.equal(allow({ ...mic, trusted: false, audio: withSound }), false);
  const system = {
    ...request,
    permission: "display-capture",
    details: { mediaTypes: ["video", "audio"] },
  };
  assert.equal(allow({ ...system, audio: { microphone: false, system: true } }), true);
  assert.equal(allow({ ...system, audio: { microphone: true, system: false } }), false);
  assert.equal(allow({ ...system, started: false, audio: withSound }), false);
});
