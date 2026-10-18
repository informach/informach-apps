import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISK_PAUSE_BYTES,
  DISK_STOP_BYTES,
  diskPlan,
  FrameWatch,
  finalizeReserve,
  pcmLevels,
  SilenceMeter,
  WARMUP_SECONDS,
} from "../src/shared/recordingHealth.ts";

const MB = 1024 ** 2;

test("no frame alarm during the warm-up, then only frames lost since it ended", () => {
  const watch = new FrameWatch(30);
  // The encoder starts 20 frames behind the clock (its pipeline, the first-frame estimate).
  assert.deepEqual(watch.update({ seconds: 5, frame: 130, dup: 0, drop: 0, speed: 0.5 }), {
    lost: 0,
    slow: false,
    warm: false,
  });
  const after = WARMUP_SECONDS + 1;
  assert.equal(
    watch.update({ seconds: after, frame: after * 30 - 20, dup: 0, drop: 0, speed: 1 }).lost,
    0,
  );
  // Falling 12 frames further behind, plus what FFmpeg itself dropped.
  const later = watch.update({
    seconds: after + 10,
    frame: (after + 10) * 30 - 32,
    dup: 1,
    drop: 2,
    speed: 1,
  });
  assert.equal(later.lost, 15);
});

test("the machine does not keep up only after 5 s below real time, by the recent speed", () => {
  const watch = new FrameWatch(30);
  const at = (seconds: number, speed: number | null) =>
    watch.update({ seconds, frame: seconds * 30, dup: 0, drop: 0, speed });
  assert.equal(at(13, 0.9).slow, false);
  assert.equal(at(17, 0.9).slow, false);
  assert.equal(at(18.5, 0.9).slow, true);
  // Back to real time (or not known): the count starts over.
  assert.equal(at(19, 1).slow, false);
  assert.equal(at(25, null).slow, false);
});

test("the disk keeps what finishing the take needs: the sound again, and the screen to join it", () => {
  const needed = Math.ceil(100 * MB * 1.1) + 20 * MB;
  assert.deepEqual(finalizeReserve({ screen: 1000 * MB, audio: 100 * MB }), {
    needed,
    join: needed + Math.ceil(1000 * MB * 1.1),
  });
  const sizes = { screen: 2000 * MB, audio: 200 * MB };
  const reserve = finalizeReserve(sizes).needed;
  // 100 MB free used to be "stop"; now the sound's reserve comes first.
  assert.equal(diskPlan(reserve + DISK_STOP_BYTES - 1, 1 * MB, sizes).action, "stop");
  assert.equal(diskPlan(reserve + DISK_PAUSE_BYTES - 1, 1 * MB, sizes).action, "pause");
  const plenty = diskPlan(reserve + 20_000 * MB, 1 * MB, sizes);
  assert.equal(plenty.action, "ok");
  assert.equal(plenty.joinFits, true);
  // Room to finish but not to join the screen: said ahead of time.
  const tight = diskPlan(reserve + 1000 * MB, 0.1 * MB, sizes);
  assert.equal(tight.joinFits, false);
  // Minutes left count what can still be recorded.
  assert.equal(Math.round(diskPlan(reserve + 600 * MB, 1 * MB, sizes).minutesLeft ?? 0), 10);
  assert.equal(diskPlan(reserve + 600 * MB, 1 * MB, sizes).action, "ok");
  assert.equal(diskPlan(reserve + 590 * MB, 1 * MB, sizes).action, "warn");
});

test("microphone levels and silence", () => {
  const loud = new Uint8Array(8);
  new DataView(loud.buffer).setInt16(0, 16384, true);
  assert.deepEqual(pcmLevels(loud), { peak: 0.5, rms: 0.25 });
  const meter = new SilenceMeter();
  meter.add(0.0001, 6);
  assert.equal(meter.add(0.0001, 5), 11);
  assert.equal(meter.add(0.2, 0.1), 0);
});
