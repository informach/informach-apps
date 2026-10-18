/**
 * The computer's sound ("Áudio do PC") as the recorder window asks Chromium for it: the Windows
 * loopback without the sound the recorder window itself plays. With `restrictOwnAudio` the track
 * opens the process loopback ("loopbackWithoutChrome") and leaves out the capturing document's
 * own sound: the lesson's voice of "Tela sobre a narração" and the guided narration play in the
 * recorder window, so they never come back in this track; a game, the browser and the rest of
 * Windows still do. Another window of the app is NOT left out (Chromium's limit, measured): every
 * sound the recorder plays while recording must play in its own window. Measured on Windows 11
 * with Electron 44 (tests/systemAudioExclusion.test.ts): a tone played by the recorder window
 * falls from -13 dB to -83 dB, another process's tone stays at -30 dB, and a tone of another
 * window of the app stays at -13 dB.
 *
 * The microphone processing Chromium applies by default (echo cancellation, noise suppression,
 * automatic gain) is off: it is the lesson's sound, not a voice in a call.
 */
export const SYSTEM_AUDIO_CONSTRAINTS = {
  restrictOwnAudio: true,
  suppressLocalAudioPlayback: false,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
} as const;

/** What the captured track reports about itself (MediaStreamTrack.getSettings()). */
export interface SystemAudioSettings {
  restrictOwnAudio?: boolean;
  deviceId?: string;
}

/**
 * The track really leaves the recorder window's own sound out: the constraint was applied AND
 * the audio service opened the process loopback ("loopbackWithoutChrome"). A Windows or Chromium
 * without process loopback hands the plain loopback instead.
 */
export const excludesOwnAudio = (settings: SystemAudioSettings): boolean =>
  settings.restrictOwnAudio === true && settings.deviceId === "loopbackWithoutChrome";

/**
 * Whether a take records the computer's sound. Where the app plays a voice while recording (the
 * lesson's voice of "Tela sobre a narração", the narration of a guided take) and Windows cannot
 * leave the app's own sound out, the computer's sound would record that voice a second time:
 * it is off for the take, and the warning says why. Anywhere else it records, and the app's
 * sound may enter (the recorder says so when the capture starts).
 */
export function systemAudioPlan(o: {
  wanted: boolean;
  narrationPlays: boolean;
  excludesApp: boolean;
}): { record: boolean; warning?: string } {
  if (!o.wanted) return { record: false };
  if (o.narrationPlays && !o.excludesApp)
    return {
      record: false,
      warning:
        "O áudio do PC ficou desligado nesta gravação: neste Windows ele gravaria de novo a voz que o gravador toca. Separar essa voz pede o Windows 10 versão 2004 ou mais novo.",
    };
  return { record: true };
}
