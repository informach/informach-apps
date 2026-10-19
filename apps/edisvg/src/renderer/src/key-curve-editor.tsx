import { curveRepresentation } from "./curveRepresentation";
import type { CurveFields, useKeyCurve } from "./useKeyCurve";

const bezierHandles: readonly {
  id: string;
  index: number;
  x: keyof CurveFields;
  y: keyof CurveFields;
}[] = [
  { id: "first", index: 0, x: "p0", y: "p1" },
  { id: "second", index: 1, x: "p2", y: "p3" },
];

const controls: readonly { name: keyof CurveFields; label: string; min: number; max: number }[] = [
  { name: "p0", label: "x1", min: 0, max: 1 },
  { name: "p1", label: "y1", min: -10, max: 10 },
  { name: "p2", label: "x2", min: 0, max: 1 },
  { name: "p3", label: "y2", min: -10, max: 10 },
];

export function KeyCurveEditor({ curve }: { curve: ReturnType<typeof useKeyCurve> }) {
  const {
    kind,
    fields,
    discrete,
    id,
    easing,
    plot,
    svg,
    surface,
    pointFields,
    representation,
    copyStatus,
    manual,
    writePoints,
    copyCurve,
  } = curve;
  return (
    <>
      <label className="scene-field">
        Interpolação de saída
        <select
          name="easing"
          value={discrete ? "hold" : kind}
          disabled={discrete}
          onChange={(event) => {
            const value = event.target.value;
            if (
              value === "linear" ||
              value === "hold" ||
              value === "elastic" ||
              value === "cubic-bezier"
            )
              manual(value, fields);
          }}
        >
          <option value="linear">Linear</option>
          <option value="hold">Degrau</option>
          <option value="elastic">Elástico</option>
          <option value="cubic-bezier">Bézier cúbica</option>
        </select>
      </label>
      <div className="property-grid" hidden={kind !== "cubic-bezier" || discrete}>
        {controls.map((control) => (
          <label className="property" key={control.name}>
            {control.label}
            <input
              id={`${id}-${control.name}`}
              ref={(input) => {
                if (input) pointFields.current.set(control.name, input);
                else pointFields.current.delete(control.name);
              }}
              name={control.name}
              type="number"
              step=".01"
              required
              min={control.min}
              max={control.max}
              disabled={kind !== "cubic-bezier" || discrete}
              value={fields[control.name]}
              onChange={(event) => manual(kind, { ...fields, [control.name]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="property-grid" data-elastic-options hidden={kind !== "elastic" || discrete}>
        {(["amplitude", "period"] as const).map((name) => (
          <label className="property" key={name}>
            {name === "amplitude" ? "Amplitude" : "Período"}
            <input
              name={name}
              type="number"
              min={name === "amplitude" ? 1 : 0.05}
              max={name === "amplitude" ? 10 : 2}
              step={name === "amplitude" ? 0.1 : 0.01}
              disabled={kind !== "elastic" || discrete}
              required
              value={fields[name]}
              onChange={(event) => manual(kind, { ...fields, [name]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="curve-graph" data-curve-preview>
        {plot && (
          <>
            <div ref={surface} className="curve-preview-surface">
              <svg
                ref={svg}
                viewBox="0 0 260 130"
                preserveAspectRatio="none"
                role="img"
                aria-label="Curva calculada pelo motor"
              >
                <path className="graph-grid" d={`M12 ${plot.zero}H248 M12 ${plot.one}H248`} />
                <path data-curve-line vectorEffect="non-scaling-stroke" d={plot.path} />
                {bezierHandles.map((handle) => {
                  const point = plot.controls[handle.index];
                  return point ? (
                    <path
                      key={handle.id}
                      className="graph-grid"
                      d={`M${handle.index ? 248 : 12} ${handle.index ? plot.one : plot.zero}L${point.x} ${point.y}`}
                    />
                  ) : null;
                })}
              </svg>
              {bezierHandles.map((handle) => {
                const point = plot.controls[handle.index];
                return point ? (
                  <div key={handle.id}>
                    <span
                      id={`${id}-point-${handle.id}`}
                      hidden
                    >{`x: ${fields[handle.x]}, y: ${fields[handle.y]}. Arraste ou use as setas para ajustar x/y. Enter ou Espaço abre o campo x; ambos os campos numéricos estão disponíveis.`}</span>
                    <button
                      type="button"
                      className="curve-native-handle"
                      data-curve-handle={handle.index}
                      aria-label={`Controle Bézier ${handle.index + 1}`}
                      aria-describedby={`${id}-point-${handle.id}`}
                      style={{
                        left: `${(point.x / 260) * 100}%`,
                        top: `${(point.y / 130) * 100}%`,
                      }}
                      onClick={() => {
                        const field = pointFields.current.get(handle.x);
                        field?.focus();
                        field?.select();
                      }}
                      onKeyDown={(event) => {
                        if (
                          !easing ||
                          typeof easing === "string" ||
                          easing.kind !== "cubic-bezier" ||
                          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
                        )
                          return;
                        event.preventDefault();
                        const values = [...easing.points],
                          axis = event.key === "ArrowLeft" || event.key === "ArrowRight" ? 0 : 1,
                          position = handle.index * 2 + axis,
                          current = values[position];
                        if (current === undefined) throw new Error("Controle Bézier ausente.");
                        values[position] = Math.max(
                          axis ? -10 : 0,
                          Math.min(
                            axis ? 10 : 1,
                            current +
                              (event.key === "ArrowLeft" || event.key === "ArrowDown"
                                ? -0.01
                                : 0.01),
                          ),
                        );
                        writePoints(values);
                      }}
                    />
                  </div>
                ) : null;
              })}
            </div>
            <small>
              {plot.min.toFixed(2)} → {plot.max.toFixed(2)} · normalizado
            </small>
          </>
        )}
      </div>
      <div className="key-curve-tools">
        <button
          type="button"
          data-smooth-curve
          disabled={discrete}
          onClick={() =>
            manual("cubic-bezier", { ...fields, p0: "0.42", p1: "0", p2: "0.58", p3: "1" })
          }
        >
          Usar curva Suave
        </button>
        <label className="scene-field">
          Representação da curva
          <input
            ref={representation}
            data-curve-representation
            name="curve-representation"
            readOnly
            autoComplete="off"
            spellCheck={false}
            value={easing ? curveRepresentation(easing) : ""}
          />
        </label>
        <button type="button" data-copy-curve disabled={!easing} onClick={copyCurve}>
          Copiar representação
        </button>
        <p role="status" data-copy-status>
          {copyStatus}
        </p>
      </div>
    </>
  );
}
