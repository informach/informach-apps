const lineCanvas = document.getElementById("line");
const lineParams = new URLSearchParams(location.search);
function drawLine() {
  const scale = window.devicePixelRatio || 1;
  lineCanvas.width = Math.round(innerWidth * scale);
  lineCanvas.height = Math.round(innerHeight * scale);
  const x = Math.round(Number(lineParams.get("x")) * scale),
    y = Math.round(Number(lineParams.get("y")) * scale);
  const width = Number(lineParams.get("width")),
    height = Number(lineParams.get("height"));
  const context = lineCanvas.getContext("2d");
  context.fillStyle = "#79a9e8";
  context.fillRect(
    x,
    y,
    width === 1 ? 1 : Math.round(width * scale),
    height === 1 ? 1 : Math.round(height * scale),
  );
}
drawLine();
window.addEventListener("resize", drawLine);
