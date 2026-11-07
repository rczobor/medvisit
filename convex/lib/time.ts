/**
 * Wall-clock helpers for the clinic's time zone.
 *
 * Appointments are stored as UTC instants (epoch ms). Working hours are rules
 * in Budapest wall-clock time ("07:00"), so every conversion between the two
 * goes through here. Only `Intl` is used, so the same code runs in the browser
 * and in the Convex runtime.
 */

export const CLINIC_TIME_ZONE = "Europe/Budapest"

export const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** A calendar date in the clinic's time zone, `YYYY-MM-DD`. */
export type LocalDate = string
/** A wall-clock time, `HH:MM`, 24-hour. */
export type WallTime = string

const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const wallTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/

export function parseLocalDate(date: LocalDate) {
  const match = localDatePattern.exec(date)
  if (!match) throw new RangeError(`Invalid date: ${date}`)
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ]
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new RangeError(`Invalid date: ${date}`)
  }
  return { year, month, day }
}

export function isLocalDate(value: string): value is LocalDate {
  try {
    parseLocalDate(value)
    return true
  } catch {
    return false
  }
}

export function parseWallTime(time: WallTime) {
  const match = wallTimePattern.exec(time)
  if (!match) throw new RangeError(`Invalid time: ${time}`)
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: LocalDate) {
  const { year, month, day } = parseLocalDate(date)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10)
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string) {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

/** The wall-clock reading at `instant`, encoded as if it were a UTC instant. */
function wallClockAsUtc(instant: number, timeZone: string) {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  )
}

function offsetAt(instant: number, timeZone: string) {
  const wholeSeconds = Math.floor(instant / 1000) * 1000
  return wallClockAsUtc(wholeSeconds, timeZone) - wholeSeconds
}

/**
 * The instant at which the clinic's clocks read `time` on `date`.
 *
 * Daylight-saving edge cases: a time skipped by the spring change (02:30 on
 * the last Sunday of March) moves forward by the gap, to 03:30. A time that
 * occurs twice in autumn resolves to its first occurrence.
 */
export function zonedTimeToInstant(
  date: LocalDate,
  time: WallTime,
  timeZone = CLINIC_TIME_ZONE
) {
  const { year, month, day } = parseLocalDate(date)
  const { hour, minute } = parseWallTime(time)
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  // Offsets half a day either side bracket any transition on this date.
  const offsetBefore = offsetAt(wall - DAY_MS / 2, timeZone)
  const offsetAfter = offsetAt(wall + DAY_MS / 2, timeZone)
  const matches = [wall - offsetBefore, wall - offsetAfter]
    .filter((instant) => wallClockAsUtc(instant, timeZone) === wall)
    .sort((a, b) => a - b)
  return matches[0] ?? wall - offsetBefore
}

/** Calendar date and minutes after midnight on the clinic's clocks. */
export function instantToZoned(instant: number, timeZone = CLINIC_TIME_ZONE) {
  const wall = wallClockAsUtc(instant, timeZone)
  const date = new Date(wall).toISOString().slice(0, 10)
  const minutes = Math.floor((wall % DAY_MS) / MINUTE_MS)
  return { date, minutes }
}

export function todayInClinic(now: number, timeZone = CLINIC_TIME_ZONE) {
  return instantToZoned(now, timeZone).date
}

/** The instants at which `date` starts and the next day starts (23–25 h apart). */
export function dayBounds(date: LocalDate, timeZone = CLINIC_TIME_ZONE) {
  return {
    start: zonedTimeToInstant(date, "00:00", timeZone),
    end: zonedTimeToInstant(addDays(date, 1), "00:00", timeZone),
  }
}

export function wallTimeToMinutes(time: WallTime) {
  const { hour, minute } = parseWallTime(time)
  return hour * 60 + minute
}
