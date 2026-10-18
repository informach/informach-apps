import { type BrowserWindow, session, type WebContents } from "electron";
import { lessonPermissionAllowed } from "../shared/guidedPlan.ts";

/**
 * The lesson's own browser profile: the visible lesson window, where the teacher logs in and
 * marks targets, and the offscreen window that captures a take share it. The platform is a web
 * page from the internet: it gets nothing beyond what showing a lesson needs (fullscreen and
 * writing to the clipboard). Microphone, camera, location, notifications, opening other
 * programs and the rest are refused, asked or merely checked.
 */

export const GUIDED_PARTITION = "persist:ediaula-guided-web";

let configured = false;

export function lessonSession(): Electron.Session {
  const s = session.fromPartition(GUIDED_PARTITION);
  if (!configured) {
    configured = true;
    s.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(lessonPermissionAllowed(permission)),
    );
    s.setPermissionCheckHandler((_wc, permission) => lessonPermissionAllowed(permission));
  }
  return s;
}

const web = (url: string): boolean => /^https?:/i.test(url);

/**
 * A window of the lesson: no menu (so Ctrl+W and Ctrl+R the page does not take never close or
 * reload it), only web addresses in the page and its frames, new windows opened in its place.
 */
export function guardLessonWindow(window: BrowserWindow): void {
  window.setMenu(null);
  const wc: WebContents = window.webContents;
  wc.on("will-navigate", (event, next) => {
    if (!web(next)) event.preventDefault();
  });
  wc.on("will-frame-navigate", (event) => {
    if (!web(event.url) && event.url !== "about:blank" && event.url !== "about:srcdoc")
      event.preventDefault();
  });
  wc.setWindowOpenHandler(({ url }) => {
    // A page that fails to open shows its error in the window, where the step finds it.
    if (web(url)) void wc.loadURL(url).catch(() => undefined);
    return { action: "deny" };
  });
}
