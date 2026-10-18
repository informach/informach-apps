import {
  BLEND_GROUPS,
  BLEND_MODES,
  type BlendMode,
  blendGroup,
  blendLabel,
  FAVORITE_MODES,
} from "@shared/blendModes";
import { Blend, ChevronDown, Info } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { compositor } from "@/engine/compositor";
import { attempt } from "@/lib/actions";
import { setLayerProps } from "@/lib/ops";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { Slider } from "@/ui/controls";

const THUMB = 160;

/** Small renders of the whole image with the active layer in each favorite mode. */
function useModeThumbs(layerId: string | undefined, modes: BlendMode[]): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!layerId) return;
    const draw = (): void => {
      const doc = useDoc.getState().doc;
      if (!doc || !doc.layers.some((l) => l.id === layerId)) return;
      const scale = Math.min(1, THUMB / Math.max(doc.width, doc.height));
      try {
        const out: Record<string, string> = {};
        for (const mode of modes)
          out[mode] = compositor()
            .renderToCanvas(doc, { scale, modeOverride: { layerId, mode } })
            .toDataURL("image/jpeg", 0.8);
        setThumbs(out);
      } catch {
        setThumbs({});
      }
    };
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (): void => {
      clearTimeout(timer);
      timer = setTimeout(draw, 450);
    };
    schedule();
    const unsubscribe = useDoc.subscribe((next, previous) => {
      if (next.revision !== previous.revision) schedule();
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [layerId, modes]);
  return thumbs;
}

export function BlendSection(): ReactNode {
  const layer = useDoc((s) => s.doc?.layers.find((l) => l.id === s.activeId));
  const open = useUi((s) => s.blendMenuOpen);
  const ref = useRef<HTMLDivElement>(null);
  const thumbs = useModeThumbs(layer?.id, FAVORITE_MODES);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node))
        useUi.setState({ blendMenuOpen: false, previewMode: null });
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  if (!layer) return null;
  const preview = (mode: BlendMode | null): void => {
    useUi.setState({ previewMode: mode ? { layerId: layer.id, mode } : null });
  };
  const choose = (mode: BlendMode): void => {
    useUi.setState({ previewMode: null, blendMenuOpen: false });
    attempt(() => setLayerProps(layer.id, { blendMode: mode }));
  };
  const group = BLEND_GROUPS.find((g) => g.id === blendGroup(layer.blendMode));

  return (
    <div className="section">
      <div className="section-head">
        <span className="label">Modo de mesclagem</span>
        <span className="chip" title={layer.name}>
          {layer.name}
        </span>
      </div>

      <div className="blend-dd" ref={ref}>
        <button
          type="button"
          className="blend-dd-btn"
          onClick={() => useUi.setState({ blendMenuOpen: !open, previewMode: null })}
        >
          <Blend size={16} className="lead" />
          <strong>{blendLabel(layer.blendMode)}</strong>
          {group && group.id !== "normal" && (
            <span className="muted" style={{ fontSize: 11 }}>
              {group.label}
            </span>
          )}
          <span className="spacer" />
          <span className="kbd" title="Shift + / Shift − alterna os modos">
            Shift ±
          </span>
          <ChevronDown size={15} className="muted" />
        </button>
        {open && (
          <fieldset
            className="blend-menu"
            aria-label="Modos de mesclagem"
            onMouseLeave={() => preview(null)}
          >
            {BLEND_GROUPS.map((g) => (
              <div key={g.id}>
                <div className="blend-group-label">
                  <span>{g.label}</span>
                  <span>{g.hint}</span>
                </div>
                {BLEND_MODES.filter((m) => m.group === g.id).map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    className={`blend-option${m.id === layer.blendMode ? " is-on" : ""}`}
                    onMouseEnter={() => preview(m.id)}
                    onClick={() => choose(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            ))}
          </fieldset>
        )}
      </div>

      <div className="section-head">
        <span style={{ color: "var(--text-2)", fontWeight: 500, fontSize: 12 }}>Mais usados</span>
        <button
          type="button"
          className="link"
          onClick={() => useUi.setState({ blendMenuOpen: true })}
        >
          Ver todos (27)
        </button>
      </div>
      <fieldset
        className="blend-grid"
        aria-label="Prévia dos modos favoritos"
        onMouseLeave={() => preview(null)}
      >
        {FAVORITE_MODES.map((m) => (
          <button
            type="button"
            key={m}
            className={`blend-tile${m === layer.blendMode ? " is-on" : ""}`}
            onMouseEnter={() => preview(m)}
            onClick={() => choose(m)}
          >
            <div className="thumb">{thumbs[m] && <img src={thumbs[m]} alt="" />}</div>
            {blendLabel(m)}
          </button>
        ))}
      </fieldset>

      <Slider
        label="Opacidade"
        value={Math.round(layer.opacity * 100)}
        min={0}
        max={100}
        unit="%"
        reset={100}
        onChange={(v) => attempt(() => setLayerProps(layer.id, { opacity: v / 100 }))}
      />
      <Slider
        label="Intensidade da camada"
        value={Math.round(layer.fill * 100)}
        min={0}
        max={100}
        unit="%"
        reset={100}
        onChange={(v) => attempt(() => setLayerProps(layer.id, { fill: v / 100 }))}
      />
      <div className="hint">
        <Info size={12} />A intensidade multiplica a opacidade. Passe o mouse sobre um modo para ver
        antes de escolher.
      </div>
    </div>
  );
}
