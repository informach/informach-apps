import { readAccount, revokeAccountDevice } from "./repository";
export function getAccount(userId: string) {
  return readAccount(userId);
}
export function deactivateDevice(userId: string, deviceId: string) {
  return revokeAccountDevice(userId, deviceId);
}
