import type { FrameEvent, FrameState } from "@shared/recording";
import { type ReactNode, useEffect, useState } from "react";
import { DrawLayer } from "./DrawLayer";
import { RegionFrame } from "./RegionFrame";

/**
 * The window over the recorded screen while the controls are on another monitor
 * (main/recorderWindow.ts): the region's outline and handles, the countdown and the drawing.
 * Everything it shows comes from the controls window, and what is done on it goes back there;
 * the screen under it takes every click except on the handles and while drawing.
 */
export function RecorderFrame(): ReactNode {
  const [state, setState] = useState<FrameState | null>(null);
  useEffect(() => {
    document.documentElement.classList.add("is-recorder");
    const off = window.api.recorder.onFrameState(setState);
    void window.api.recorder.frameInit().then((s) => {
      if (s) setState((now) => now ?? s);
    });
    return off;
  }, []);
  const send = (event: FrameEvent): void => {
    void window.api.recorder.frameEvent(event);
  };
  // The handles hand the mouse back to the screen once they are left, whatever ends their use.
  const editable = !!state?.editable;
  useEffect(() => {
    if (!editable) void window.api.recorder.interactive(false);
  }, [editable]);
  if (!state?.visible) return null;
  return (
    <div className={`rec-root ${state.countdown !== null ? "is-countdown" : ""}`}>
      <RegionFrame
        region={state.region}
        onChange={(rect) => send({ type: "region", rect })}
        editable={state.editable}
        recording={state.recording}
        size={state.size}
        lock={state.lock}
        onLock={(on) => send({ type: "lock", on })}
        onSize={(size) => send({ type: "size", size })}
        onHover={(on) => void window.api.recorder.interactive(on)}
      />
      {state.draw.allowed && (
        <DrawLayer
          region={state.region}
          on={state.draw.on}
          live={state.recording}
          palette={state.draw.palette}
          toggleKey={state.draw.toggleKey}
          onExit={() => send({ type: "drawExit" })}
        />
      )}
      {state.countdown !== null && <div className="rec-countdown">{state.countdown}</div>}
    </div>
  );
}
