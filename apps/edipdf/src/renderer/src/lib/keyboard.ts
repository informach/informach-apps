/** Native text editing keeps Ctrl+A/Z; document commands bubble from editable controls. */
export function isDocumentShortcut(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  key: string;
}): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    ["s", "p", "w", "o", "f", "k", "tab", "+", "=", "-", "0"].includes(event.key.toLowerCase())
  );
}
