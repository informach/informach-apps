import { fieldValueError, formatFieldValue } from "@shared/form-authoring";
import type { PageRef } from "@shared/model";
import { formValueKey } from "@shared/pdf-forms";
import type { WidgetFont } from "@shared/widget-font";
import { useEffect, useState } from "react";
import { isDocumentShortcut } from "../lib/keyboard";
import { type FormWidget, formWidgets } from "../lib/pdf";
import { commit, type DocState, patchDoc } from "../state/store";
import { prepareWidgetTypography, type WidgetTypography } from "./widgetTypography";

const setValue = (
  docId: string,
  name: string,
  value: string | boolean | string[],
  group = false,
): void => {
  commit(
    docId,
    (c) => (c.forms[name] === value ? c : { ...c, forms: { ...c.forms, [name]: value } }),
    group ? { historyGroup: `form:${name}` } : undefined,
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
  const pageKey = `${page.src}:${page.index}:${page.rotation}`;
  const [prepared, setPrepared] = useState<{
    key: string;
    widgets: FormWidget[];
    typography: Map<WidgetFont | undefined, WidgetTypography>;
  } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const ready = prepared?.key === pageKey ? prepared : null,
    error = failure?.key === pageKey ? failure.message : "";
  useEffect(() => {
    const controller = new AbortController();
    let release: (() => void) | undefined;
    setFailure(null);
    void (async () => {
      const widgets = await formWidgets(page);
      controller.signal.throwIfAborted();
      const fonts = await prepareWidgetTypography(
        widgets.map((widget) => widget.font),
        controller.signal,
      );
      release = fonts.release;
      controller.signal.throwIfAborted();
      setPrepared({ key: pageKey, widgets, typography: fonts.values });
    })().catch((failure: unknown) => {
      release?.();
      if (!controller.signal.aborted)
        setFailure({
          key: pageKey,
          message: failure instanceof Error ? failure.message : "Campos indisponíveis.",
        });
    });
    return () => {
      controller.abort();
      release?.();
    };
  }, [page, pageKey]);

  return (
    <div className="form-layer" aria-busy={!ready && !error}>
      {!ready && !error && (
        <span className="muted small" role="status" style={{ left: 8, top: 8 }}>
          Preparando campos…
        </span>
      )}
      {error && (
        <span className="page-warning" role="alert">
          {error}
        </span>
      )}
      {ready?.widgets.map((w, i) => {
        const typography = ready.typography.get(w.font);
        if (!typography) throw new Error("Fonte de campo ainda não preparada.");
        const keyName = formValueKey(page.src, w.name);
        const value =
          doc.content.forms[keyName] ??
          (page.src === doc.primary ? doc.content.forms[w.name] : undefined) ??
          w.value;
        const field = { ...w, name: keyName, readOnly: w.readOnly || !!doc.readOnly };
        const pos = {
          left: w.control.box.x * scale,
          top: w.control.box.y * scale,
          width: w.control.box.w * scale,
          height: w.control.box.h * scale,
          transform: `rotate(${w.control.rotation}deg)`,
          transformOrigin: "center",
          textAlign: w.alignment,
        };
        const key = `${w.name}-${i}`;
        switch (w.type) {
          case "text":
            return (
              <TextField
                key={key}
                docId={doc.id}
                w={field}
                value={String(value)}
                scale={scale}
                style={pos}
                typography={typography}
              />
            );
          case "checkbox":
            return (
              <input
                type="checkbox"
                key={key}
                className={`form-check${value ? " on" : ""}`}
                style={pos}
                disabled={field.readOnly}
                title={w.name}
                aria-label={w.label || w.name}
                checked={!!value}
                required={w.required}
                onChange={(event) => setValue(doc.id, keyName, event.target.checked)}
              />
            );
          case "radio": {
            const on = value === w.exportValue;
            return (
              <input
                type="radio"
                key={key}
                className={`form-radio${on ? " on" : ""}`}
                style={pos}
                disabled={field.readOnly}
                title={w.name}
                name={`${doc.id}:${keyName}`}
                aria-label={`${w.label || w.name}: ${w.exportValue}`}
                checked={on}
                required={w.required}
                onChange={() => setValue(doc.id, keyName, w.exportValue ?? "")}
              />
            );
          }
          case "choice":
            return (
              <ChoiceField
                key={key}
                docId={doc.id}
                w={field}
                value={value}
                scale={scale}
                style={pos}
                typography={typography}
              />
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
  typography,
}: {
  docId: string;
  w: FormWidget;
  value: string;
  scale: number;
  style: React.CSSProperties;
  typography: WidgetTypography;
}): React.ReactElement {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const fontSize = (w.fontSize || Math.min(w.control.box.h * 0.65, 12)) * scale;
  const props = {
    className: "form-field",
    style: { ...style, ...typography.style, fontSize },
    value: text,
    disabled: w.readOnly,
    title: w.name,
    "aria-label": w.label || w.name,
    "aria-invalid": !!fieldValueError(text, w),
    required: w.required,
    maxLength: w.maxLength,
    spellCheck: false,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setText(e.target.value);
      setValue(docId, w.name, e.target.value, true);
    },
    onBlur: () => {
      const formatted = formatFieldValue(text, w.mask ?? "none");
      if (formatted !== text) {
        setText(formatted);
        setValue(docId, w.name, formatted, true);
      }
      patchDoc(docId, { historyGroup: null });
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (!isDocumentShortcut(e)) e.stopPropagation();
    },
  };
  return (
    <>
      {w.multiline ? <textarea {...props} /> : <input {...props} />}
      <FieldFontWarning warning={typography.warning} style={style} />
    </>
  );
}

function FieldFontWarning({
  warning,
  style,
}: {
  warning?: string;
  style: React.CSSProperties;
}): React.ReactElement | null {
  return warning ? (
    <span
      role="status"
      title={warning}
      className="field-font-warning"
      style={{
        left: style.left,
        top: Number(style.top) + Number(style.height),
        width: style.width,
      }}
    >
      Prévia com fonte alternativa
    </span>
  ) : null;
}
function ChoiceField({
  docId,
  w,
  value,
  scale,
  style,
  typography,
}: {
  docId: string;
  w: FormWidget;
  value: string | boolean | string[];
  scale: number;
  style: React.CSSProperties;
  typography: WidgetTypography;
}): React.ReactElement {
  return (
    <>
      <select
        className="form-field"
        style={{
          ...style,
          ...typography.style,
          fontSize: (w.fontSize || Math.min(w.control.box.h * 0.65, 12)) * scale,
        }}
        value={
          w.multiselect
            ? Array.isArray(value)
              ? value
              : value
                ? [String(value)]
                : []
            : String(value)
        }
        multiple={w.multiselect}
        required={w.required}
        aria-label={w.label || w.name}
        disabled={w.readOnly}
        title={w.name}
        onChange={(event) =>
          setValue(
            docId,
            w.name,
            w.multiselect
              ? [...event.target.selectedOptions].map((option) => option.value)
              : event.target.value,
          )
        }
      >
        {!w.multiselect && <option value="" />}
        {w.options?.map((option) => (
          <option key={option.id} value={option.exportValue}>
            {option.displayValue}
          </option>
        ))}
      </select>
      <FieldFontWarning warning={typography.warning} style={style} />
    </>
  );
}
