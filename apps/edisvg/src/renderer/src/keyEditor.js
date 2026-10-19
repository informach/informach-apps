import { mountKeyDialog, mountRetimeDialog } from "./key-dialog";
import { activeTimelineClip as activeClip } from "./timelineState";

let gesture;
let dialogDraft;
export function disposeKeyGesture() {
  gesture?.();
  gesture = null;
  dialogDraft?.();
  dialogDraft = null;
}
function selected(state) {
  const clip = activeClip(state);
  const selection = clip?.keyIndex.get(state.selectedKey?.keyId);
  if (!clip || !selection || selection.track.id !== state.selectedKey?.trackId)
    throw new Error("Selecione uma chave na timeline.");
  return { clip, ...selection };
}
const focusKey = (id) => {
  const key =
    typeof id === "string" ? document.querySelector(`[data-clip-key="${CSS.escape(id)}"]`) : null;
  (key ?? document.querySelector("[data-timeline-panel]"))?.focus();
};

export function selectedKeyIds(state) {
  const clip = activeClip(state);
  return [
    ...new Set(
      state.selectedKeys?.length
        ? state.selectedKeys
        : state.selectedKey
          ? [state.selectedKey.keyId]
          : [],
    ),
  ].filter((id) => clip?.keyIndex.has(id));
}
export function selectedKeyReferences(state) {
  const clip = activeClip(state);
  return clip ? selectedKeyIds(state).map((id) => clip.keyIndex.get(id).reference) : [];
}
/** Delegated listeners survive virtual rows. A gesture owns previews, never data. */
export function bindKeyEditing(state, { transact, render, notify, seek }) {
  const container = document.querySelector("[data-timeline-panel]");
  if (!container) return;
  container.tabIndex = -1;
  const elementFor = (event) =>
    event.target instanceof Element ? event.target.closest("[data-clip-key]") : null;
  const choose = (element, event, frame) => {
    const id = element.dataset.clipKey,
      ids = selectedKeyIds(state);
    state.selectedKeys =
      event.shiftKey || event.ctrlKey || event.metaKey
        ? ids.includes(id)
          ? ids.filter((key) => key !== id)
          : [...ids, id]
        : event.keepSelection
          ? ids
          : [id];
    state.selectedKey = state.selectedKeys.length
      ? { trackId: element.dataset.clipTrack, keyId: state.selectedKeys.at(-1) }
      : null;
    // Primary selection must identify the actual final key, also across tracks.
    if (state.selectedKey)
      state.selectedKey.trackId = activeClip(state).keyIndex.get(state.selectedKey.keyId).track.id;
    const track = activeClip(state).tracks.find((track) => track.id === element.dataset.clipTrack);
    state.selectedIds = [...track.definition.ownerIds];
    state.selected = state.selectedIds[0];
    seek(frame);
    focusKey(id);
  };
  container.onclick = (event) => {
    const element = elementFor(event);
    if (element && event.detail === 0) choose(element, event, Number(element.dataset.clipFrame));
  };
  container.onkeydown = (event) => {
    const element = elementFor(event);
    if (!element || event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    choose(element, event, Number(element.dataset.clipFrame));
    openKeyDialog(state, { transact, render, notify });
  };
  container.onpointerdown = (event) => {
    const element = elementFor(event);
    if (!element || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    disposeKeyGesture();
    const initial = Number(element.dataset.clipFrame);
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      choose(element, event, initial);
      return;
    }
    const clip = activeClip(state),
      ids = selectedKeyIds(state);
    if (!clip?.keyIndex.has(element.dataset.clipKey)) return;
    const selectedIds = ids.includes(element.dataset.clipKey) ? ids : [element.dataset.clipKey];
    const selectedSet = new Set(selectedIds);
    const all = selectedIds.map((id) => clip.keyIndex.get(id).key);
    const min = all.reduce((value, key) => Math.min(value, key.frame), Infinity),
      max = all.reduce((value, key) => Math.max(value, key.frame), -Infinity);
    const bounds = element.parentElement.getBoundingClientRect();
    const previews = [...container.querySelectorAll("[data-clip-key]")]
      .filter((item) => selectedSet.has(item.dataset.clipKey))
      .map((item) => ({
        element: item,
        left: item.style.left,
        frame: Number(item.dataset.clipFrame),
      }));
    let delta = 0,
      finished = false;
    const cleanup = () => {
      gesture = null;
      container.onpointermove =
        container.onpointerup =
        container.onpointercancel =
        container.onlostpointercapture =
          null;
      document.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("blur", cancel);
      for (const item of previews) item.element.style.left = item.left;
      if (container.hasPointerCapture(event.pointerId))
        container.releasePointerCapture(event.pointerId);
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      cleanup();
    };
    const keyboard = (key) => {
      if (key.key === "Escape") {
        key.preventDefault();
        key.stopImmediatePropagation();
        cancel();
      }
    };
    gesture = cancel;
    document.addEventListener("keydown", keyboard, true);
    window.addEventListener("blur", cancel);
    container.setPointerCapture(event.pointerId);
    container.onpointermove = (move) => {
      delta = Math.max(
        -min,
        Math.min(
          clip.frames - max,
          Math.round(((move.clientX - event.clientX) / bounds.width) * clip.frames),
        ),
      );
      for (const item of previews)
        item.element.style.left = `${((item.frame + delta) / clip.frames) * 100}%`;
    };
    container.onpointerup = (up) => {
      if (finished) return;
      container.onpointermove(up);
      finished = true;
      cleanup();
      try {
        state.selectedKeys = selectedIds;
        state.selectedKey = { trackId: element.dataset.clipTrack, keyId: element.dataset.clipKey };
        if (delta)
          transact([
            {
              type: "animation-keys",
              command: {
                operation: "move",
                animationId: clip.id,
                references: selectedIds.map((id) => clip.keyIndex.get(id).reference),
                deltaFrames: delta,
                scale: 1,
                anchorFrame: 0,
              },
            },
          ]);
        choose(element, { keepSelection: delta !== 0 }, initial + delta);
      } catch (error) {
        notify(error.message);
        render();
        focusKey(element.dataset.clipKey);
      }
    };
    container.onpointercancel = container.onlostpointercapture = cancel;
  };
}
export function openRetimeDialog(state, { transact, render, notify }) {
  const ids = selectedKeyIds(state),
    clip = activeClip(state);
  if (!clip || !ids.length) {
    notify("Selecione uma ou mais chaves; Shift/Ctrl adiciona à seleção.");
    return;
  }
  const references = ids.map((id) => clip.keyIndex.get(id).reference);
  state.playing = false;
  render();
  dialogDraft = mountRetimeDialog(
    document.querySelector("#clip-dialog"),
    {
      clip,
      references,
      apply(command) {
        transact([command]);
        render();
      },
    },
    () => focusKey(state.selectedKey?.keyId),
  );
}

function revealKey(state, id) {
  const clip = activeClip(state),
    selection = clip?.keyIndex.get(id),
    container = document.querySelector("[data-timeline-panel]"),
    body = container?.parentElement,
    width = Number(container?.querySelector("#playhead")?.dataset.timelineWidth);
  if (!clip || !selection || !body || !Number.isFinite(width) || width <= 0) return;
  const label = parseFloat(getComputedStyle(body).getPropertyValue("--track-label")) || 260,
    available = Math.max(1, body.clientWidth - label - 20),
    left = (selection.key.frame / clip.frames) * width,
    row = (clip.tracks.indexOf(selection.track) + 1) * 24;
  if (left < body.scrollLeft + 8 || left > body.scrollLeft + available - 8)
    body.scrollLeft = Math.max(0, left - available / 2);
  if (row < body.scrollTop || row + 24 > body.scrollTop + body.clientHeight)
    body.scrollTop = Math.max(0, row - body.clientHeight / 2);
}

export function openKeyDialog(state, { transact, render, notify }) {
  let selection;
  try {
    selection = selected(state);
  } catch (error) {
    notify(error.message);
    return;
  }
  const id = state.selectedKey.keyId;
  state.playing = false;
  render();
  dialogDraft = mountKeyDialog(
    document.querySelector("#clip-dialog"),
    {
      clip: selection.clip,
      selection,
      apply(command) {
        transact([command]);
        state.frame = command.command.frame;
        revealKey(state, id);
        render();
        focusKey(id);
      },
    },
    () => focusKey(id),
  );
}
