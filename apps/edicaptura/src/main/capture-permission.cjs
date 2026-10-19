/**
 * Screen capture only for the trusted controller of a started video. Sound follows the person's
 * quick-video options: the microphone may open as soon as the controller shows its meter (before
 * the first frame), the computer's sound only together with the started screen capture.
 */
function allowCapturePermission({
  trusted,
  mode,
  started,
  permission,
  details = {},
  audio = { microphone: false, system: false },
}) {
  if (!trusted || mode !== "video" || details.isMainFrame === false) return false;
  const types = Array.isArray(details.mediaTypes) ? details.mediaTypes : null;
  if (permission === "display-capture")
    return started && (audio.system || !details.mediaTypes?.includes("audio"));
  if (permission !== "media" || !types) return false;
  // Electron reports screen capture as media with no camera/microphone types.
  if (types.length === 0) return started;
  return audio.microphone && types.length === 1 && types[0] === "audio";
}
/** enumerateDevices labels and the meter's permission check follow the same rule. */
function allowMicrophoneCheck({ trusted, mode, permission, mediaType, audio }) {
  return (
    trusted &&
    mode === "video" &&
    permission === "media" &&
    mediaType === "audio" &&
    !!audio?.microphone
  );
}
module.exports = { allowCapturePermission, allowMicrophoneCheck };
