import type { PageRef } from "@shared/model";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { type FormWidget, formWidgets } from "../lib/pdf";
import { commit, type DocState } from "../state/store";

const setValue = (docId: string, name: string, value: string | boolean): void => {
  commit(docId, (c) =>
    c.forms[name] === value ? c : { ...c, forms: { ...c.forms, [name]: value } },
  );
};

/** Fillable fields of the original file, drawn as real inputs over the page. */
export function FormLayer({
  doc,
  page,
  scale,
}: {
  doc: DocState;
  page: PageRef;
  scale: number;
}): React.ReactElement {
  const [widgets, setWidgets] = useState<FormWidget[]>([]);
  useEffect(() => {
    let live = true;
    void formWidgets(page)
      .then((w) => live && setWidgets(w))
      .catch(console.error);
    return () => {
      live = false;
    };
  }, [page]);

  return (
    <div className="form-layer">
      {widgets.map((w, i) => {
        const value = doc.content.forms[w.name] ?? w.value;
        const pos = {
          left: w.box.x * scale,
          top: w.box.y * scale,
          width: w.box.w * scale,
          height: w.box.h * scale,
        };
        const key = `${w.name}-${i}`;
        switch (w.type) {
          case "text":
            return (
              <TextField
                key={key}
                docId={doc.id}
                w={w}
                value={String(value)}
                scale={scale}
                style={pos}
              />
            );
          case "checkbox":
            return (
              <button
                type="button"
                key={key}
                className={`form-check${value ? " on" : ""}`}
                style={pos}
                disabled={w.readOnly}
                title={w.name}
                onClick={() => setValue(doc.id, w.name, !value)}
              >
                {value ? <Check size={Math.max(8, w.box.h * scale * 0.8)} strokeWidth={3} /> : null}
              </button>
            );
          case "radio": {
            const on = value === w.exportValue;
            return (
              <button
                type="button"
                key={key}
                className={`form-radio${on ? " on" : ""}`}
                style={pos}
                disabled={w.readOnly}
                title={w.name}
                onClick={() => setValue(doc.id, w.name, w.exportValue ?? "")}
              >
                {on && <span />}
              </button>
            );
          }
          case "choice":
            return (
              <select
                key={key}
                className="form-field"
                style={{ ...pos, fontSize: Math.min(w.box.h * 0.65, 12) * scale }}
                value={String(value)}
                disabled={w.readOnly}
                title={w.name}
                onChange={(e) => setValue(doc.id, w.name, e.target.value)}
              >
                <option value="" />
                {w.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            );
          default: {
            const unsupportedType: never = w.type;
            throw new Error(`Unsupported PDF form widget: ${unsupportedType}`);
          }
        }
      })}
    </div>
  );
}

function TextField({
  docId,
  w,
  value,
  scale,
  style,
}: {
  docId: string;
  w: FormWidget;
  value: string;
  scale: number;
  style: React.CSSProperties;
}): React.ReactElement {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const fontSize = (w.fontSize || Math.min(w.box.h * 0.65, 12)) * scale;
  const props = {
    className: "form-field",
    style: { ...style, fontSize },
    value: text,
    disabled: w.readOnly,
    title: w.name,
    spellCheck: false,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setText(e.target.value);
      setValue(docId, w.name, e.target.value);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !["s", "p", "w", "o"].includes(e.key.toLowerCase()))
        e.stopPropagation();
    },
  };
  return w.multiline ? <textarea {...props} /> : <input {...props} />;
}
