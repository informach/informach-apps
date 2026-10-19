import { type EdiSvgHandle, EdiSvgPlayer } from "@informach/edi-motion/react";
import type { InteractiveDocument } from "@informach/edi-motion/runtime";
import { createRef, StrictMode } from "react";
import { createRoot } from "react-dom/client";

export function mountReactFixture(
  host: HTMLElement,
  document: InteractiveDocument,
  bodyId: string,
  textId: string,
) {
  const root = createRoot(host),
    handle = createRef<EdiSvgHandle>();
  const metrics: { ready: number; events: string[]; errors: string[] } = {
    ready: 0,
    events: [],
    errors: [],
  };
  let label = "initial",
    value: string | number = "Ana",
    autoplay = false,
    respectReducedMotion = true,
    pauseOffscreen = false,
    machineId: string | undefined;
  const render = () => {
    const currentLabel = label;
    root.render(
      <StrictMode>
        <EdiSvgPlayer
          document={document}
          viewBox="0 0 100 100"
          title="Exemplo React"
          autoplay={autoplay}
          respectReducedMotion={respectReducedMotion}
          pauseOffscreen={pauseOffscreen}
          machineId={machineId}
          ref={handle}
          inputValues={{ "input-name": value }}
          onReady={() => {
            metrics.ready++;
          }}
          onEvent={(event) => metrics.events.push(`${currentLabel}:${event.name}`)}
          onError={(error) => metrics.errors.push(error.message)}
        >
          <g data-edi-object={bodyId} transform="translate(0 0) rotate(0) scale(1 1)" opacity="1">
            <rect x="5" y="5" width="20" height="20" fill="#4fe3c1" />
          </g>
          <g data-edi-object={textId} transform="translate(0 0) rotate(0) scale(1 1)" opacity="1">
            <text x="5" y="70">
              Base
            </text>
          </g>
        </EdiSvgPlayer>
      </StrictMode>,
    );
  };
  render();
  return {
    update(next: {
      label?: string;
      value?: string | number;
      autoplay?: boolean;
      respectReducedMotion?: boolean;
      pauseOffscreen?: boolean;
      machineId?: string;
    }) {
      if (next.label !== undefined) label = next.label;
      if (next.value !== undefined) value = next.value;
      if (next.autoplay !== undefined) autoplay = next.autoplay;
      if (next.respectReducedMotion !== undefined) respectReducedMotion = next.respectReducedMotion;
      if (next.pauseOffscreen !== undefined) pauseOffscreen = next.pauseOffscreen;
      if (next.machineId !== undefined) machineId = next.machineId;
      render();
    },
    replaceDocument(next: InteractiveDocument) {
      document = next;
      render();
    },
    handle() {
      const current = handle.current;
      if (!current) throw new Error("React fixture not mounted");
      return current;
    },
    metrics() {
      return structuredClone(metrics);
    },
    unmount() {
      root.unmount();
    },
  };
}
