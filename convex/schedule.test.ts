/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"
import { zonedTimeToInstant } from "./lib/time"

const modules = import.meta.glob("./**/*.ts")

// A Monday, so the weekday working hours below apply.
const day = "2030-01-07"
const at = (time: string) => zonedTimeToInstant(day, time)
const staffToken = "https://issuer.example|reception-1"

async function setup() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const staffId = await ctx.db.insert("staff", {
      name: "Teszt Recepció",
      role: "reception",
      tokenIdentifier: staffToken,
    })
    const siteId = await ctx.db.insert("sites", { name: "Teszt", sortOrder: 0 })
    const resourceId = await ctx.db.insert("resources", {
      siteId,
      name: "MR",
      kind: "mr",
      slotStepMinutes: 5,
      sortOrder: 0,
    })
    await ctx.db.insert("workingHours", {
      resourceId,
      weekday: 1,
      start: "08:00",
      end: "12:00",
    })
    const serviceId = await ctx.db.insert("services", {
      name: "Térd MR",
      kind: "mr",
      durationMinutes: 30,
      priceHuf: 54_900,
      contrast: false,
    })
    const otherServiceId = await ctx.db.insert("services", {
      name: "Mellkas CT",
      kind: "ct",
      durationMinutes: 15,
      priceHuf: 44_900,
      contrast: false,
    })
    await ctx.db.insert("resourceServices", { resourceId, serviceId })
    const patientId = await ctx.db.insert("patients", {
      familyName: "Teszt",
      givenName: "Elek",
      sex: "male",
      birthDate: "1980-01-01",
      searchText: "teszt elek",
    })
    return { staffId, siteId, resourceId, serviceId, otherServiceId, patientId }
  })
  return { t, staff: t.withIdentity({ tokenIdentifier: staffToken }), ...ids }
}

beforeEach(() => {
  // Only the clock is faked; convex-test still needs real timers. It reads
  // the clock once, in convexTest(), so tests change it before setup().
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(at("08:30"))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe("book", () => {
  test("a booked slot can't be booked again, but the next one can", async () => {
    const { staff, resourceId, serviceId, patientId } = await setup()
    const booking = { resourceId, serviceId, patientId }
    await staff.mutation(api.schedule.book, {
      ...booking,
      startAt: at("09:00"),
    })

    await expect(
      staff.mutation(api.schedule.book, { ...booking, startAt: at("09:15") })
    ).rejects.toMatchObject({ data: { code: "SLOT_TAKEN" } })
    await staff.mutation(api.schedule.book, {
      ...booking,
      startAt: at("09:30"),
    })

    const { starts } = await staff.query(api.schedule.slots, {
      resourceId,
      serviceId,
      date: day,
    })
    expect(starts).not.toContain(at("09:00"))
    expect(starts).toContain(at("10:00"))
  })

  test("rejects times outside working hours, in the past, or a service the resource doesn't do", async () => {
    const { staff, resourceId, serviceId, otherServiceId, patientId } =
      await setup()
    const booking = { resourceId, serviceId, patientId }
    await expect(
      staff.mutation(api.schedule.book, { ...booking, startAt: at("11:45") })
    ).rejects.toMatchObject({ data: { code: "OUTSIDE_HOURS" } })
    await expect(
      staff.mutation(api.schedule.book, { ...booking, startAt: at("08:00") })
    ).rejects.toMatchObject({ data: { code: "IN_PAST" } })
    await expect(
      staff.mutation(api.schedule.book, {
        ...booking,
        serviceId: otherServiceId,
        startAt: at("10:00"),
      })
    ).rejects.toMatchObject({ data: { code: "SERVICE_NOT_ON_RESOURCE" } })
  })
})

describe("access", () => {
  test("requires a staff sign-in unless the deployment is a synthetic demo", async () => {
    const { t, siteId } = await setup()
    vi.stubEnv("MEDVISIT_SYNTHETIC_DEMO", "")
    await expect(
      t.query(api.schedule.day, { siteId, date: day })
    ).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    })
    await expect(
      t
        .withIdentity({ tokenIdentifier: "https://issuer.example|stranger" })
        .query(api.schedule.day, { siteId, date: day })
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } })
  })
})

