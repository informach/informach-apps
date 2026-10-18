import { DEFAULT_HOTKEYS, type HotkeyAction, type HotkeyMap, hotkeyLabel } from "@shared/hotkeys";
import { create } from "zustand";

/**
 * The recorder's shortcuts as the teacher configured them, for the labels shown in the editor
 * ("F9 inicia", "Refazer (Ctrl+Shift+R)"). Read at startup and again whenever a take starts or
 * ends, since the recorder window is where they change.
 */
export const useRecorderKeys = create<HotkeyMap>(() => ({ ...DEFAULT_HOTKEYS }));

export async function loadRecorderKeys(): Promise<void> {
  const settings = await window.api.recorder.settings();
  useRecorderKeys.setState(settings.hotkeys);
}

/** "Ctrl+Shift+R", outside React. */
export const recorderKey = (action: HotkeyAction): string =>
  hotkeyLabel(useRecorderKeys.getState()[action]);

/** "Ctrl+Shift+R", in a component. */
export const useRecorderKey = (action: HotkeyAction): string =>
  useRecorderKeys((keys) => hotkeyLabel(keys[action]));
