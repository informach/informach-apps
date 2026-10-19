import { createFrameLoop } from "../src/frameLoop";

/** Browser integration entry, outside exports and production bundles. */
export function runSchedulerScenario() {
  const root = document.querySelector("svg");
  if (!root) throw new Error("Missing SVG");
  const errors: string[] = [];
  let rejected = false;
  try {
    createFrameLoop(
      root,
      {
        paint() {
          throw new Error("initial paint failed");
        },
        advance() {
          return true;
        },
      },
      {
        onError(error) {
          errors.push(error.message);
        },
        pauseOffscreen: false,
      },
    );
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "initial paint failed") throw error;
    rejected = true;
  }
  let bad = false;
  const loop = createFrameLoop(
    root,
    {
      paint() {
        if (bad) throw new Error("updated paint failed");
      },
      advance() {
        return true;
      },
    },
    {
      autoplay: false,
      pauseOffscreen: false,
      onError(error) {
        errors.push(error.message);
      },
    },
  );
  bad = true;
  let updatedRejected = false;
  try {
    loop.invalidate();
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "updated paint failed") throw error;
    updatedRejected = true;
  }
  const playing = loop.playing;
  loop.destroy();
  loop.destroy();
  return { rejected, updatedRejected, playing, errors };
}
Reflect.set(window, "runSchedulerScenario", runSchedulerScenario);
