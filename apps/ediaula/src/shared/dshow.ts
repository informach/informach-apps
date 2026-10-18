/**
 * DirectShow devices as FFmpeg lists them (`-list_devices true -f dshow -i dummy`). Each device
 * has the friendly name shown to the teacher and, usually, an alternative name that is unique
 * and safe to open: dshow splits `audio=…:video=…` at colons, so a friendly name with ":" cannot
 * be opened, and two devices may share a friendly name.
 */

export interface DshowDevice {
  /** Friendly name, for the interface and the settings. */
  name: string;
  /** Alternative name (`@device_…`), what FFmpeg opens; absent when the listing has none. */
  id?: string;
}

const DEVICE = /"([^"]+)" \((audio|video)\)/;
const ALTERNATIVE = /Alternative name "([^"]+)"/;

export function parseDshowDevices(text: string): {
  microphones: DshowDevice[];
  cameras: DshowDevice[];
} {
  const microphones: DshowDevice[] = [];
  const cameras: DshowDevice[] = [];
  let last: DshowDevice | null = null;
  for (const line of text.split(/\r?\n/)) {
    const device = DEVICE.exec(line);
    if (device) {
      last = { name: device[1] };
      (device[2] === "audio" ? microphones : cameras).push(last);
      continue;
    }
    const alternative = ALTERNATIVE.exec(line);
    if (alternative && last && !last.id) last.id = alternative[1];
  }
  return { microphones, cameras };
}

/** What FFmpeg should open for a friendly name: its alternative name when known. */
export function dshowName(devices: readonly DshowDevice[], name: string): string {
  return devices.find((d) => d.name === name)?.id ?? name;
}
