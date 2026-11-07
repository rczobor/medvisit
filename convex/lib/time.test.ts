import { describe, expect, test } from "vitest"
import {
  addDays,
  dayBounds,
  instantToZoned,
  isoWeekday,
  parseLocalDate,
  zonedTimeToInstant,
} from "./time"

const HOUR = 3_600_000

describe("zonedTimeToInstant", () => {
  test("uses CET in winter and CEST in summer", () => {
    expect(zonedTimeToInstant("2026-11-09", "08:00")).toBe(
      Date.UTC(2026, 10, 9, 7)
    )
    expect(zonedTimeToInstant("2026-07-01", "08:00")).toBe(
      Date.UTC(2026, 6, 1, 6)
    )
  })

  test("moves a time skipped by the spring change forward by the gap", () => {
    expect(zonedTimeToInstant("2026-03-29", "02:30")).toBe(
      zonedTimeToInstant("2026-03-29", "03:30")
    )
    expect(zonedTimeToInstant("2026-03-29", "03:30")).toBe(
      Date.UTC(2026, 2, 29, 1, 30)
    )
  })

  test("resolves a time repeated in autumn to its first occurrence", () => {
    expect(zonedTimeToInstant("2026-10-25", "02:30")).toBe(
      Date.UTC(2026, 9, 25, 0, 30)
    )
  })
})

test("days around the clock changes are 23 and 25 hours long", () => {
  const length = (date: string) => {
    const { start, end } = dayBounds(date)
    return (end - start) / HOUR
  }
  expect(length("2026-03-29")).toBe(23)
  expect(length("2026-10-25")).toBe(25)
  expect(length("2026-11-09")).toBe(24)
})

test("instantToZoned reads the clinic's calendar date and minutes", () => {
  expect(instantToZoned(Date.UTC(2026, 10, 8, 23, 30))).toEqual({
    date: "2026-11-09",
    minutes: 30,
  })
})

test("calendar arithmetic", () => {
  expect(isoWeekday("2026-11-09")).toBe(1)
  expect(isoWeekday("2026-11-08")).toBe(7)
  expect(addDays("2026-11-30", 1)).toBe("2026-12-01")
  expect(() => parseLocalDate("2026-02-30")).toThrow(RangeError)
})
