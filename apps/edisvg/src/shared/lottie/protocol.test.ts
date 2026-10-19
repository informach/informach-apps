import assert from "node:assert/strict";
import { test } from "node:test";
import { lottieFixture } from "../../../tests/lottieFixture";
import { inspectLottieCompatibility } from "./prepare";
import { readLottieTaskMessage } from "./protocol";

test("Lottie worker boundary validates discriminants, progress and exact UTF-8 byte budget", () => {
  const fixture = lottieFixture(),
    report = inspectLottieCompatibility(fixture.project, {
      artboardId: fixture.boardId,
      animationId: fixture.clipId,
    }),
    progress: number[] = [];
  assert.deepEqual(
    readLottieTaskMessage({ kind: "progress", completed: 1, total: 32 }, (done) =>
      progress.push(done),
    ),
    { done: false },
  );
  assert.deepEqual(progress, [1]);
  assert.deepEqual(readLottieTaskMessage({ kind: "report", report }), {
    done: true,
    value: { kind: "report", report },
  });
  const clip = fixture.project.motion.animations[0];
  assert.ok(clip);
  clip.frames = 360000;
  clip.mode = "ping-pong";
  const excessive = inspectLottieCompatibility(fixture.project, {
    artboardId: fixture.boardId,
    animationId: fixture.clipId,
    subdivisions: 4,
  });
  assert.equal(excessive.supported, false);
  assert.equal(readLottieTaskMessage({ kind: "report", report: excessive }).done, true);
  for (const raw of [
    { kind: "progress", completed: 33, total: 32 },
    { kind: "progress", completed: 1, total: Infinity },
    { kind: "export", report, content: "ã".repeat(4_000_001) },
    { kind: "export", report, content: "ok", path: "C:/arbitrary" },
    { kind: "unknown" },
  ])
    assert.throws(() => readLottieTaskMessage(raw));
  assert.throws(
    () => readLottieTaskMessage({ kind: "error", message: "Recusado", truncated: true }),
    /diagnóstico abreviado/,
  );
});
