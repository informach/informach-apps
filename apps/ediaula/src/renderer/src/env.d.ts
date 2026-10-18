/// <reference types="vite/client" />

/**
 * Screen Capture constraints Chromium implements and the DOM types do not list yet
 * (shared/systemAudio.ts asks for them).
 */
interface MediaTrackConstraintSet {
  restrictOwnAudio?: ConstrainBoolean;
  suppressLocalAudioPlayback?: ConstrainBoolean;
}
interface MediaTrackSettings {
  restrictOwnAudio?: boolean;
  suppressLocalAudioPlayback?: boolean;
}
