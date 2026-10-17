function chooseDisplay(displays, preference, cursorDisplayId) {
  const id = preference === "cursor" ? cursorDisplayId : Number(preference);
  const display = displays.find((d) => d.id === id);
  if (!display)
    throw new Error("O monitor escolhido não está conectado. Escolha outro monitor no editor.");
  return display;
}
function frameEdges(rect, display, thickness = 1) {
  const x = Math.floor(display.x + rect.x),
    y = Math.floor(display.y + rect.y);
  const right = Math.ceil(display.x + rect.x + rect.width),
    bottom = Math.ceil(display.y + rect.y + rect.height);
  const left = Math.max(display.x, x - thickness),
    top = Math.max(display.y, y - thickness);
  const r = Math.min(display.x + display.width - thickness, right),
    b = Math.min(display.y + display.height - thickness, bottom);
  return [
    { x: left, y: top, width: r + thickness - left, height: thickness },
    { x: left, y: b, width: r + thickness - left, height: thickness },
    { x: left, y: top, width: thickness, height: b + thickness - top },
    { x: r, y: top, width: thickness, height: b + thickness - top },
  ];
}
function frameWindows(rect, display) {
  return frameEdges(rect, display).map((line) => {
    const width = Math.min(display.width, Math.max(32, line.width)),
      height = Math.min(display.height, Math.max(32, line.height));
    const x = Math.max(display.x, Math.min(line.x, display.x + display.width - width));
    const y = Math.max(display.y, Math.min(line.y, display.y + display.height - height));
    return {
      bounds: { x, y, width, height },
      line: { x: line.x - x, y: line.y - y, width: line.width, height: line.height },
    };
  });
}
function controlPosition(rect, display, displays, width, height) {
  const region = {
    x: display.bounds.x + rect.x,
    y: display.bounds.y + rect.y,
    width: rect.width,
    height: rect.height,
  };
  const work = display.workArea;
  const candidates = [
    { x: region.x, y: region.y + region.height + 12 },
    { x: region.x, y: region.y - height - 12 },
    { x: region.x + region.width + 12, y: region.y },
    { x: region.x - width - 12, y: region.y },
  ];
  const available = candidates.find(
    (p) =>
      p.x >= work.x &&
      p.y >= work.y &&
      p.x + width <= work.x + work.width &&
      p.y + height <= work.y + work.height,
  );
  if (available) return available;
  const other = displays.find(
    (d) => d.id !== display.id && d.workArea.width >= width && d.workArea.height >= height,
  );
  const area = other?.workArea || work;
  return { x: area.x + Math.max(0, area.width - width - 16), y: area.y + 16 };
}
module.exports = { chooseDisplay, frameEdges, frameWindows, controlPosition };
