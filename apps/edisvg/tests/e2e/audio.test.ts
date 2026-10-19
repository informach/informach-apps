import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { assetTestBundle } from "../assetBundle";
import { audioFixture } from "../assetFixtures";
import { audioProjectFixture } from "../audioFixture";
import { independentComponentsFixture } from "../componentFixture";

test("real offline Web Audio mixes PCM, normalizes headroom, bounds polyphony, reuses buffers and releases voice/context ownership", {
  timeout: 60000,
}, async () => {
  const code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent("<main>Offline audio</main>");
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(async (asset) => {
      const api = window.EdiAssetTest;
      if (!api) throw new Error("Missing actual audio API");
      const asyncErrors: string[] = [],
        context = new OfflineAudioContext(1, 1000, 8000),
        mixer = api.createBrowserAudioMixer([asset], {
          context,
          onError(error) {
            asyncErrors.push(error.message);
          },
        }),
        disabled = mixer.play(asset.id) === null && mixer.inspect().buffers === 0;
      await mixer.enable();
      mixer.disable();
      await mixer.enable();
      mixer.play(asset.id, 0.5);
      mixer.play(asset.id, 0.5);
      mixer.onChange((status) => {
        if (status.activeVoices === 0 && status.buffers === 1)
          throw new Error("Observer failure after actual audio ends");
      });
      const before = mixer.inspect(),
        rendered = await context.startRendering(),
        samples = rendered.getChannelData(0);
      let peak = 0,
        tail = 0;
      for (let i = 0; i < samples.length; i++) {
        peak = Math.max(peak, Math.abs(samples[i] ?? 0));
        if (i >= 800) tail += Math.abs(samples[i] ?? 0);
      }
      await mixer.destroy();
      await mixer.destroy();
      const boundedContext = new OfflineAudioContext(1, 1000, 8000),
        bounded = api.createBrowserAudioMixer([asset], { context: boundedContext });
      const changes: { time: number; voices: number; state: string }[] = [];
      bounded.onChange((status) =>
        changes.push({
          time: boundedContext.currentTime,
          voices: status.activeVoices,
          state: status.contextState,
        }),
      );
      await bounded.enable();
      for (let i = 0; i < 40; i++) bounded.play(asset.id, 1);
      bounded.play(asset.id, 1, 1);
      const polyphony = bounded.inspect(),
        output = await boundedContext.startRendering();
      let boundedPeak = 0,
        boundedAt = 0;
      const blocks: number[] = [];
      for (const [index, sample] of output.getChannelData(0).entries()) {
        if (Math.abs(sample) > boundedPeak) {
          boundedPeak = Math.abs(sample);
          boundedAt = index;
        }
        blocks[Math.floor(index / 128)] = Math.max(
          blocks[Math.floor(index / 128)] ?? 0,
          Math.abs(sample),
        );
      }
      await bounded.destroy();
      let disposed = false;
      try {
        bounded.play(asset.id);
      } catch {
        disposed = true;
      }
      const lazy = api.createBrowserAudioMixer([asset]);
      const lazyState = lazy.inspect();
      await lazy.destroy();
      return {
        disabled,
        asyncErrors,
        before,
        peak,
        tail,
        after: mixer.inspect(),
        polyphony,
        boundedPeak,
        boundedAt,
        blocks,
        changes,
        disposed,
        lazyState,
      };
    }, audioFixture());
    assert.equal(result.disabled, true);
    assert.ok(result.asyncErrors.length > 0);
    assert.equal(result.before.activeVoices, 2);
    assert.equal(result.before.buffers, 1);
    assert.ok(Math.abs(result.peak - 0.5) < 0.0001);
    assert.equal(result.tail, 0);
    assert.equal(result.after.destroyed, true);
    assert.equal(result.after.activeVoices, 0);
    assert.equal(result.after.buffers, 0);
    assert.equal(result.polyphony.activeVoices, 32);
    assert.equal(result.polyphony.stolenVoices, 8);
    assert.equal(result.polyphony.skippedLate, 1);
    assert.equal(result.polyphony.buffers, 1);
    assert.ok(
      result.boundedPeak <= 0.5001,
      JSON.stringify({
        peak: result.boundedPeak,
        at: result.boundedAt,
        blocks: result.blocks,
        changes: result.changes.slice(-12),
      }),
    );
    assert.equal(result.disposed, true);
    assert.equal(result.lazyState.contextState, "not-created");
  } finally {
    await browser.close();
  }
});

