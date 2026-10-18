import { patchDoc, useApp } from "../state/store";

export interface ViewPosition {
  page: string;
  offset: number;
  left: number;
}
const positions = new Map<string, ViewPosition>();
const viewListeners = new Set<() => void>();
export const onViewPosition = (listener: () => void): (() => void) => {
  viewListeners.add(listener);
  return () => {
    viewListeners.delete(listener);
  };
};
const history = new Map<string, { past: ViewPosition[]; future: ViewPosition[] }>();
export const viewPosition = (id: string): ViewPosition | undefined => positions.get(id);
export const rememberViewPosition = (id: string, position: ViewPosition): void => {
  positions.set(id, position);
  for (const listener of viewListeners) listener();
};
export function releaseWorkspaceView(id: string): void {
  positions.delete(id);
  history.delete(id);
}
export function navigationState(id: string): { back: boolean; forward: boolean } {
  const value = history.get(id);
  return { back: !!value?.past.length, forward: !!value?.future.length };
}
export function recordNavigation(id: string): void {
  const position = positions.get(id);
  if (!position) return;
  const value = history.get(id) ?? { past: [], future: [] };
  const last = value.past.at(-1);
  if (!last || last.page !== position.page || Math.abs(last.offset - position.offset) > 0.5)
    value.past = [...value.past.slice(-99), { ...position }];
  value.future = [];
  history.set(id, value);
}
let nonce = 0;
export const scrollNonce = (): number => ++nonce;
export function navigateHistory(id: string, direction: "back" | "forward"): void {
  const document = useApp.getState().docs.find((doc) => doc.id === id),
    value = history.get(id);
  if (!document || !value) return;
  const from = direction === "back" ? value.past : value.future,
    into = direction === "back" ? value.future : value.past;
  let target = from.pop();
  while (target && !document.content.pages.some((page) => page.id === target?.page))
    target = from.pop();
  if (!target) {
    patchDoc(id, { navigationRevision: (document.navigationRevision ?? 0) + 1 });
    return;
  }
  const current = positions.get(id);
  if (current) into.push({ ...current });
  const page = document.content.pages.findIndex((item) => item.id === target.page);
  patchDoc(id, {
    currentPage: page,
    scrollRequest: { page, offset: target.offset, left: target.left, nonce: scrollNonce() },
    navigationRevision: (document.navigationRevision ?? 0) + 1,
  });
}
