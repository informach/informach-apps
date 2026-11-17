/** A notification may resume only a known Agenda screen, never an arbitrary URL. */
export type NotificationDestination =
  | "/dashboard"
  | `/calendario?date=${string}`
  | `/atividades/${string}`;
export function notificationDestination(value: unknown): NotificationDestination | undefined {
  if (typeof value !== "string") return undefined;
  return value === "/dashboard" ||
    /^\/calendario\?date=\d{4}-\d{2}-\d{2}$/.test(value) ||
    /^\/atividades\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? (value as NotificationDestination)
    : undefined;
}