describe("setStatus", () => {
  test("undoing a no-show fails once the slot has been rebooked", async () => {
    const { t, staff, resourceId, serviceId, patientId, siteId, staffId } =
      await setup()
    const missed = await t.run((ctx) =>
      ctx.db.insert("appointments", {
        siteId,
        resourceId,
        serviceId,
        patientId,
        startAt: at("08:30"),
        endAt: at("09:00"),
        status: "booked",
        source: "staff",
        priceHuf: 54_900,
        createdBy: staffId,
      })
    )
    await staff.mutation(api.schedule.setStatus, {
      appointmentId: missed,
      status: "noShow",
    })
    await staff.mutation(api.schedule.book, {
      resourceId,
      serviceId,
      patientId,
      startAt: at("08:35"),
    })

    await expect(
      staff.mutation(api.schedule.setStatus, {
        appointmentId: missed,
        status: "booked",
      })
    ).rejects.toMatchObject({ data: { code: "SLOT_TAKEN" } })
  })

  test("a no-show can't be recorded before the visit starts", async () => {
    const { staff, resourceId, serviceId, patientId } = await setup()
    const appointmentId = await staff.mutation(api.schedule.book, {
      resourceId,
      serviceId,
      patientId,
      startAt: at("09:00"),
    })
    await expect(
      staff.mutation(api.schedule.setStatus, {
        appointmentId,
        status: "noShow",
      })
    ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } })
  })

  test("arrival can't be recorded for a future day", async () => {
    // convex-test reads the clock when the harness is created, so set it first.
    vi.setSystemTime(zonedTimeToInstant("2030-01-06", "12:00"))
    const { staff, resourceId, serviceId, patientId } = await setup()
    const appointmentId = await staff.mutation(api.schedule.book, {
      resourceId,
      serviceId,
      patientId,
      startAt: at("10:00"),
    })
    await expect(
      staff.mutation(api.schedule.setStatus, {
        appointmentId,
        status: "arrived",
      })
    ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } })
  })
})

describe("reschedule", () => {
  test("moves a booking into time that overlaps its old slot, and frees the old one", async () => {
    const { t, staff, resourceId, serviceId, patientId } = await setup()
    const appointmentId = await staff.mutation(api.schedule.book, {
      resourceId,
      serviceId,
      patientId,
      startAt: at("09:00"),
    })

    // The appointment's own slot counts as free while it is being moved.
    const { starts } = await staff.query(api.schedule.slots, {
      resourceId,
      serviceId,
      date: day,
      ignore: appointmentId,
    })
    expect(starts).toContain(at("09:15"))

    await staff.mutation(api.schedule.reschedule, {
      appointmentId,
      resourceId,
      startAt: at("09:15"),
    })
    const moved = await t.run((ctx) =>
      ctx.db.get("appointments", appointmentId)
    )
    expect(moved).toMatchObject({ startAt: at("09:15"), endAt: at("09:45") })
    await staff.mutation(api.schedule.book, {
      resourceId,
      serviceId,
      patientId,
      startAt: at("08:45"),
    })
    const history = await t.run((ctx) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_appointmentId", (q) =>
          q.eq("appointmentId", appointmentId)
        )
        .collect()
    )
    expect(history.map((event) => event.action)).toEqual([
      "appointment.booked",
      "appointment.moved",
    ])
  })

  test("moves to another calendar with that calendar's length for the exam", async () => {
    const { t, staff, siteId, resourceId, serviceId, patientId } = await setup()
    const fastId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("resources", {
        siteId,
        name: "MR 3 T",
        kind: "mr",
        slotStepMinutes: 5,
        sortOrder: 1,
      })
      await ctx.db.insert("workingHours", {
        resourceId: id,
        weekday: 1,
        start: "08:00",
        end: "12:00",
      })
      await ctx.db.insert("resourceServices", {
        resourceId: id,
        serviceId,
        durationMinutes: 20,
      })
      return id
    })
    const appointmentId = await staff.mutation(api.schedule.book, {
      resourceId,
      serviceId,
      patientId,
      startAt: at("09:00"),
    })
    await staff.mutation(api.schedule.reschedule, {
      appointmentId,
      resourceId: fastId,
      startAt: at("10:00"),
    })
    const moved = await t.run((ctx) =>
      ctx.db.get("appointments", appointmentId)
    )
    expect(moved).toMatchObject({
      resourceId: fastId,
      startAt: at("10:00"),
      endAt: at("10:20"),
    })
  })

  test("refuses taken time, the past, and visits that have started", async () => {
    const { staff, resourceId, serviceId, patientId } = await setup()
    const booking = { resourceId, serviceId, patientId }
    const appointmentId = await staff.mutation(api.schedule.book, {
      ...booking,
      startAt: at("09:00"),
    })
    await staff.mutation(api.schedule.book, {
      ...booking,
      startAt: at("10:00"),
    })

    await expect(
      staff.mutation(api.schedule.reschedule, {
        appointmentId,
        resourceId,
        startAt: at("10:15"),
      })
    ).rejects.toMatchObject({ data: { code: "SLOT_TAKEN" } })
    await expect(
      staff.mutation(api.schedule.reschedule, {
        appointmentId,
        resourceId,
        startAt: at("08:00"),
      })
    ).rejects.toMatchObject({ data: { code: "IN_PAST" } })

    await staff.mutation(api.schedule.setStatus, {
      appointmentId,
      status: "arrived",
    })
    await expect(
      staff.mutation(api.schedule.reschedule, {
        appointmentId,
        resourceId,
        startAt: at("11:00"),
      })
    ).rejects.toMatchObject({ data: { code: "NOT_MOVABLE" } })
  })
})