test("component audio owns scoped voices, preserves captions while muted and survives destruction from inside a cue callback", {
  timeout: 60000,
}, async () => {
  const fixture = independentComponentsFixture(),
    asset = audioFixture(8000),
    master = fixture.project.artboards.find((board) => board.id === fixture.masterId);
  if (!master) throw new Error("Missing master");
  fixture.project.assets = [asset];
  master.audio = {
    version: 1,
    bindings: [
      {
        id: "audio-wave",
        eventId: "event-wave",
        assetId: asset.id,
        volume: 0.5,
        caption: "Aceno confirmado",
      },
    ],
  };
  const compiled = compileInteractiveArtboard(fixture.project, fixture.rootId),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(compiled.svg);
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(async (document) => {
      const api = window.EdiAssetTest,
        root = window.document.querySelector("svg");
      if (!api || !root) throw new Error("Missing actual player");
      const context = new OfflineAudioContext(1, 8000, 8000),
        player = await api.createInteractiveSvgPlayerAsync(root, document, {
          autoplay: false,
          pauseOffscreen: false,
          audioContext: context,
        }),
        paths = document.components?.map((component) => component.instancePath) ?? [],
        a = player.getComponent(paths[0] ?? []),
        b = player.getComponent(paths[1] ?? []),
        captions: string[][] = [];
      player.onAudioCue((cue) => captions.push(cue.instancePath));
      await player.enableAudio();
      a.trigger("input-click");
      b.trigger("input-click");
      player.advance(0.2);
      const both = player.inspectAudio();
      a.pause();
      const isolated = player.inspectAudio();
      b.reset();
      const stopped = player.inspectAudio();
      await player.destroyAsync();
      const host = window.document.createElement("div");
      host.innerHTML = root.outerHTML;
      window.document.body.append(host);
      const svg = host.querySelector("svg");
      if (!svg) throw new Error("Missing reentrant host");
      const other = await api.createInteractiveSvgPlayerAsync(svg, document, {
        autoplay: false,
        pauseOffscreen: false,
      });
      let cues = 0,
        events = 0,
        terminal = 0,
        teardown: Promise<void> | undefined;
      other.onAudioCue(() => {
        cues++;
        teardown = other.destroyAsync();
      });
      other.onEvent(() => {
        events++;
      });
      other.onAudioStateChange((status) => {
        if (status.destroyed) {
          terminal++;
          other.destroy();
        }
      });
      other.getComponent(paths[0] ?? []).trigger("input-click");
      other.getComponent(paths[1] ?? []).trigger("input-click");
      other.advance(0.2);
      await teardown;
      await other.destroyAsync();
      let closed = false;
      try {
        other.advance(0.1);
      } catch {
        closed = true;
      }
      return { both, isolated, stopped, captions, paths, cues, events, terminal, closed };
    }, compiled.document);
    assert.equal(result.both.activeVoices, 2);
    assert.equal(result.both.buffers, 1);
    assert.equal(result.isolated.activeVoices, 1);
    assert.equal(result.stopped.activeVoices, 0);
    assert.deepEqual(result.captions, result.paths);
    assert.equal(result.cues, 1);
    assert.equal(result.events, 0);
    assert.equal(result.terminal, 1);
    assert.equal(result.closed, true);
  } finally {
    await browser.close();
  }
});

test("interactive audio emits captions while muted, catches up real samples after enable and enforces cue budgets before publishing clocks", {
  timeout: 60000,
}, async () => {
  const fixture = audioProjectFixture(),
    compiled = compileInteractiveArtboard(fixture.project, fixture.boardId, {
      animationId: "animation-tone",
    }),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(`<main>${compiled.svg}</main>`);
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(async (document) => {
      const api = window.EdiAssetTest,
        svg = window.document.querySelector("svg");
      if (!api || !svg) throw new Error("Missing audio player host");
      const context = new OfflineAudioContext(1, 1000, 8000),
        captions: string[] = [],
        player = await api.createInteractiveSvgPlayerAsync(svg, document, {
          autoplay: false,
          pauseOffscreen: false,
          audioContext: context,
          onAudioCue(cue) {
            captions.push(cue.caption);
          },
        });
      player.advance(0.11);
      const muted = player.inspectAudio();
      player.reset();
      await player.enableAudio();
      player.advance(0.11);
      const active = player.inspectAudio(),
        output = await context.startRendering();
      let energy = 0;
      for (const sample of output.getChannelData(0)) energy += sample * sample;
      await player.destroyAsync();
      const other = window.document.createElement("div");
      other.innerHTML = svg.outerHTML;
      window.document.body.append(other);
      const second = other.querySelector("svg");
      if (!second) throw new Error("Missing budget host");
      const crowded = structuredClone(document),
        binding = crowded.audio?.bindings[0];
      if (!binding) throw new Error("Missing cue");
      crowded.audio = {
        version: 1,
        bindings: Array.from({ length: 129 }, (_, index) => ({ ...binding, id: `audio-${index}` })),
      };
      const blocked = await api.createInteractiveSvgPlayerAsync(second, crowded, {
        autoplay: false,
        pauseOffscreen: false,
      });
      let rejected = false;
      try {
        blocked.advance(0.11);
      } catch (error) {
        rejected = error instanceof Error && error.message.includes("128");
      }
      const unchanged = blocked.time === 0 && blocked.inspectAudio().activeVoices === 0;
      await blocked.destroyAsync();
      return { captions, muted, active, energy, rejected, unchanged };
    }, compiled.document);
    assert.deepEqual(result.captions, ["Tom de confirmação", "Tom de confirmação"]);
    assert.equal(result.muted.enabled, false);
    assert.equal(result.muted.buffers, 0);
    assert.equal(result.active.activeVoices, 1);
    assert.ok(result.energy > 10);
    assert.equal(result.rejected, true);
    assert.equal(result.unchanged, true);
  } finally {
    await browser.close();
  }
});
