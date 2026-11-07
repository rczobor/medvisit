import { CLINIC_TIME_ZONE, parseLocalDate } from "../../convex/lib/time"
import type { LocalDate } from "../../convex/lib/time"

const time = new Intl.DateTimeFormat("hu-HU", {
  timeZone: CLINIC_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
})

export function formatTime(instant: number) {
  return time.format(instant)
}

export function formatTimeRange(start: number, end: number) {
  return `${formatTime(start)}–${formatTime(end)}`
}

// Local dates are calendar days, so they are formatted in UTC to avoid any
// shift from the browser's own time zone.
const longDay = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "UTC",
  month: "long",
  day: "numeric",
  weekday: "long",
})
const longDayWithYear = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
})
const shortDate = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function utcDate(date: LocalDate) {
  const { year, month, day } = parseLocalDate(date)
  return new Date(Date.UTC(year, month - 1, day))
}

/** "november 9., hétfő", with the year when it isn't `currentYear`. */
export function formatDay(date: LocalDate, currentYear?: number) {
  const value = utcDate(date)
  return value.getUTCFullYear() === currentYear
    ? longDay.format(value)
    : longDayWithYear.format(value)
}

/** "1980. 01. 01." */
export function formatDate(date: LocalDate) {
  return shortDate.format(utcDate(date))
}

const huf = new Intl.NumberFormat("hu-HU", {
  style: "currency",
  currency: "HUF",
  maximumFractionDigits: 0,
})

export function formatHuf(amount: number) {
  return huf.format(amount)
}

export function formatMinutes(minutes: number) {
  return `${minutes} perc`
}
