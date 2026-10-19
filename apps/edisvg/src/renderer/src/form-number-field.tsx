import { useState } from "react";

interface Props {
  id: string;
  value: number;
  min: string;
  max: string;
  label: string;
  disabled?: boolean;
  change(raw: string): void;
}
/** A numeric form has a text editing phase ("", "-", "0."). Do not replace
 * that draft with its parsed number on every keystroke. Schema owns commit. */
export function FormNumberField({ id, value, min, max, label, disabled, change }: Props) {
  const [editing, setEditing] = useState(false),
    [text, setText] = useState("");
  const formatted = Number.isFinite(value) ? String(value) : "";
  return (
    <input
      id={id}
      name={id}
      autoComplete="off"
      aria-label={label}
      type="number"
      min={min}
      max={max}
      step="any"
      required
      disabled={disabled}
      value={editing ? text : formatted}
      onFocus={() => {
        setText(formatted);
        setEditing(true);
      }}
      onBlur={() => setEditing(false)}
      onChange={(event) => {
        setText(event.target.value);
        change(event.target.value);
      }}
    />
  );
}
