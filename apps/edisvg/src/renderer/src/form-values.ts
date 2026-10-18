export function numberValue(data: FormData, name: string) {
  const raw = data.get(name);
  if (typeof raw !== "string" || !raw.trim() || !Number.isFinite(Number(raw)))
    throw new Error(`Informe ${name} como número válido.`);
  return Number(raw);
}
export function textValue(data: FormData, name: string) {
  const raw = data.get(name);
  if (typeof raw !== "string") throw new Error(`Campo ${name} ausente.`);
  return raw;
}
