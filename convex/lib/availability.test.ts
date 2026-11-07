import { describe, expect, test } from "vitest"
import {
  availableStarts,
  checkPlacement,
  subtractIntervals,
  workingIntervals,
} from "./availability"
import { zonedTimeToInstant } from "./time"

const monday = "2026-11-09"
const at = (time: string, date = monday) => zonedTimeToInstant(date, time)
const span = (start: string, end: string, date = monday) => ({
  start: at(start, date),
  end: at(end, date),
})
const times = (instants: number[]) =>
  instants.map((instant) =>
    new Date(instant).toLocaleTimeString("hu-HU", {
      timeZone: "Europe/Budapest",
      hour: "2-digit",
      minute: "2-digit",
    })
  )

describe("workingIntervals", () => {
  test("keeps a lunch break as two intervals", () => {
    const rules = [
      { weekday: 1, start: "08:00", end: "12:00" },
      { weekday: 1, start: "13:00", end: "18:00" },
      { weekday: 2, start: "08:00", end: "18:00" },
    ]
    expect(workingIntervals(rules, monday)).toEqual([
      span("08:00", "12:00"),
      span("13:00", "18:00"),
    ])
  })

  test("a shift across the spring change is an hour shorter", () => {
    const rules = [{ weekday: 7, start: "01:00", end: "05:00" }]
    const [shift] = workingIntervals(rules, "2026-03-29")
    expect((shift.end - shift.start) / 3_600_000).toBe(3)
  })
})

test("subtractIntervals cuts busy time out of a shift", () => {
  expect(
    subtractIntervals(
      [span("08:00", "12:00")],
      [span("09:00", "09:30"), span("11:00", "13:00")]
    )
  ).toEqual([span("08:00", "09:00"), span("09:30", "11:00")])
})

describe("availableStarts", () => {
  const base = {
    working: [span("08:00", "12:00")],
    busy: [span("09:00", "09:25")],
    durationMinutes: 30,
    stepMinutes: 15,
  }

  test("offers grid times plus the first minute after a booking", () => {
    const starts = times(availableStarts(base))
    expect(starts.slice(0, 5)).toEqual([
      "08:00",
      "08:15",
      "08:30",
      "09:25",
      "09:30",
    ])
    expect(starts).not.toContain("08:45")
    expect(starts.at(-1)).toBe("11:30")
  })

  test("offers nothing when the exam is longer than every gap", () => {
    expect(
      availableStarts({
        ...base,
        working: [span("08:00", "09:20")],
        durationMinutes: 90,
      })
    ).toEqual([])
  })
})

describe("checkPlacement", () => {
  const options = {
    working: [span("08:00", "12:00")],
    busy: [span("09:00", "09:30")],
  }

  test("accepts an appointment that ends exactly when the next starts", () => {
    expect(checkPlacement({ ...options, ...span("08:30", "09:00") })).toBe("ok")
  })

  test("rejects overlaps and times outside the shift", () => {
    expect(checkPlacement({ ...options, ...span("09:15", "09:45") })).toBe(
      "conflict"
    )
    expect(checkPlacement({ ...options, ...span("11:45", "12:15") })).toBe(
      "outsideHours"
    )
  })
})
