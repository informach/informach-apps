import { isValidLocalIsoDate, parseLocalIso } from "@/features/dashboard/date";
import { dayOfWeekToClassDay } from "./class-days";
import type { SubjectError } from "./service";
import type { AlternatingSlotInput } from "./types";
export function validateSlotsAgainstClassDays(
  slots: readonly AlternatingSlotInput[],
  classDays: readonly string[],
): SubjectError | null {
  const classDaysSet = new Set(classDays);
  for (const slot of slots) {
    if (!classDaysSet.has(slot.dayOfWeek)) {
      return { code: "SLOT_DAY_NOT_IN_CLASS_DAYS", day: slot.dayOfWeek };
    }
    if (!isValidLocalIsoDate(slot.anchorDate)) {
      return { code: "INVALID_ANCHOR_DATE", day: slot.dayOfWeek };
    }
    const anchor = parseLocalIso(slot.anchorDate);
    const anchorWeekday = dayOfWeekToClassDay(anchor.getDay());
    if (anchorWeekday !== slot.dayOfWeek) {
      return { code: "INVALID_ANCHOR_DATE", day: slot.dayOfWeek };
    }
  }
  return null;
}
