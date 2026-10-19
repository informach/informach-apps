"use client";

import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { AudioControlHandle, AudioCueEmission } from "./audio/model";
import type { BehaviorEmission } from "./behavior/engine";
import type { InputValue } from "./behavior/model";
import type { DataChange, DataValue } from "./data";
import type { InteractiveDocument } from "./interactiveDocument";
import { documentAudioAssets } from "./interactiveResources";
import {
  type BehaviorDebug,
  type createInteractiveSvgPlayer,
  createInteractiveSvgPlayerAsync,
} from "./interactiveRuntime";
import { AudioControls } from "./reactAudio";
import type { RigDiagnostic } from "./rig/playbackRig";

export { AudioControls } from "./reactAudio";
export { VisualArtwork } from "./visual/react";

export interface EdiSvgComponentHandle {
  readonly playing: boolean;
  play(): void;
  pause(): void;
  reset(): void;
  setMachine(id: string): void;
  trigger(id: string): void;
  setInput(id: string, value: unknown): void;
  setInputs(values: Readonly<Record<string, unknown>>): void;
  getInput(id: string): InputValue | undefined;
  inspect(): BehaviorDebug;
  inspectRig(): RigDiagnostic[];
  advance(seconds: number): void;
  getData(instanceId: string, path?: readonly string[]): DataValue;
  editData(changes: readonly DataChange[]): void;
}
export interface EdiSvgHandle extends EdiSvgComponentHandle, AudioControlHandle {
  getComponent(instancePath: readonly string[]): EdiSvgComponentHandle;
}
export interface EdiSvgPlayerProps {
  document: InteractiveDocument;
  /** Trusted host-authored geometry, with validated data-edi-object wrappers.
   * Use compiler-generated JSX; never convert user markup to unsafe HTML. */
  children: ReactNode;
  viewBox: string;
  title: string;
  fit?: "contain" | "cover" | "stretch";
  machineId?: string;
  inputValues?: Readonly<Record<string, InputValue>>;
  autoplay?: boolean;
  respectReducedMotion?: boolean;
  pauseOffscreen?: boolean;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<EdiSvgHandle>;
  onEvent?: (event: BehaviorEmission) => void;
  onAudioCue?: (cue: AudioCueEmission) => void;
  onInputChange?: (id: string, value: InputValue) => void;
  onStateChange?: (snapshot: BehaviorDebug) => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
}
/** React 19 adapter. Document/geometry identity owns a player; props update
 * typed inputs atomically. Event callbacks always see current host props.
 * The runtime owns the SVG after mount; host geometry must stay immutable. */
