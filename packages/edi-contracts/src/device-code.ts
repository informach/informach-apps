/**
 * Device-authorization user codes, as Better Auth issues and normalises them:
 * eight characters, compared without separators and without case. People read
 * and type them in two groups of four ("WDJB MJHT").
 */
export const DEVICE_USER_CODE_LENGTH = 8;

export function normalizeDeviceUserCode(input: string) {
  return input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function isCompleteDeviceUserCode(input: string) {
  return normalizeDeviceUserCode(input).length === DEVICE_USER_CODE_LENGTH;
}

export function formatDeviceUserCode(input: string) {
  const code = normalizeDeviceUserCode(input);
  return code.length === DEVICE_USER_CODE_LENGTH ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}
