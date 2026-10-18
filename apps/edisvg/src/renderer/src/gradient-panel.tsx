import { type Gradient, gradientSchema, gradientTags } from "@informach/edi-motion/graphics";
import { useId, useState } from "react";
import type { SceneNode } from "../../shared/sceneTypes";

interface Props {
  node: SceneNode;
  locked: boolean;
  execute(commands: unknown[]): void;
}
function GradientEditor({ node, locked, execute, paint }: Props & { paint: "fill" | "stroke" }) {
  const original = node.gradients?.[paint],
    id = useId(),
    [kind, setKind] = useState<"none" | "linear" | "radial">(original?.kind ?? "none"),
    [error, setError] = useState(""),
    [transformed, setTransformed] = useState(!!original?.transform),
    [stops, setStops] = useState(() =>
      (
        original?.stops ?? [
          { offset: 0, color: "#000000", opacity: 1 },
          { offset: 1, color: "#ffffff", opacity: 1 },
        ]
      ).map((stop) => ({
        id: crypto.randomUUID(),
        offset: String(stop.offset),
        color: stop.color,
        opacity: String(stop.opacity),
      })),
    );
  const label = paint === "fill" ? "preenchimento" : "contorno";
  const initial = (name: string) => {
    if (original && name in original) {
      const value = Reflect.get(original, name);
      if (typeof value === "number") return value;
    }
    return kind === "radial" ? 0.5 : name === "x2" ? 1 : 0;
  };
  return (
    <form
      aria-label={`Gradiente de ${label}`}
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const data = new FormData(event.currentTarget),
            text = (name: string) => {
              const value = data.get(name);
              if (typeof value !== "string" || !value.trim())
                throw new Error("Informe todos os campos do gradiente.");
              return value;
            },
            numeric = (name: string) => {
              const value = Number(text(name));
              if (!Number.isFinite(value)) throw new Error("Número de gradiente inválido.");
              return value;
            },
            next = structuredClone(node.gradients ?? {});
          if (kind === "none") delete next[paint];
          else {
            const coordinates = Object.fromEntries(
                (kind === "linear" ? ["x1", "y1", "x2", "y2"] : ["cx", "cy", "r", "fx", "fy"]).map(
                  (name) => [name, numeric(name)],
                ),
              ),
              value: Gradient = gradientSchema.parse({
                kind,
                ...coordinates,
                units: text("units"),
                spread: text("spread"),
                ...(transformed
                  ? {
                      transform: Array.from({ length: 6 }, (_, index) =>
                        numeric(`matrix-${index}`),
                      ),
                    }
                  : {}),
                stops: stops.map((stop) => {
                  if (!stop.offset.trim() || !stop.opacity.trim())
                    throw new Error("Preencha posição e opacidade de cada parada.");
                  return {
                    offset: Number(stop.offset),
                    color: stop.color,
                    opacity: Number(stop.opacity),
                  };
                }),
              });
            next[paint] = value;
          }
          execute([
            {
              type: "scene",
              operation: "gradients",
              targetId: node.id,
              value: next.fill || next.stroke ? next : null,
            },
          ]);
          setError("");
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Gradiente recusado.");
        }
      }}
    >
      <fieldset disabled={locked}>
        <legend>Gradiente de {label}</legend>
        <label htmlFor={`${id}-kind`}>Tipo de gradiente de {label}</label>
        <select
          id={`${id}-kind`}
          value={kind}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "none" || value === "linear" || value === "radial") setKind(value);
          }}
        >
          <option value="none">Cor sólida / herdada</option>
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
        {kind !== "none" && (
          <>
            <label htmlFor={`${id}-units`}>Coordenadas do gradiente</label>
            <select
              id={`${id}-units`}
              name="units"
              defaultValue={original?.units ?? "objectBoundingBox"}
            >
              <option value="objectBoundingBox">Frações da forma</option>
              <option value="userSpaceOnUse">Espaço local em pixels</option>
            </select>
            <label htmlFor={`${id}-spread`}>Extensão do gradiente</label>
            <select id={`${id}-spread`} name="spread" defaultValue={original?.spread ?? "pad"}>
              <option value="pad">Manter extremos</option>
              <option value="reflect">Refletir</option>
              <option value="repeat">Repetir</option>
            </select>
            <div key={kind} className="resource-pair">
              {(kind === "linear" ? ["x1", "y1", "x2", "y2"] : ["cx", "cy", "r", "fx", "fy"]).map(
                (name) => (
                  <label key={name} htmlFor={`${id}-${name}`}>
                    {name}
                    <input
                      id={`${id}-${name}`}
                      name={name}
                      type="number"
                      step="any"
                      min={name === "r" ? 0 : -100000}
                      max={100000}
                      required
                      defaultValue={initial(name)}
                    />
                  </label>
                ),
              )}
            </div>
            <label className="resource-check">
              <input
                type="checkbox"
                checked={transformed}
                onChange={(event) => setTransformed(event.target.checked)}
              />
              Transformar gradiente de {label}
            </label>
            {transformed && (
              <fieldset>
                <legend>Matriz do gradiente</legend>
                {["a", "b", "c", "d", "tx", "ty"].map((name, index) => (
                  <label key={name} htmlFor={`${id}-matrix-${index}`}>
                    Coeficiente {name}
                    <input
                      id={`${id}-matrix-${index}`}
                      name={`matrix-${index}`}
                      type="number"
                      min={-1e7}
                      max={1e7}
                      step="any"
                      required
                      defaultValue={
                        original?.transform?.[index] ?? (name === "a" || name === "d" ? 1 : 0)
                      }
                    />
                  </label>
                ))}
              </fieldset>
            )}
            <ol className="gradient-stops" aria-label={`Paradas de ${label}`}>
              {stops.map((stop, index) => (
                <li key={stop.id}>
                  {(["offset", "color", "opacity"] as const).map((field) => (
                    <label key={field} htmlFor={`${id}-${stop.id}-${field}`}>
                      {{ offset: "Posição", color: "Cor", opacity: "Opacidade" }[field]} {index + 1}
                      <input
                        id={`${id}-${stop.id}-${field}`}
                        type={field === "color" ? "color" : "number"}
                        min={0}
                        max={1}
                        step="any"
                        required
                        value={stop[field]}
                        onChange={(event) =>
                          setStops(
                            stops.map((item) =>
                              item.id === stop.id ? { ...item, [field]: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                  <div className="resource-actions">
                    <button
                      type="button"
                      disabled={stops.length <= 2}
                      onClick={() => setStops(stops.filter((item) => item.id !== stop.id))}
                    >
                      Remover parada {index + 1}
                    </button>
                    {([-1, 1] as const).map((direction) => (
                      <button
                        key={direction}
                        type="button"
                        aria-label={`Mover parada ${index + 1} ${direction < 0 ? "acima" : "abaixo"}`}
                        title={`Mover parada ${index + 1} ${direction < 0 ? "acima" : "abaixo"}`}
                        disabled={index + direction < 0 || index + direction >= stops.length}
                        onClick={() =>
                          setStops((current) => {
                            const from = current[index],
                              to = current[index + direction];
                            if (!from || !to) return current;
                            return current.map((item, position) =>
                              position === index
                                ? to
                                : position === index + direction
                                  ? from
                                  : item,
                            );
                          })
                        }
                      >
                        {direction < 0 ? "↑" : "↓"}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              disabled={stops.length >= 32}
              onClick={() =>
                setStops([
                  ...stops,
                  { id: crypto.randomUUID(), offset: "1", color: "#ffffff", opacity: "1" },
                ])
              }
            >
              Adicionar parada de {label}
            </button>
            <p className="micro">
              2–32 paradas em ordem crescente, de 0 a 1. Posições iguais produzem corte de cor.
              Coordenadas/transformação permanecem locais à forma.
            </p>
          </>
        )}
        <button type="submit">Aplicar gradiente de {label}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function GradientPanel(props: Props) {
  if (!gradientTags.has(props.node.tag)) return null;
  return (
    <section className="resource-editor" aria-label="Gradientes">
      <h3>GRADIENTES</h3>
      <GradientEditor {...props} paint="fill" />
      <GradientEditor {...props} paint="stroke" />
    </section>
  );
}
