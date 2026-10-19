import type { ComponentInstance } from "../../shared/componentContracts";

const preview = (value: string, limit = 128) => ({
  value: value.slice(0, limit),
  length: value.length,
  truncated: value.length > limit,
});
export function inspectComponent(instance: ComponentInstance, offset: number, limit: number) {
  const overrides = instance.overrides.slice(offset, offset + limit).map((override) => ({
    targetId: override.targetId,
    transform: override.transform,
    text: override.text === undefined ? undefined : preview(override.text, 512),
    attrs:
      override.attrs === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(override.attrs).map(([name, value]) => [name, preview(value)]),
          ),
  }));
  return {
    ...instance,
    overrides,
    inputOverrides: instance.inputOverrides?.slice(offset, offset + limit).map((override) => ({
      inputId: override.inputId,
      value: typeof override.value === "string" ? preview(override.value, 512) : override.value,
    })),
    totalInputOverrides: instance.inputOverrides?.length ?? 0,
    nextInputOffset:
      offset + limit < (instance.inputOverrides?.length ?? 0) ? offset + limit : null,
    totalOverrides: instance.overrides.length,
    offset,
    nextOffset:
      offset + overrides.length < instance.overrides.length ? offset + overrides.length : null,
  };
}
export function inspectOverrideValue(
  instance: ComponentInstance,
  targetId: string,
  property: string,
  offset: number,
) {
  const override = instance.overrides.find((item) => item.targetId === targetId);
  const input =
    property === "input"
      ? instance.inputOverrides?.find((input) => input.inputId === targetId)
      : undefined;
  const value =
    property === "input"
      ? input === undefined
        ? undefined
        : JSON.stringify(input.value)
      : property === "text"
        ? override?.text
        : override?.attrs?.[property];
  if (value === undefined) throw new Error("Valor de override não encontrado.");
  return {
    targetId,
    property,
    encoding: property === "input" ? "json" : "text",
    value: value.slice(offset, offset + 20000),
    offset,
    totalLength: value.length,
    nextOffset: offset + 20000 < value.length ? offset + 20000 : null,
  };
}
