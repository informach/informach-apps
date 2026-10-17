const paths = {
  scan: "M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3",
  camera:
    "M14 4h-4L8 7H4a2 2 0 0 0-2 2v10h20V9a2 2 0 0 0-2-2h-4z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  video: "M3 5h12v14H3z M15 10l6-4v12l-6-4",
  scroll: "M8 2H4v4m12-4h4v4M4 18v4h4m12-4v4h-4M7 7h10v10H7z M12 9v6m-2-2 2 2 2-2",
  arrow: "M5 19 19 5M5 5h14v14",
  pointer: "m4 3 16 9-8 2-3 8z",
  text: "M4 4h16M12 4v16M8 20h8",
  square: "M4 4h16v16H4z",
  pen: "m4 16 12-12 4 4L8 20H4z M14 6l4 4",
  highlighter: "m5 14 9-11 6 6-11 9z M3 21h12M5 14l4 4",
  blur: "M3 3h5v5H3zM11 3h4v4h-4zM18 3h3v5h-3zM3 11h4v4H3zM10 10h6v6h-6zM19 11h2v4h-2zM3 18h5v3H3zM11 19h4v2h-4zM18 18h3v3h-3z",
  steps: "M9 6h12M9 12h12M9 18h12M3 4h1v4M3 11h2v2H3v2h2M3 18h2v3H3",
  crop: "M6 2v16h16M2 6h16v16",
  undo: "M3 9h11a7 7 0 0 1 0 14M3 9l5-5M3 9l5 5",
  redo: "M21 9H10a7 7 0 0 0 0 14M21 9l-5-5M21 9l-5 5",
  copy: "M9 9h12v12H9zM15 5V3H3v12h2",
  export: "M12 15V3m-4 4 4-4 4 4M4 13v7h16v-7",
  folder: "M3 5h7l2 3h9v12H3z",
  images: "M4 3h17v15H4zM1 7v14h16M5 16l5-5 4 4 3-3 4 4M9 7h.01",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  close: "M5 5l14 14M19 5 5 19",
  refresh: "M3 10a9 9 0 1 1 1 8M3 3v7h7",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  check: "m4 12 5 5L20 6",
  stop: "M6 6h12v12H6z",
  save: "M4 3h13l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8",
  plus: "M12 4v16M4 12h16",
  minus: "M4 12h16",
};
export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.square}"/></svg>`;
}
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}
