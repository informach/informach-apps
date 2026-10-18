/**
 * The computer's sound ("Áudio do PC") as the recorder window asks Chromium for it: the Windows
 * loopback without the app's own sound. With `restrictOwnAudio` the audio service captures through
 * WASAPI process loopback, leaving out the app's process tree (the track reports the device
 * "loopbackWithoutChrome"), so the narration the recorder plays over the screen, or any other
 * sound of EdiAula, never comes back in this track; a game, the browser and the rest of Windows
 * still do. Measured on Windows 11 with Electron 44 (tests/systemAudioExclusion.test.ts): a tone
 * played by the app falls from -21 dB to -80 dB, another process's tone stays.
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
 * The track really leaves the app's own sound out. A Windows or Chromium without process
 * loopback hands the plain loopback instead, and the recorder says the app's sound may enter.
 */
export const excludesOwnAudio = (settings: SystemAudioSettings): boolean =>
  settings.restrictOwnAudio === true;
