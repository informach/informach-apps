import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { microphoneArgs } from "../src/shared/captureArgs.ts";
import { dshowName, parseDshowDevices } from "../src/shared/dshow.ts";

// FFmpeg 9's `-list_devices true -f dshow -i dummy` on a machine with a C920 webcam.
const listing = await readFile(new URL("./fixtures/dshow-devices.txt", import.meta.url), "utf8");

test("devices come with their alternative names, which FFmpeg opens instead", () => {
  const devices = parseDshowDevices(listing);
  assert.deepEqual(
    devices.microphones.map((d) => d.name),
    ["Microfone (HD Pro Webcam C920)", "Microfone (High Definition Audio Device)"],
  );
  assert.deepEqual(
    devices.cameras.map((d) => d.name),
    ["HD Pro Webcam C920"],
  );
  assert.match(devices.cameras[0].id ?? "", /^@device_pnp_\\\\\?\\usb#vid_046d/);
  const mic = dshowName(devices.microphones, "Microfone (High Definition Audio Device)");
  assert.match(mic, /^@device_cm_\{33D9A762-90C8-11D0-BD43-00A0C911CE86\}\\wave_\{A70E08F4/);
  // A name dshow cannot parse ("audio=…:video=…" splits at colons) is opened by its id.
  const odd = parseDshowDevices(
    `[in#0 @ 1] "Mic: USB" (audio)\n[in#0 @ 1]   Alternative name "@device_cm_{X}\\wave_{Y}"\n`,
  );
  const args = microphoneArgs({ device: dshowName(odd.microphones, "Mic: USB"), file: "m.m4a" });
  assert.equal(args[args.indexOf("-i") + 1], "audio=@device_cm_{X}\\wave_{Y}");
  // Without an alternative name, the friendly one is all there is.
  assert.equal(dshowName([{ name: "Velho" }], "Velho"), "Velho");
  assert.equal(dshowName([], "Sumiu"), "Sumiu");
});
