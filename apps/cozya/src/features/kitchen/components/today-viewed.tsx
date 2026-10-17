"use client";
import { useEffect } from "react";
import { catchActionResult } from "@/features/recipes/components/action-errors";
import { recordTodayViewedAction } from "../event-actions";

/** Counts a visit from the browser only, so link prefetching never looks like a habit. */
export function TodayViewed() {
  useEffect(() => {
    void catchActionResult(() => recordTodayViewedAction({}));
  }, []);
  return null;
}