export function EdiSvgPlayer(props: EdiSvgPlayerProps) {
  const [owner, setOwner] = useState(() => ({ document: props.document, epoch: 0 }));
  // Document identity owns DOM as well as clocks. Reset the inner subtree via
  // React's keyed ownership pattern, before any old runtime-mutated nodes can
  // be reused for a new document. Input/callback-only updates retain the key.
  if (owner.document !== props.document)
    setOwner({ document: props.document, epoch: owner.epoch + 1 });
  return <MountedEdiSvgPlayer key={owner.epoch} {...props} />;
}
function MountedEdiSvgPlayer({
  document,
  children,
  viewBox,
  title,
  fit = "contain",
  machineId,
  inputValues,
  autoplay = true,
  respectReducedMotion = true,
  pauseOffscreen = true,
  className,
  style,
  ref,
  onEvent,
  onAudioCue,
  onInputChange,
  onStateChange,
  onReady,
  onError,
}: EdiSvgPlayerProps) {
  const root = useRef<SVGSVGElement>(null),
    player = useRef<ReturnType<typeof createInteractiveSvgPlayer> | null>(null),
    [error, setError] = useState<string | null>(null),
    [instance, setInstance] = useState<ReturnType<typeof createInteractiveSvgPlayer> | null>(null),
    announced = useRef<ReturnType<typeof createInteractiveSvgPlayer> | null>(null);
  const transport = useRef<{
    instance: ReturnType<typeof createInteractiveSvgPlayer>;
    autoplay: boolean;
  } | null>(null);
  const event = useEffectEvent((value: BehaviorEmission) => onEvent?.(value)),
    audioCue = useEffectEvent((value: AudioCueEmission) => onAudioCue?.(value)),
    changed = useEffectEvent((id: string, value: InputValue) => onInputChange?.(id, value)),
    state = useEffectEvent((value: BehaviorDebug) => onStateChange?.(value)),
    ready = useEffectEvent(() => onReady?.()),
    failure = useEffectEvent((error: Error) => {
      setError(error.message);
      onError?.(error);
    });
  useImperativeHandle(ref, () => {
    const current = () => {
      const value = player.current;
      if (!value) throw new Error("O player React ainda não está montado ou já foi encerrado.");
      return value;
    };
    return {
      enableAudio() {
        return current().enableAudio();
      },
      disableAudio() {
        current().disableAudio();
      },
      setAudioVolume(value) {
        current().setAudioVolume(value);
      },
      inspectAudio() {
        return current().inspectAudio();
      },
      onAudioCue(callback) {
        return current().onAudioCue(callback);
      },
      onAudioStateChange(callback) {
        return current().onAudioStateChange(callback);
      },
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
      setMachine(id) {
        current().setMachine(id);
      },
      trigger(id) {
        current().trigger(id);
      },
      setInput(id, value) {
        current().setInput(id, value);
      },
      setInputs(values) {
        current().setInputs(values);
      },
      getInput(id) {
        return current().getInput(id);
      },
      inspect() {
        return current().inspect();
      },
      inspectRig() {
        return current().inspectRig();
      },
      advance(seconds) {
        current().advance(seconds);
      },
      getData(instanceId, path) {
        return current().getData(instanceId, path);
      },
      editData(changes) {
        current().editData(changes);
      },
      getComponent(instancePath) {
        return current().getComponent(instancePath);
      },
    };
  }, []);
  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    let live = true;
    const owner = new AbortController();
    setInstance(null);
    async function mount(svg: SVGSVGElement) {
      try {
        const instance = await createInteractiveSvgPlayerAsync(
          svg,
          document,
          {
            autoplay: false,
            onEvent: (value) => {
              if (live) event(value);
            },
            onAudioCue: (value) => {
              if (live) audioCue(value);
            },
            onStateChange: (value) => {
              if (live) state(value);
            },
            onError: (error) => {
              if (live) failure(error);
            },
          },
          owner.signal,
        );
        player.current = instance;
        setInstance(instance);
        instance.onInputChange((id, value) => {
          if (live) changed(id, value);
        });
        setError(null);
      } catch (error) {
        if (!live) return;
        failure(
          error instanceof Error ? error : new Error("Não foi possível montar o player React."),
        );
      }
    }
    void mount(svg);
    return () => {
      live = false;
      owner.abort();
      player.current?.destroy();
      player.current = null;
    };
  }, [document]);
  useEffect(() => {
    if (!instance || instance !== player.current) return;
    try {
      instance.setPolicy({ respectReducedMotion, pauseOffscreen });
      if (machineId !== undefined && instance.inspect().machineId !== machineId)
        instance.setMachine(machineId);
      if (inputValues) instance.setInputs(inputValues);
      if (transport.current?.instance !== instance || transport.current.autoplay !== autoplay) {
        if (autoplay) instance.play();
        else instance.pause();
        transport.current = { instance, autoplay };
      }
      setError(null);
      if (announced.current !== instance) {
        announced.current = instance;
        ready();
      }
    } catch (error) {
      failure(error instanceof Error ? error : new Error("Inputs React inválidos."));
    }
  }, [inputValues, instance, machineId, autoplay, respectReducedMotion, pauseOffscreen]);
  return (
    <div className={className} style={style}>
      <svg
        ref={root}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={viewBox}
        aria-label={title}
        preserveAspectRatio={
          fit === "stretch" ? "none" : fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"
        }
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <title>{title}</title>
        {children}
      </svg>
      {!!documentAudioAssets(document).length && (
        <AudioControls
          player={instance}
          report={onError}
          replay={() => {
            if (instance) {
              instance.reset();
              instance.play();
            }
          }}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
