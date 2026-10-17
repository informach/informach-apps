function allowCapturePermission({ trusted, mode, started, permission, details = {} }) {
  if (!trusted || mode !== "video" || !started || details.isMainFrame === false) return false;
  if (permission === "display-capture") return !details.mediaTypes?.includes("audio");
  // Electron 42 reports screen capture as media with no camera/microphone types.
  return (
    permission === "media" && Array.isArray(details.mediaTypes) && details.mediaTypes.length === 0
  );
}
module.exports = { allowCapturePermission };
