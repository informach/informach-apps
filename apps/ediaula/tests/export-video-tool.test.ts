import assert from "node:assert/strict";
import { test } from "node:test";
import { guarded } from "../src/main/mcpGuard.ts";
import { AI_TOOLS, callPermission } from "../src/shared/aiTools.ts";
import { exportName, presetSpec, runExportVideo } from "../src/shared/exportPresets.ts";
import type { Finding } from "../src/shared/preflight.ts";

const problem: Finding = { severity: "error", kind: "media-missing", message: "Falta a tela." };
const warning: Finding = { severity: "warn", kind: "duration", message: "Aula longa." };

function steps(findings: Finding[], answers: { confirm?: boolean; path?: string | null } = {}) {
  const log: string[] = [];
  return {
    log,
    steps: {
      check: async () => {
        log.push("check");
        return findings;
      },
      confirm: async (problems: readonly string[]) => {
        log.push(`confirm:${problems.join("|")}`);
        return answers.confirm ?? false;
      },
      pickPath: async (name: string) => {
        log.push(`pick:${name}`);
        return answers.path === undefined ? "C:\\Vídeos\\Aula.mp4" : answers.path;
      },
      enqueue: (outPath: string) => {
        log.push(`queue:${outPath}`);
        return "export-1";
      },
    },
  };
}

test("export_video is a write: an app that may only read and propose has to ask the person", async () => {
  assert.equal(callPermission("export_video", { preset: "youtube" }), "write");
  assert.equal(callPermission("get_export_status", {}), "read");
  // The AI never names the destination: there is no field for it.
  assert.equal(
    AI_TOOLS.export_video.input.safeParse({ preset: "youtube", outPath: "C:\\x.mp4" }).success,
    true,
  );
  assert.equal(
    "outPath" in
      (AI_TOOLS.export_video.input.parse({ preset: "youtube", outPath: "C:\\x.mp4" }) as object),
    false,
  );
  const grant = {
    id: "g",
    client: "claude-code",
    scopes: ["read", "propose"] as ("read" | "propose" | "write")[],
  };
  const calls: string[] = [];
  const deps = (choice: "once" | "deny") => ({
    approve: async () => {
      calls.push("asked");
      return { choice, projectId: choice === "deny" ? null : "p" };
    },
    call: async (name: string) => {
      calls.push(`ran:${name}`);
      return { ok: true, text: "na fila" };
    },
  });
  const denied = await guarded(grant, "export_video", { preset: "youtube" }, deps("deny"));
  assert.equal(denied.ok, false);
  assert.deepEqual(calls, ["asked"]);
  const allowed = await guarded(grant, "export_video", { preset: "youtube" }, deps("once"));
  assert.equal(allowed.ok, true);
  assert.deepEqual(calls, ["asked", "asked", "ran:export_video"]);
  // A token that may write (the chat inside EdiAula) runs it without asking.
  calls.length = 0;
  await guarded(
    { ...grant, scopes: ["read", "propose", "write"] },
    "export_video",
    { preset: "draft" },
    deps("once"),
  );
  assert.deepEqual(calls, ["ran:export_video"]);
});

test("without problems in the check, the person picks the destination and it is queued", async () => {
  const f = steps([warning]);
  const r = await runExportVideo(f.steps, "Aula.mp4");
  assert.deepEqual(r, {
    ok: true,
    id: "export-1",
    outPath: "C:\\Vídeos\\Aula.mp4",
    confirmed: false,
  });
  assert.deepEqual(f.log, ["check", "pick:Aula.mp4", "queue:C:\\Vídeos\\Aula.mp4"]);
});

test("with problems, the person confirms or nothing is exported", async () => {
  const no = steps([problem, warning], { confirm: false });
  const refused = await runExportVideo(no.steps, "Aula.mp4");
  assert.equal(refused.ok, false);
  assert.equal(!refused.ok && refused.reason, "refused");
  assert.deepEqual(no.log, ["check", "confirm:Falta a tela."]);

  const yes = steps([problem], { confirm: true });
  const confirmed = await runExportVideo(yes.steps, "Aula.mp4");
  assert.equal(confirmed.ok && confirmed.confirmed, true);
  assert.deepEqual(yes.log, [
    "check",
    "confirm:Falta a tela.",
    "pick:Aula.mp4",
    "queue:C:\\Vídeos\\Aula.mp4",
  ]);
});

test("closing the save dialog exports nothing", async () => {
  const f = steps([], { path: null });
  const r = await runExportVideo(f.steps, "Aula.mp4");
  assert.equal(!r.ok && r.reason, "cancelled");
  assert.deepEqual(f.log, ["check", "pick:Aula.mp4"]);
});

test("presets give the frame, bitrate and quality of the export dialog", () => {
  const wide = { width: 1920, height: 1080, fps: 30 };
  assert.deepEqual(presetSpec("youtube", wide, { encoder: "nvenc" }), {
    fps: 30,
    normalizeLoudness: true,
    encoder: "nvenc",
    width: 1920,
    height: 1080,
    videoBitrate: 12000,
    quality: "high",
    thumbnail: true,
  });
  assert.deepEqual(
    [
      presetSpec("draft", wide, { encoder: "x264" }).width,
      presetSpec("draft", wide, { encoder: "x264" }).height,
    ],
    [1280, 720],
  );
  const reels = presetSpec("reels", wide, { encoder: "x264" });
  assert.deepEqual([reels.width, reels.height, reels.vertical], [1080, 1920, "blur"]);
  const audio = presetSpec("audio", wide, { encoder: "x264" });
  assert.deepEqual([audio.audioOnly, audio.videoBitrate], [true, 0]);
  assert.equal(exportName('Aula: "1"/2', "audio", false), "Aula 12.mp3");
  assert.equal(exportName("Aula", "reels", true), "Aula (vertical).mp4");
});
