import { DEFAULT_PREFERENCES, type PdfPreferences, preferencesSchema } from "@shared/preferences";
import { create } from "zustand";

export const usePreferences = create<{ value: PdfPreferences; loaded: boolean; error: string }>(
  () => ({ value: DEFAULT_PREFERENCES, loaded: false, error: "" }),
);
let committed = DEFAULT_PREFERENCES,
  generation = 0;
let queue = Promise.resolve();
export async function loadPreferences(): Promise<void> {
  try {
    committed = preferencesSchema.parse(await window.api.preferences.get());
    usePreferences.setState({ value: committed, loaded: true, error: "" });
  } catch (error) {
    usePreferences.setState({
      loaded: true,
      error: error instanceof Error ? error.message : "Preferências locais indisponíveis.",
    });
  }
}
export function savePreferences(value: PdfPreferences): Promise<void> {
  const next = preferencesSchema.parse(value),
    id = ++generation;
  usePreferences.setState({ value: next });
  const result = queue
    .then(async () => {
      const saved = preferencesSchema.parse(await window.api.preferences.set(next));
      committed = saved;
      if (id === generation) usePreferences.setState({ value: saved, error: "" });
    })
    .catch((error: unknown) => {
      if (id === generation) usePreferences.setState({ value: committed });
      throw error;
    });
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
export function startPreferences(): () => void {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const preferences = usePreferences.getState().value;
    document.documentElement.dataset.theme =
      preferences.theme === "system" ? (media.matches ? "dark" : "light") : preferences.theme;
    document.documentElement.dataset.uiSize = preferences.textSize;
    document.documentElement.style.setProperty("--sidebar-width", `${preferences.sidebarWidth}px`);
    document.documentElement.style.setProperty("--properties-width", `${preferences.panelWidth}px`);
  };
  const off = usePreferences.subscribe(apply);
  media.addEventListener("change", apply);
  apply();
  return () => {
    off();
    media.removeEventListener("change", apply);
  };
}
