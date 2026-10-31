import { parseAnimationArtifact } from "./animationArtifact";
import { type BehaviorDebug, createVisualSvgPlayerAsync } from "./interactiveRuntime";
import type { WebAnimationHandle, WebAnimationOptions, WebAnimationState } from "./webPlayerTypes";

export { normalizeWebAnimation, readWebAnimation, webAnimationPoster } from "./webPlayerData";
export type {
  WebAnimationEvent,
  WebAnimationHandle,
  WebAnimationInfo,
  WebAnimationOptions,
  WebAnimationState,
  WebAnimationValue,
} from "./webPlayerTypes";

/** Portable entrypoint: public artwork names, same renderer/interpreter, no editor dependency. */
export async function mountWebAnimation(
  root: SVGSVGElement,
  input: unknown,
  options: WebAnimationOptions = {},
): Promise<WebAnimationHandle> {
  options.signal?.throwIfAborted();
  const artifact = parseAnimationArtifact(input);
  const inputs = new Map(artifact.document.behavior.inputs.map((value) => [value.name, value]));
  const machines = new Map(artifact.document.behavior.machines.map((value) => [value.name, value]));
  let live = true;
  let player: Awaited<ReturnType<typeof createVisualSvgPlayerAsync>> | undefined;
  function current() {
    if (!live || !player) throw new Error("A animação foi encerrada.");
    return player;
  }
  function inputByName(name: string) {
    const result = inputs.get(name);
    if (!result) throw new Error(`Controle não encontrado na animação: ${name}`);
    return result;
  }
  function state(snapshot: BehaviorDebug): WebAnimationState {
    const machine = artifact.document.behavior.machines.find(
      (value) => value.id === snapshot.machineId,
    );
    return {
      machine: machine?.name ?? null,
      time: snapshot.time,
      playing: player?.playing ?? false,
      layers: snapshot.layers.map((value) => {
        const layer = machine?.layers.find((layer) => layer.id === value.id);
        return {
          name: layer?.name ?? value.id,
          state: layer?.states.find((item) => item.id === value.stateId)?.name ?? value.stateId,
          time: value.time,
        };
      }),
    };
  }
  player = await createVisualSvgPlayerAsync(
    root,
    artifact.document,
    {
      autoplay: options.autoplay ?? artifact.autoplay,
      respectReducedMotion: options.respectReducedMotion ?? artifact.respectReducedMotion,
      pauseOffscreen: options.pauseOffscreen ?? artifact.pauseOffscreen,
      onEvent: (value) => {
        if (live)
          options.onEvent?.({
            name: value.name,
            data: value.data,
            direction: value.direction,
            time: value.time,
            instancePath: value.instancePath ?? [],
          });
      },
      onStateChange: (value) => {
        if (live && player) options.onStateChange?.(state(value));
      },
      onError: (error) => {
        if (live) options.onError?.(error);
      },
    },
    options.signal,
  );
  const instance = player;
  root.setAttribute(
    "preserveAspectRatio",
    artifact.fit === "stretch"
      ? "none"
      : artifact.fit === "cover"
        ? "xMidYMid slice"
        : "xMidYMid meet",
  );
  let closing: Promise<void> | undefined;
  function destroy() {
    if (!closing) {
      live = false;
      options.signal?.removeEventListener("abort", aborted);
      closing = instance.destroyAsync();
    }
    return closing;
  }
  function aborted() {
    void destroy().catch((error) => options.onError?.(error));
  }
  if (options.signal?.aborted) {
    await destroy();
    options.signal.throwIfAborted();
  }
  options.signal?.addEventListener("abort", aborted, { once: true });
  return {
    get playing() {
      return current().playing;
    },
    play() {
      current().play();
    },
    pause() {
      current().pause();
    },
    reset() {
      current().reset();
    },
    setInput(name, value) {
      current().setInput(inputByName(name).id, value);
    },
    setInputs(values) {
      current().setInputs(
        Object.fromEntries(
          Object.entries(values).map(([name, value]) => [inputByName(name).id, value]),
        ),
      );
    },
    getInput(name) {
      return current().getInput(inputByName(name).id);
    },
    trigger(name) {
      current().trigger(inputByName(name).id);
    },
    setMachine(name) {
      const machine = machines.get(name);
      if (!machine) throw new Error(`Máquina não encontrada na animação: ${name}`);
      current().setMachine(machine.id);
    },
    setPolicy(policy) {
      current().setPolicy(policy);
    },
    advance(seconds) {
      current().advance(seconds);
    },
    inspect() {
      return state(current().inspect());
    },
    destroy,
  };
}
