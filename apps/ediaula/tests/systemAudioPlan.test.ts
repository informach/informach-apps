import assert from "node:assert/strict";
import { test } from "node:test";
import {
  excludesOwnAudio,
  PROCESS_LOOPBACK_BUILD,
  systemAudioPlan,
  windowsBuild,
} from "../src/shared/systemAudio.ts";

test("the app's own sound counts as left out only with the process loopback really open", () => {
  assert.equal(
    excludesOwnAudio({ restrictOwnAudio: true, deviceId: "loopbackWithoutChrome" }),
    true,
  );
  // The constraint accepted but the plain loopback opened (a Windows without process loopback).
  assert.equal(excludesOwnAudio({ restrictOwnAudio: true, deviceId: "loopback" }), false);
  assert.equal(
    excludesOwnAudio({ restrictOwnAudio: false, deviceId: "loopbackWithoutChrome" }),
    false,
  );
  assert.equal(excludesOwnAudio({}), false);
});

test("without the exclusion, a take where the app plays a voice does not record the computer's sound", () => {
  // "Tela sobre a narração" or a guided take with narration, on a Windows that cannot leave
  // the app out: off, with the reason, never the voice recorded twice.
  const off = systemAudioPlan({ wanted: true, narrationPlays: true, excludesApp: false });
  assert.equal(off.record, false);
  assert.match(off.warning ?? "", /desligado/);
  assert.doesNotMatch(off.warning ?? "", /—/);
  // With the exclusion it records.
  assert.deepEqual(systemAudioPlan({ wanted: true, narrationPlays: true, excludesApp: true }), {
    record: true,
  });
  // No voice played by the app: it records either way.
  assert.deepEqual(systemAudioPlan({ wanted: true, narrationPlays: false, excludesApp: false }), {
    record: true,
  });
  // Not asked for: nothing, and nothing to say.
  assert.deepEqual(systemAudioPlan({ wanted: false, narrationPlays: true, excludesApp: false }), {
    record: false,
  });
});

test("the native route needs the Windows build that brought process loopback", () => {
  assert.equal(windowsBuild("10.0.22631"), 22631);
  assert.equal(windowsBuild("10.0.19041"), PROCESS_LOOPBACK_BUILD);
  assert.ok(windowsBuild("10.0.18363") < PROCESS_LOOPBACK_BUILD);
  assert.equal(windowsBuild("6.1"), 0);
  assert.equal(windowsBuild(""), 0);
  // The native route leaves out every sound of the app: a voice played by it never comes back.
  assert.deepEqual(systemAudioPlan({ wanted: true, narrationPlays: true, excludesApp: true }), {
    record: true,
  });
});
