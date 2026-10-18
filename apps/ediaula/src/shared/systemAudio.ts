/**
 * The computer's sound ("Áudio do PC") of a take, by one of two routes:
 *
 * - "native" (the default where Windows has it): the helper's loopback mode
 *   (native/helper/AudioLoopback.cs, WASAPI process loopback in EXCLUDE_TARGET_PROCESS_TREE mode
 *   on the app's main process) leaves out every sound of the app, whichever window plays it, and
 *   writes a WAV on the QPC clock straight to the take's folder. Windows 10 version 2004 or newer.
 * - "chromium" (the fallback): the recorder window asks Chromium for the Windows loopback with
 *   `restrictOwnAudio`, which leaves out only the capturing document's own sound
 *   ("loopbackWithoutChrome"); another window of the app is NOT left out (Chromium's limit,
 *   measured). The recorder plays everything it plays during a take in its own window, so the
 *   lesson's voice of "Tela sobre a narração" and the guided narration still stay out.
 *
 * Measured on Windows 11 with Electron 44 (tests/systemAudioExclusion.test.ts, opt-in), tone A
 * played by the app at -13.5 dB without exclusion and tone B by another program at -30 dB:
 * native, A falls to -83 dB in one window and -84 dB in another window of the app, B stays at
 * -30 dB; fallback, A falls to -82 dB in the capturing window and stays at -13.5 dB in another.
 *
 * The microphone processing Chromium applies by default (echo cancellation, noise suppression,
 * automatic gain) is off on the fallback: it is the lesson's sound, not a voice in a call.
 */
export const SYSTEM_AUDIO_ROUTES = ["native", "chromium"] as const;
export type SystemAudioRoute = (typeof SYSTEM_AUDIO_ROUTES)[number];

/** Windows 10 version 2004 (build 19041) brought process loopback. */
export const PROCESS_LOOPBACK_BUILD = 19041;

/**
 * From this build on Windows leaves a window out of every capture (WDA_EXCLUDEFROMCAPTURE, what
 * setContentProtection asks for). Before it the same call only blacks the window out, and the
 * recorder's window covers the whole screen: the take would be black. The screen modes need it.
 */
export const CAPTURE_EXCLUSION_BUILD = 19041;

/** Why the screen cannot be recorded on this Windows, or null. */
export function screenCaptureProblem(platform: string, release: string): string | null {
  if (platform !== "win32" || windowsBuild(release) >= CAPTURE_EXCLUSION_BUILD) return null;
  return "Gravar a tela precisa do Windows 10 versão 2004 ou mais novo: nesta versão os controles do gravador cobririam a gravação de preto. Atualize o Windows, ou grave só a voz.";
}

/** The build number of a Windows release string ("10.0.22631"), 0 when it is not one. */
export function windowsBuild(text: string): number {
  const parts = /^(\d+)\.(\d+)\.(\d+)/.exec(text);
  return parts ? Number(parts[3]) : 0;
}

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
 * Whether a take records the computer's sound. `excludesApp` is true on the native route (every
 * sound of the app stays out) and, on the fallback, when Chromium opened the process loopback.
 * Where the app plays a voice while recording (the lesson's voice of "Tela sobre a narração",
 * the narration of a guided take) and Windows cannot leave the app's own sound out, the
 * computer's sound would record that voice a second time: it is off for the take, and the
 * warning says why. Anywhere else it records, and the app's sound may enter (the recorder says
 * so when the capture starts).
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
