import {
  CLINIC_TIME_ZONE,
  MINUTE_MS,
  isoWeekday,
  zonedTimeToInstant,
} from "./time"
import type { LocalDate, WallTime } from "./time"

/** Half-open interval of instants, `[start, end)`. */
export type Interval = { start: number; end: number }

export type WorkingRule = { weekday: number; start: WallTime; end: WallTime }

/**
 * The longest appointment the system accepts. Overlap checks scan back this far
 * from a requested start, so it bounds those index reads.
 */
export const MAX_APPOINTMENT_MINUTES = 8 * 60

/** Merges overlapping or touching intervals into a sorted, disjoint list. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const interval of sorted) {
    const last = merged.at(-1)
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end)
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

/** The working intervals of `date`, from the weekly rules in clinic wall time. */
export function workingIntervals(
  rules: readonly WorkingRule[],
  date: LocalDate,
  timeZone = CLINIC_TIME_ZONE
): Interval[] {
  const weekday = isoWeekday(date)
  return mergeIntervals(
    rules
      .filter((rule) => rule.weekday === weekday)
      .map((rule) => ({
        start: zonedTimeToInstant(date, rule.start, timeZone),
        end: zonedTimeToInstant(date, rule.end, timeZone),
      }))
  )
}

/** The parts of `base` not covered by any interval in `busy`. */
export function subtractIntervals(
  base: readonly Interval[],
  busy: readonly Interval[]
): Interval[] {
  const blockers = mergeIntervals(busy)
  const free: Interval[] = []
  for (const interval of mergeIntervals(base)) {
    let cursor = interval.start
    for (const blocker of blockers) {
      if (blocker.end <= cursor) continue
      if (blocker.start >= interval.end) break
      if (blocker.start > cursor)
        free.push({ start: cursor, end: blocker.start })
      cursor = Math.max(cursor, blocker.end)
    }
    if (cursor < interval.end) free.push({ start: cursor, end: interval.end })
  }
  return free
}

/**
 * Start times where an appointment of `durationMinutes` fits.
 *
 * Offers two kinds of start in each free gap: the gap's first minute, so an
 * exam can follow the previous one without idle scanner time, and every grid
 * step counted from the start of the working interval, so patients get
 * round times too.
 */
export function availableStarts(options: {
  working: readonly Interval[]
  busy: readonly Interval[]
  durationMinutes: number
  stepMinutes: number
}): number[] {
  const duration = options.durationMinutes * MINUTE_MS
  const step = options.stepMinutes * MINUTE_MS
  const starts = new Set<number>()
  for (const shift of mergeIntervals(options.working)) {
    for (const gap of subtractIntervals([shift], options.busy)) {
      const candidates = [gap.start]
      const firstGridStep = Math.ceil((gap.start - shift.start) / step)
      for (
        let t = shift.start + firstGridStep * step;
        t + duration <= gap.end;
        t += step
      ) {
        candidates.push(t)
      }
      for (const start of candidates) {
        if (start + duration <= gap.end) starts.add(start)
      }
    }
  }
  return [...starts].sort((a, b) => a - b)
}

export type Placement = "ok" | "outsideHours" | "conflict"

/** Whether `[start, end)` lies inside one working interval and touches nothing busy. */
export function checkPlacement(options: {
  working: readonly Interval[]
  busy: readonly Interval[]
  start: number
  end: number
}): Placement {
  const { start, end } = options
  const insideShift = mergeIntervals(options.working).some(
    (shift) => shift.start <= start && end <= shift.end
  )
  if (!insideShift) return "outsideHours"
  const overlaps = options.busy.some(
    (busy) => busy.start < end && start < busy.end
  )
  return overlaps ? "conflict" : "ok"
}
