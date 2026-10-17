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
test("autoriza tela no Electron 42 e na API display-capture", () => {
  assert.equal(allow(request), true);
  assert.equal(
    allow({ ...request, permission: "display-capture", details: { mediaTypes: ["video"] } }),
    true,
  );
});
test("nega câmera, microfone, outras janelas e gravação não iniciada", () => {
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
