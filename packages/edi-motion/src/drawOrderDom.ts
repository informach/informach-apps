import { type DrawOrders, ROOT_DRAW_SCOPE } from "./drawOrder";

interface DrawScope {
  container: Element;
  authored: Element[];
  members: Map<string, Element>;
  anchor: Node | null;
}
/** Restacks the direct children of each animated scope in a rendered scene.
 * Every object element moves with its basis wrapper; non-object siblings keep their place
 * before the stacked block. Only scopes in \`scopes\` are watched; destroy restores markup. */
export function createDrawOrderBinding(
  wrappers: ReadonlyMap<string, Element>,
  scopes: ReadonlySet<string>,
) {
  const owners = new Map([...wrappers].map(([id, wrapper]) => [wrapper, id])),
    bound = new Map<string, DrawScope>();
  if (scopes.size)
    for (const [id, wrapper] of wrappers) {
      const basis = wrapper.parentElement,
        outer = basis?.getAttribute("data-edi-basis") === id ? basis : wrapper,
        container = outer.parentElement;
      if (!container) continue;
      // A group's children live in the shape element its wrapper holds first.
      const owner = container.parentElement,
        scope =
          owner && owner.firstElementChild === container
            ? (owners.get(owner) ?? ROOT_DRAW_SCOPE)
            : ROOT_DRAW_SCOPE;
      if (!scopes.has(scope)) continue;
      let entry = bound.get(scope);
      if (!entry) {
        entry = { container, authored: [], members: new Map(), anchor: null };
        bound.set(scope, entry);
      }
      // Two containers for the root (a nested viewport's objects) are not one scope.
      if (entry.container !== container) continue;
      entry.members.set(id, outer);
    }
  for (const entry of bound.values()) {
    const members = new Set(entry.members.values());
    entry.authored = [...entry.container.children].filter((element) => members.has(element));
    entry.anchor = entry.authored.at(-1)?.nextSibling ?? null;
  }
  function restack(entry: DrawScope, desired: readonly Element[]) {
    const members = new Set(desired),
      current = [...entry.container.children].filter((element) => members.has(element));
    if (
      current.length === desired.length &&
      current.every((element, index) => element === desired[index])
    )
      return;
    for (const element of desired) entry.container.insertBefore(element, entry.anchor);
  }
  return {
    paint(orders: DrawOrders) {
      for (const [scope, entry] of bound) {
        const order = orders.get(scope);
        if (!order) {
          restack(entry, entry.authored);
          continue;
        }
        const listed: Element[] = [],
          seen = new Set<Element>();
        for (const id of order) {
          const element = entry.members.get(id);
          if (element && !seen.has(element)) {
            listed.push(element);
            seen.add(element);
          }
        }
        // Children a key does not list (added after it was authored) keep their authored order
        // in front of the listed ones.
        restack(entry, [...listed, ...entry.authored.filter((element) => !seen.has(element))]);
      }
    },
    destroy() {
      for (const entry of bound.values()) restack(entry, entry.authored);
    },
  };
}
