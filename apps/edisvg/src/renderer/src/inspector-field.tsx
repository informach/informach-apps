import type { PointerEvent as ReactPointerEvent } from "react";
import { formatInput, roundInput, roundTypedInput } from "./form-values";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Dragging the short label changes the value by 1 per pixel (Shift ×10, Alt ×0.1).
// Window listeners keep the drag alive across remounts. Fields with a preview
// apply the release value directly; the others go through the typing commit once.
function startScrub(
  event: ReactPointerEvent<HTMLLabelElement>,
  options: {
    min: number;
    max: number;
    onCommit(input: HTMLInputElement): void;
    /** Live value while dragging; `final` marks the release, applied even if unchanged. */
    preview?(value: number, final: boolean): void;
  },
) {
  const input = event.currentTarget.querySelector("input");
  if (event.button !== 0 || !input || input.disabled) return;
  event.preventDefault();
  const startX = event.clientX,
    start = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
  let moved = false,
    latest = start,
    frame = 0;
  const move = (pointer: PointerEvent) => {
    const delta = pointer.clientX - startX;
    if (!moved && Math.abs(delta) < 3) return;
    moved = true;
    document.body.classList.add("artboard-scrubbing");
    const factor = pointer.shiftKey ? 10 : pointer.altKey ? 0.1 : 1;
    latest = clamp(roundInput(start + delta * factor), options.min, options.max);
    input.value = String(latest);
    if (options.preview && !frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        options.preview?.(latest, false);
      });
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    cancelAnimationFrame(frame);
    document.body.classList.remove("artboard-scrubbing");
    if (!moved) return;
    input.value = formatInput(latest);
    if (options.preview) options.preview(latest, true);
    else options.onCommit(input);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

export interface ScrubFieldProps {
  label: string;
  value: number;
  onCommit(input: HTMLInputElement): void;
  onError(message: string): void;
  min?: number;
  max?: number;
  shortLabel?: string;
  unit?: string;
  derived?: boolean;
  disabled?: boolean;
  preview?(value: number, final: boolean): void;
}

/** Borderless inspector number: typed values keep two decimals, the label scrubs. */
export function ScrubField({
  label,
  value,
  onCommit,
  onError,
  min = 0,
  max = 100000,
  shortLabel,
  unit,
  derived,
  disabled,
  preview,
}: ScrubFieldProps) {
  return (
    <label
      className={derived ? "artboard-value is-derived" : "artboard-value"}
      onPointerDown={(event) => {
        if ((event.target as Element).closest(".artboard-scrub"))
          startScrub(event, { min, max, onCommit, preview });
      }}
    >
      <span className="artboard-scrub" title={`${label}: arraste para ajustar`}>
        {shortLabel ?? label}
      </span>
      <span className="artboard-value-input">
        <input
          aria-label={label}
          type="number"
          step="any"
          min={min}
          max={max}
          disabled={disabled}
          defaultValue={formatInput(value)}
          onBlur={(event) => {
            const input = event.currentTarget;
            // Untouched fields keep the stored precision instead of rounding it.
            if (input.value === formatInput(value)) return;
            if (Number.isFinite(input.valueAsNumber))
              try {
                input.value = formatInput(roundTypedInput(input.valueAsNumber));
              } catch (reason) {
                input.value = formatInput(value);
                onError(reason instanceof Error ? reason.message : "Valor inválido.");
                return;
              }
            onCommit(input);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = formatInput(value);
              event.currentTarget.blur();
            }
          }}
        />
        {unit && (
          <span className="artboard-unit" aria-hidden="true">
            {unit}
          </span>
        )}
      </span>
    </label>
  );
}