describe("closures", () => {
  test("a closure blocks booking until it is removed, and reports bookings inside it", async () => {
    const { staff, siteId, resourceId, serviceId, patientId } = await setup()
    const booking = { resourceId, serviceId, patientId }
    await staff.mutation(api.schedule.book, {
      ...booking,
      startAt: at("10:00"),
    })

    const { affected } = await staff.mutation(api.schedule.addClosure, {
      resourceIds: [resourceId],
      startAt: at("09:30"),
      endAt: at("11:00"),
      reason: "Karbantartás",
    })
    expect(affected).toBe(1)

    await expect(
      staff.mutation(api.schedule.book, { ...booking, startAt: at("09:15") })
    ).rejects.toMatchObject({ data: { code: "OUTSIDE_HOURS" } })
    const { starts } = await staff.query(api.schedule.slots, {
      resourceId,
      serviceId,
      date: day,
    })
    expect(starts).toContain(at("09:00"))
    expect(starts).not.toContain(at("09:15"))
    expect(starts).not.toContain(at("10:30"))
    expect(starts).toContain(at("11:00"))

    const board = await staff.query(api.schedule.day, { siteId, date: day })
    const [closure] = board.resources[0].closures
    expect(closure).toMatchObject({ reason: "Karbantartás" })
    expect(board.resources[0].hours).toEqual([
      { start: at("08:00"), end: at("12:00") },
    ])

    await staff.mutation(api.schedule.removeClosure, {
      closureId: closure._id,
    })
    await staff.mutation(api.schedule.book, {
      ...booking,
      startAt: at("09:15"),
    })
  })

  test("after a closure that ends off the grid, the grid times stay", async () => {
    const { t, staff, resourceId, serviceId } = await setup()
    await t.run((ctx) =>
      ctx.db.patch("resources", resourceId, { slotStepMinutes: 15 })
    )
    await staff.mutation(api.schedule.addClosure, {
      resourceIds: [resourceId],
      startAt: at("08:30"),
      endAt: at("09:10"),
      reason: "Karbantartás",
    })
    const { starts } = await staff.query(api.schedule.slots, {
      resourceId,
      serviceId,
      date: day,
    })
    expect(starts).toEqual(
      expect.arrayContaining([at("09:10"), at("09:15"), at("09:30")])
    )
    expect(starts).not.toContain(at("09:25"))
  })

  test("a closure that started days earlier still closes the day", async () => {
    const { staff, resourceId, serviceId, patientId } = await setup()
    await staff.mutation(api.schedule.addClosure, {
      resourceIds: [resourceId],
      startAt: zonedTimeToInstant("2030-01-01", "00:00"),
      endAt: zonedTimeToInstant("2030-01-10", "00:00"),
      reason: "Szabadság",
    })
    await expect(
      staff.mutation(api.schedule.book, {
        resourceId,
        serviceId,
        patientId,
        startAt: at("10:00"),
      })
    ).rejects.toMatchObject({ data: { code: "OUTSIDE_HOURS" } })
  })

  test("rejects closures longer than the limit", async () => {
    const { staff, resourceId } = await setup()
    await expect(
      staff.mutation(api.schedule.addClosure, {
        resourceIds: [resourceId],
        startAt: zonedTimeToInstant("2030-01-07", "00:00"),
        endAt: zonedTimeToInstant("2030-02-08", "00:00"),
        reason: "Felújítás",
      })
    ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } })
  })
})
