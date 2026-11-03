import assert from "node:assert/strict";
import { test } from "node:test";
import { trackLabels } from "../src/shared/timeline.ts";
import {
  addTrackBeside,
  moveTrackBeside,
  removeEmptyTrack,
  renameTrack,
  setTrackFlags,
} from "../src/shared/trackOps.ts";
import type { Project, Track } from "../src/shared/types.ts";

const track = (id: string, kind: Track["kind"], extra: Partial<Track> = {}): Track => ({
  id,
  kind,
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const lesson = (): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [],
  tracks: [
    track("f5", "video", { name: "Faixa 5", locked: true }),
    track("f4", "video", { name: "Faixa 4" }),
    track("f3", "video", { name: "Faixa 3", locked: true }),
    track("a", "audio", { name: "Narração" }),
  ],
  clips: [{ id: "c", assetId: "x", trackId: "f4", start: 1, in: 0, duration: 2, volume: 1 }],
});
const order = (p: Project) => p.tracks.map((t) => t.id);

test("add_track: an empty track right below or above, of the reference's kind, named as the editor does", () => {
  const p = lesson();
  const below = addTrackBeside(p, "f4", "below");
  assert.ok(below.ok);
  assert.deepEqual(order(below.project), ["f5", "f4", below.track.id, "f3", "a"]);
  assert.equal(below.track.kind, "video");
  assert.equal(below.track.name, "Faixa 6");
  assert.equal(below.index, 2);
  assert.deepEqual(below.project.clips, p.clips, "no clip changes");
  // The labels count from the bottom: the ones above the new track go up by one.
  const labels = trackLabels(below.project.tracks);
  assert.deepEqual(
    ["f5", "f4", below.track.id, "f3", "a"].map((id) => labels.get(id)),
    ["F5", "F4", "F3", "F2", "F1"],
  );
  const above = addTrackBeside(p, "f4", "above", "audio", "Efeitos");
  assert.ok(above.ok);
  assert.deepEqual(order(above.project), ["f5", above.track.id, "f4", "f3", "a"]);
  assert.deepEqual([above.track.kind, above.track.name], ["audio", "Efeitos"]);
  assert.equal(addTrackBeside(p, "nao-existe", "below").ok, false);
});

test("move, rename, remove (empty only) and set_track, as the editor does", () => {
  const p = lesson();
  const moved = moveTrackBeside(p, "a", "above", "f4");
  assert.ok(moved.ok);
  assert.deepEqual(order(moved.project), ["f5", "a", "f4", "f3"]);
  assert.equal(moveTrackBeside(p, "f3", "above", "f5").ok, false, "a locked track stays");
  const named = renameTrack(p, "f4", "  Avatar  ");
  assert.ok(named.ok);
  assert.equal(named.track.name, "Avatar");
  assert.equal(renameTrack(p, "f4", "  ").ok, false);
  const full = removeEmptyTrack(p, "f4");
  assert.equal(full.ok, false);
  assert.match(full.ok ? "" : full.error, /tem 1 clipe/);
  const gone = removeEmptyTrack(p, "a");
  assert.ok(gone.ok);
  assert.deepEqual(order(gone.project), ["f5", "f4", "f3"]);
  assert.equal(removeEmptyTrack(p, "f5").ok, false, "a locked empty track is not removed");
  const quiet = setTrackFlags(p, "f3", { locked: false, muted: true });
  assert.ok(quiet.ok);
  assert.deepEqual(
    [quiet.track.locked, quiet.track.muted, quiet.track.hidden],
    [false, true, false],
  );
});
