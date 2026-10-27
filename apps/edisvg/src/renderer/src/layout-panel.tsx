import {
  defaultLayoutContainer,
  defaultLayoutItem,
  type LayoutContainer,
  type LayoutDocument,
  type LayoutItem,
  type LayoutSize,
  layoutContainerSchema,
  layoutItemSchema,
} from "@informach/edi-motion/layout";
import { useId, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Artboard } from "../../shared/project";
import { flattenScene } from "../../shared/scene.js";

interface Props {
  board: Artboard;
  selectedId: string | null;
  execute(command: unknown): void;
  test(): void;
}
function numeric(data: FormData, key: string) {
  const value = data.get(key);
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Number(value)))
    throw new Error(`Informe ${key}.`);
  return Number(value);
}
function Numeric({
  label,
  name,
  value,
  min = 0,
  max = 100000,
}: {
  label: string;
  name: string;
  value: number;
  min?: number;
  max?: number;
}) {
  const id = useId();
  return (
    <label className="scene-field" htmlFor={id}>
      {label}
      <input
        id={id}
        name={name}
        type="number"
        step="any"
        min={min}
        max={max}
        defaultValue={value}
        required
      />
    </label>
  );
}
function Choice({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: readonly string[];
}) {
  const id = useId();
  return (
    <label className="scene-field" htmlFor={id}>
      {label}
      <select id={id} name={name} aria-label={label} defaultValue={value}>
        {options.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
    </label>
  );
}
function Size({ axis, value }: { axis: "width" | "height"; value: LayoutSize }) {
  const [kind, setKind] = useState(value.kind),
    id = useId(),
    label = axis === "width" ? "Largura" : "Altura";
  return (
    <>
      <label className="scene-field" htmlFor={id}>
        {label}
        <select
          id={id}
          name={`${axis}-kind`}
          aria-label={label}
          value={kind}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "fixed" || next === "hug" || next === "fill" || next === "percent")
              setKind(next);
          }}
        >
          {["hug", "fixed", "fill", "percent"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      {kind !== "hug" && (
        <Numeric
          key={kind}
          label={`${label} · ${kind === "fill" ? "peso" : kind === "percent" ? "proporção 0–1" : "unidades"}`}
          name={`${axis}-value`}
          value={value.kind === kind ? (value.kind === "fill" ? value.weight : value.value) : 1}
          min={kind === "fill" ? 0.001 : 0}
          max={kind === "percent" ? 1 : kind === "fill" ? 1000 : 100000}
        />
      )}
    </>
  );
}
function readSize(data: FormData, axis: "width" | "height") {
  const kind = data.get(`${axis}-kind`);
  return kind === "hug"
    ? { kind }
    : kind === "fill"
      ? { kind, weight: numeric(data, `${axis}-value`) }
      : { kind, value: numeric(data, `${axis}-value`) };
}
function ContainerForm({
  value,
  save,
  report,
}: {
  value: LayoutContainer;
  save(value: LayoutContainer): void;
  report(error: unknown): void;
}) {
  const [flow, setFlow] = useState(value.flow),
    [scroll, setScroll] = useState(value.scroll?.axis ?? "none"),
    [columns, setColumns] = useState(value.columns?.kind ?? "fixed");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const data = new FormData(event.currentTarget);
          save(
            layoutContainerSchema.parse(
              {
                flow,
                direction: data.get("direction"),
                wrap: data.has("wrap"),
                padding: [0, 1, 2, 3].map((index) => numeric(data, `padding-${index}`)),
                gap: [numeric(data, "gap-x"), numeric(data, "gap-y")],
                justify: data.get("justify"),
                align: data.get("align"),
                ...(flow === "grid"
                  ? {
                      columns:
                        columns === "fixed"
                          ? { kind: columns, count: numeric(data, "columns") }
                          : { kind: columns, minWidth: numeric(data, "columns") },
                    }
                  : {}),
                clip: data.has("clip"),
                scroll:
                  scroll === "none"
                    ? null
                    : {
                        axis: scroll,
                        friction: numeric(data, "friction"),
                        spring: numeric(data, "spring"),
                        damping: numeric(data, "damping"),
                        bounce: data.has("bounce"),
                      },
              },
              { jitless: true },
            ),
          );
        } catch (error) {
          report(error);
        }
      }}
    >
      <label className="scene-field">
        Fluxo
        <select
          aria-label="Fluxo"
          value={flow}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "row" || next === "column" || next === "grid") setFlow(next);
          }}
        >
          <option value="row">Linha</option>
          <option value="column">Coluna</option>
          <option value="grid">Grade uniforme</option>
        </select>
      </label>
      <Choice label="Direção" name="direction" value={value.direction} options={["ltr", "rtl"]} />
      <label className="check-row">
        <input name="wrap" type="checkbox" defaultChecked={value.wrap} disabled={flow === "grid"} />
        Quebrar linha
      </label>
      <Choice
        label="Distribuição"
        name="justify"
        value={value.justify}
        options={["start", "center", "end", "space-between", "space-around", "space-evenly"]}
      />
      <Choice
        label="Alinhamento"
        name="align"
        value={value.align}
        options={["start", "center", "end", "stretch"]}
      />
      <div className="property-grid">
        {["Superior", "Direito", "Inferior", "Esquerdo"].map((label, index) => (
          <Numeric
            key={label}
            label={`Padding ${label}`}
            name={`padding-${index}`}
            value={value.padding[index] ?? 0}
          />
        ))}
        <Numeric label="Gap horizontal" name="gap-x" value={value.gap[0]} />
        <Numeric label="Gap vertical" name="gap-y" value={value.gap[1]} />
      </div>
      {flow === "grid" && (
        <>
          <label className="scene-field">
            Colunas
            <select
              aria-label="Colunas"
              value={columns}
              onChange={(event) =>
                setColumns(event.target.value === "auto-fit" ? "auto-fit" : "fixed")
              }
            >
              <option value="fixed">Quantidade fixa</option>
              <option value="auto-fit">Auto-fit</option>
            </select>
          </label>
          <Numeric
            key={columns}
            label={columns === "fixed" ? "Quantidade de colunas" : "Largura mínima da coluna"}
            name="columns"
            value={
              value.columns?.kind === "fixed"
                ? value.columns.count
                : (value.columns?.minWidth ?? 120)
            }
            min={columns === "fixed" ? 1 : 0.1}
            max={columns === "fixed" ? 24 : 100000}
          />
        </>
      )}
      <label className="check-row">
        <input name="clip" type="checkbox" defaultChecked={value.clip} />
        Recortar conteúdo
      </label>
      <label className="scene-field">
        Rolagem
        <select
          aria-label="Rolagem"
          value={scroll}
          onChange={(event) => setScroll(event.target.value)}
        >
          {["none", "x", "y", "both"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      {scroll !== "none" && (
        <>
          <Numeric
            label="Atrito da rolagem"
            name="friction"
            value={value.scroll?.friction ?? 5}
            min={1}
            max={30}
          />
          <Numeric
            label="Mola da rolagem"
            name="spring"
            value={value.scroll?.spring ?? 100}
            min={1}
            max={1000}
          />
          <Numeric
            label="Amortecimento da rolagem"
            name="damping"
            value={value.scroll?.damping ?? 20}
            min={1}
            max={100}
          />
          <label className="check-row">
            <input type="checkbox" name="bounce" defaultChecked={value.scroll?.bounce ?? false} />
            Retorno elástico
          </label>
        </>
      )}
      <button type="submit">Aplicar contêiner</button>
    </form>
  );
}
function ItemForm({
  value,
  save,
  report,
}: {
  value: LayoutItem;
  save(value: LayoutItem): void;
  report(error: unknown): void;
}) {
  const [absolute, setAbsolute] = useState(value.position.kind === "absolute");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const data = new FormData(event.currentTarget),
            optional = (name: string) => (data.get(name) === "" ? null : numeric(data, name));
          save(
            layoutItemSchema.parse(
              {
                ...value,
                width: readSize(data, "width"),
                height: readSize(data, "height"),
                minWidth: numeric(data, "minWidth"),
                maxWidth: numeric(data, "maxWidth"),
                minHeight: numeric(data, "minHeight"),
                maxHeight: numeric(data, "maxHeight"),
                margin: [0, 1, 2, 3].map((index) => numeric(data, `margin-${index}`)),
                aspectRatio: optional("aspectRatio"),
                alignSelf: data.get("alignSelf"),
                position: absolute
                  ? {
                      kind: "absolute",
                      left: optional("left"),
                      right: optional("right"),
                      top: optional("top"),
                      bottom: optional("bottom"),
                    }
                  : { kind: "flow" },
              },
              { jitless: true },
            ),
          );
        } catch (error) {
          report(error);
        }
      }}
    >
      <Size axis="width" value={value.width} />
      <Size axis="height" value={value.height} />
      <div className="property-grid">
        {(["minWidth", "maxWidth", "minHeight", "maxHeight"] as const).map((name) => (
          <Numeric key={name} label={name} name={name} value={value[name]} />
        ))}
        {["Superior", "Direita", "Inferior", "Esquerda"].map((label, index) => (
          <Numeric
            key={label}
            label={`Margem ${label}`}
            name={`margin-${index}`}
            value={value.margin[index] ?? 0}
          />
        ))}
      </div>
      <Choice
        label="Alinhamento do item"
        name="alignSelf"
        value={value.alignSelf}
        options={["auto", "start", "center", "end", "stretch"]}
      />
      <label className="scene-field">
        Proporção (vazio: livre)
        <input
          name="aspectRatio"
          aria-label="Proporção"
          type="number"
          step="any"
          min={0.0001}
          max={10000}
          defaultValue={value.aspectRatio ?? ""}
        />
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={absolute}
          onChange={(event) => setAbsolute(event.target.checked)}
        />
        Posição absoluta (âncoras)
      </label>
      {absolute &&
        (["left", "right", "top", "bottom"] as const).map((name) => (
          <label className="scene-field" key={name}>
            {`Âncora ${name} (vazio: livre)`}
            <input
              name={name}
              aria-label={`Âncora ${name}`}
              type="number"
              step="any"
              min={-100000}
              max={100000}
              defaultValue={value.position.kind === "absolute" ? (value.position[name] ?? "") : ""}
            />
          </label>
        ))}
      <button type="submit">Aplicar item</button>
    </form>
  );
}
function LayoutPanel({ board, selectedId, execute, test }: Props) {
  const [error, setError] = useState(""),
    [scope, setScope] = useState("root"),
    entries = flattenScene(board.scene),
    entry = entries.find(({ node }) => node.id === selectedId),
    layout = board.layout;
  const report = (error: unknown) =>
    setError(error instanceof Error ? error.message : "Layout recusado.");
  const update = (change: (draft: LayoutDocument) => void) => {
    try {
      const draft: LayoutDocument = structuredClone(
        layout ?? { version: 1, root: defaultLayoutContainer(), containers: [], items: [] },
      );
      change(draft);
      execute({ type: "layout", operation: "replace", value: draft });
    } catch (error) {
      report(error);
    }
  };
  const own = layout?.containers.find((container) => container.targetId === selectedId),
    eligible =
      entry &&
      (entry.parentId === null ||
        layout?.containers.some((container) => container.targetId === entry.parentId)),
    config = scope === "group" && own ? own.config : layout?.root;
  return (
    <section>
      <h3>LAYOUT RESPONSIVO</h3>
      {!layout ? (
        <button type="button" onClick={() => update(() => {})}>
          Ativar layout da prancheta
        </button>
      ) : (
        <>
          <div className="scene-tools">
            <button
              type="button"
              onClick={() => {
                try {
                  execute({ type: "layout", operation: "disable" });
                } catch (error) {
                  report(error);
                }
              }}
            >
              Desativar layout
            </button>
            <button type="button" onClick={test}>
              Testar layout
            </button>
          </div>
          <label className="scene-field">
            Contêiner em edição
            <select
              aria-label="Contêiner em edição"
              value={scope === "group" && own ? "group" : "root"}
              onChange={(event) => setScope(event.target.value)}
            >
              <option value="root">Prancheta</option>
              {own && <option value="group">{entry?.node.name}</option>}
            </select>
          </label>
          {config && (
            <fieldset disabled={scope === "group" && entry?.locked}>
              <legend>{scope === "group" && own ? "Grupo" : "Prancheta"}</legend>
              <ContainerForm
                key={`${scope}-${selectedId ?? ""}`}
                value={config}
                report={report}
                save={(config) =>
                  update((draft) => {
                    if (scope === "group" && own) {
                      const value = draft.containers.find(
                        (value) => value.targetId === own.targetId,
                      );
                      if (value) value.config = config;
                    } else draft.root = config;
                  })
                }
              />
            </fieldset>
          )}
          {eligible && entry && (
            <fieldset disabled={entry.locked}>
              <legend>Item: {entry.node.name}</legend>
              <ItemForm
                key={entry.node.id}
                value={
                  layout.items.find((item) => item.targetId === entry.node.id) ??
                  defaultLayoutItem(entry.node.id)
                }
                report={report}
                save={(value) =>
                  update((draft) => {
                    draft.items = [
                      ...draft.items.filter((item) => item.targetId !== value.targetId),
                      value,
                    ];
                  })
                }
              />
              {entry.node.tag === "g" && !entry.node.instance && !own && (
                <button
                  type="button"
                  onClick={() =>
                    update((draft) => {
                      draft.containers.push({
                        targetId: entry.node.id,
                        config: defaultLayoutContainer(),
                      });
                    })
                  }
                >
                  Ativar fluxo no grupo
                </button>
              )}
              {own && (
                <button
                  type="button"
                  onClick={() =>
                    update((draft) => {
                      const descendants = new Set(
                        entries
                          .filter((value) => {
                            let parent = value.parentId;
                            while (parent !== null) {
                              if (parent === entry.node.id) return true;
                              parent =
                                entries.find(({ node }) => node.id === parent)?.parentId ?? null;
                            }
                            return false;
                          })
                          .map(({ node }) => node.id),
                      );
                      draft.containers = draft.containers.filter(
                        (value) =>
                          value.targetId !== entry.node.id && !descendants.has(value.targetId),
                      );
                      draft.items = draft.items.filter((value) => !descendants.has(value.targetId));
                    })
                  }
                >
                  Desativar fluxo do grupo e descendentes
                </button>
              )}
            </fieldset>
          )}
        </>
      )}
      <p role="alert">{error}</p>
    </section>
  );
}
export function mountLayoutPanel(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<LayoutPanel {...props} />);
  return () => root.unmount();
}
