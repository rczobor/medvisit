import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import {
  MAX_APPOINTMENT_MINUTES,
  MAX_CLOSURE_DAYS,
  MAX_SHIFTS_PER_DAY,
  availableStarts,
  checkPlacement,
  dayRulesProblem,
  mergeIntervals,
  subtractIntervals,
  workingIntervals,
} from "./lib/availability"
import type { Interval } from "./lib/availability"
import { canTransition, occupiesSlot } from "./lib/appointmentStatus"
import { requireAdmin, requireStaff } from "./lib/auth"
import { fail } from "./lib/errors"
import {
  MINUTE_MS,
  addDays,
  dayBounds,
  instantToZoned,
  isLocalDate,
  isoWeekday,
  todayInClinic,
} from "./lib/time"
import type { LocalDate } from "./lib/time"
import { appointmentStatus, localDate } from "./validators"

const MAX_APPOINTMENT_MS = MAX_APPOINTMENT_MINUTES * MINUTE_MS
/** A day of margin covers a closure that spans a daylight-saving change. */
const CLOSURE_SCAN_MS = (MAX_CLOSURE_DAYS + 1) * 24 * 60 * MINUTE_MS
/** Clock skew allowed when booking a slot that is just starting. */
const PAST_GRACE_MS = 5 * MINUTE_MS
/** Extra openings one calendar can have on one day; `addOpening` enforces it. */
const MAX_OPENINGS_PER_DAY = 10

function requireDate(date: string): LocalDate {
  if (!isLocalDate(date)) fail("INVALID_INPUT")
  return date
}

/**
 * A resource's day: its `hours` (weekly hours plus the day's extra
 * `openings`), the `closures` that overlap the day, and the `working` time
 * left between them. The closure and opening reads span every row that could
 * reach into the day, so one added or removed concurrently conflicts with a
 * booking that relies on the time being open.
 */
async function workingDay(
  ctx: QueryCtx,
  resourceId: Id<"resources">,
  date: LocalDate
) {
  const rules = await ctx.db
    .query("workingHours")
    .withIndex("by_resourceId_and_weekday", (q) =>
      q.eq("resourceId", resourceId).eq("weekday", isoWeekday(date))
    )
    .take(20)
  const { start, end } = dayBounds(date)
  // Read in full: the time window bounds the scan, and a closure left
  // unread would count as open time.
  const closures = []
  for await (const closure of ctx.db
    .query("closures")
    .withIndex("by_resourceId_and_startAt", (q) =>
      q
        .eq("resourceId", resourceId)
        .gt("startAt", start - CLOSURE_SCAN_MS)
        .lt("startAt", end)
    )) {
    if (closure.endAt <= start) continue
    const { _id, startAt, endAt, reason } = closure
    closures.push({ _id, startAt, endAt, reason })
  }
  // Openings never cross midnight, so the day's all start inside it.
  const openings = (
    await ctx.db
      .query("openings")
      .withIndex("by_resourceId_and_startAt", (q) =>
        q.eq("resourceId", resourceId).gte("startAt", start).lt("startAt", end)
      )
      .take(MAX_OPENINGS_PER_DAY)
  ).map(({ _id, startAt, endAt, note }) => ({
    _id,
    startAt,
    endAt,
    note: note ?? null,
  }))
  const hours = mergeIntervals([
    ...workingIntervals(rules, date),
    ...openings.map((opening) => ({
      start: opening.startAt,
      end: opening.endAt,
    })),
  ])
  const working = subtractIntervals(
    hours,
    closures.map((closure) => ({ start: closure.startAt, end: closure.endAt }))
  )
  return { hours, closures, openings, working }
}

/**
 * Time already taken on a resource within `[from, to)`. The index read spans
 * every appointment that could overlap the window, so a concurrent booking
 * into it conflicts with this transaction and Convex retries one of them.
 */
async function busyIntervals(
  ctx: QueryCtx,
  resourceId: Id<"resources">,
  from: number,
  to: number,
  ignore?: Id<"appointments">
): Promise<Interval[]> {
  const appointments = await ctx.db
    .query("appointments")
    .withIndex("by_resourceId_and_startAt", (q) =>
      q
        .eq("resourceId", resourceId)
        .gt("startAt", from - MAX_APPOINTMENT_MS)
        .lt("startAt", to)
    )
    .take(1000)
  return appointments
    .filter((a) => a._id !== ignore && a.endAt > from && occupiesSlot(a.status))
    .map((a) => ({ start: a.startAt, end: a.endAt }))
}

async function bookableService(
  ctx: QueryCtx,
  resourceId: Id<"resources">,
  serviceId: Id<"services">
) {
  const link = await ctx.db
    .query("resourceServices")
    .withIndex("by_resourceId_and_serviceId", (q) =>
      q.eq("resourceId", resourceId).eq("serviceId", serviceId)
    )
    .unique()
  const service = link && (await ctx.db.get("services", serviceId))
  if (!link || !service) fail("SERVICE_NOT_ON_RESOURCE")
  return {
    service,
    durationMinutes: link.durationMinutes ?? service.durationMinutes,
  }
}

export const day = query({
  args: { siteId: v.id("sites"), date: localDate },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const date = requireDate(args.date)
    const { start, end } = dayBounds(date)

    const resourceDocs = await ctx.db
      .query("resources")
      .withIndex("by_siteId_and_sortOrder", (q) => q.eq("siteId", args.siteId))
      .take(50)
    const resources = await Promise.all(
      resourceDocs.map(async (resource) => ({
        _id: resource._id,
        name: resource.name,
        kind: resource.kind,
        ...(await workingDay(ctx, resource._id, date)),
      }))
    )

    const appointmentDocs = await ctx.db
      .query("appointments")
      .withIndex("by_siteId_and_startAt", (q) =>
        q
          .eq("siteId", args.siteId)
          .gt("startAt", start - MAX_APPOINTMENT_MS)
          .lt("startAt", end)
      )
      .take(2000)

    const patients = new Map<Id<"patients">, Doc<"patients"> | null>()
    const services = new Map<Id<"services">, Doc<"services"> | null>()
    const appointments = []
    for (const appointment of appointmentDocs) {
      if (appointment.endAt <= start) continue
      if (!patients.has(appointment.patientId)) {
        patients.set(
          appointment.patientId,
          await ctx.db.get("patients", appointment.patientId)
        )
      }
      if (!services.has(appointment.serviceId)) {
        services.set(
          appointment.serviceId,
          await ctx.db.get("services", appointment.serviceId)
        )
      }
      const patient = patients.get(appointment.patientId)
      const service = services.get(appointment.serviceId)
      appointments.push({
        _id: appointment._id,
        resourceId: appointment.resourceId,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status,
        source: appointment.source,
        note: appointment.note ?? null,
        patient: patient
          ? {
              name: `${patient.familyName} ${patient.givenName}`,
              birthDate: patient.birthDate,
              taj: patient.taj ?? null,
            }
          : null,
        service: service
          ? { name: service.name, contrast: service.contrast }
          : null,
      })
    }
    return { resources, appointments }
  },
})

/**
 * Free start times for a service on a resource and day. Past starts are
 * included: queries can't read the clock without going stale, so the client
 * hides them and `book` rejects them.
 */
export const slots = query({
  args: {
    resourceId: v.id("resources"),
    serviceId: v.id("services"),
    date: localDate,
    /** An appointment being rescheduled, whose own time counts as free. */
    ignore: v.optional(v.id("appointments")),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const date = requireDate(args.date)
    const resource = await ctx.db.get("resources", args.resourceId)
    if (!resource) fail("NOT_FOUND")
    const { durationMinutes } = await bookableService(
      ctx,
      args.resourceId,
      args.serviceId
    )
    const { start, end } = dayBounds(date)
    // Closures count as busy rather than shortening the hours, so the slot
    // grid stays anchored to the weekly hours after a closure ends off-grid.
    const { hours, closures } = await workingDay(ctx, args.resourceId, date)
    const busy = await busyIntervals(
      ctx,
      args.resourceId,
      start,
      end,
      args.ignore
    )
    const starts = availableStarts({
      working: hours,
      busy: [
        ...busy,
        ...closures.map((closure) => ({
          start: closure.startAt,
          end: closure.endAt,
        })),
      ],
      durationMinutes,
      stepMinutes: resource.slotStepMinutes,
    })
    return { durationMinutes, starts }
  },
})

async function audit(
  ctx: MutationCtx,
  event: Omit<Doc<"auditEvents">, "_id" | "_creationTime">
) {
  await ctx.db.insert("auditEvents", event)
}

/**
 * Checks that `[startAt, startAt + durationMinutes)` can be booked on the
 * resource and returns its end. The overlap read must stay in the same
 * mutation as the write that takes the time; see `busyIntervals`.
 */
async function claimTime(
  ctx: MutationCtx,
  resourceId: Id<"resources">,
  startAt: number,
  durationMinutes: number,
  ignore?: Id<"appointments">
) {
  if (
    !Number.isInteger(startAt / MINUTE_MS) ||
    durationMinutes > MAX_APPOINTMENT_MINUTES
  ) {
    fail("INVALID_INPUT")
  }
  if (startAt < Date.now() - PAST_GRACE_MS) fail("IN_PAST")

  const endAt = startAt + durationMinutes * MINUTE_MS
  const placement = checkPlacement({
    working: (await workingDay(ctx, resourceId, instantToZoned(startAt).date))
      .working,
    busy: await busyIntervals(ctx, resourceId, startAt, endAt, ignore),
    start: startAt,
    end: endAt,
  })
  if (placement === "outsideHours") fail("OUTSIDE_HOURS")
  if (placement === "conflict") fail("SLOT_TAKEN")
  return endAt
}

export const book = mutation({
  args: {
    resourceId: v.id("resources"),
    serviceId: v.id("services"),
    patientId: v.id("patients"),
    startAt: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx)
    const resource = await ctx.db.get("resources", args.resourceId)
    const patient = await ctx.db.get("patients", args.patientId)
    if (!resource || !patient) fail("NOT_FOUND")
    const { service, durationMinutes } = await bookableService(
      ctx,
      args.resourceId,
      args.serviceId
    )
    const startAt = args.startAt
    const endAt = await claimTime(ctx, resource._id, startAt, durationMinutes)

    const note = args.note?.trim()
    const appointmentId = await ctx.db.insert("appointments", {
      siteId: resource.siteId,
      resourceId: resource._id,
      serviceId: service._id,
      patientId: patient._id,
      startAt,
      endAt,
      status: "booked",
      source: "staff",
      priceHuf: service.priceHuf,
      note: note || undefined,
      createdBy: staff._id,
    })
    await audit(ctx, {
      actorId: staff._id,
      action: "appointment.booked",
      appointmentId,
      patientId: patient._id,
      details: { startAt, resourceId: resource._id, serviceId: service._id },
    })
    return appointmentId
  },
})

/**
 * Moves a booked appointment to a new start, on the same or another calendar.
 * The exam, patient and price stay; the length follows the new calendar.
 */
export const reschedule = mutation({
  args: {
    appointmentId: v.id("appointments"),
    resourceId: v.id("resources"),
    startAt: v.number(),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx)
    const appointment = await ctx.db.get("appointments", args.appointmentId)
    const resource = await ctx.db.get("resources", args.resourceId)
    if (!appointment || !resource) fail("NOT_FOUND")
    // Once the patient has arrived or the visit is closed, the record
    // describes what happened and must not move.
    if (appointment.status !== "booked") fail("NOT_MOVABLE")
    const { durationMinutes } = await bookableService(
      ctx,
      resource._id,
      appointment.serviceId
    )
    const startAt = args.startAt
    const endAt = await claimTime(
      ctx,
      resource._id,
      startAt,
      durationMinutes,
      appointment._id
    )
    if (
      resource._id === appointment.resourceId &&
      startAt === appointment.startAt &&
      endAt === appointment.endAt
    ) {
      return null
    }

    await ctx.db.patch("appointments", appointment._id, {
      siteId: resource.siteId,
      resourceId: resource._id,
      startAt,
      endAt,
    })
    await audit(ctx, {
      actorId: staff._id,
      action: "appointment.moved",
      appointmentId: appointment._id,
      patientId: appointment.patientId,
      details: {
        fromStartAt: appointment.startAt,
        fromResourceId: appointment.resourceId,
        startAt,
        resourceId: resource._id,
      },
    })
    return null
  },
})

/**
 * Closes calendars for a time, on top of their weekly hours. Bookings already
 * in the window stay; the result says how many need moving.
 */
export const addClosure = mutation({
  args: {
    resourceIds: v.array(v.id("resources")),
    startAt: v.number(),
    endAt: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx)
    const { startAt, endAt } = args
    const reason = args.reason.trim()
    const resourceIds = [...new Set(args.resourceIds)]
    const lastDay = addDays(instantToZoned(startAt).date, MAX_CLOSURE_DAYS - 1)
    if (
      !reason ||
      reason.length > 80 ||
      resourceIds.length === 0 ||
      resourceIds.length > 50 ||
      !Number.isInteger(startAt / MINUTE_MS) ||
      !Number.isInteger(endAt / MINUTE_MS) ||
      endAt <= startAt ||
      instantToZoned(endAt - 1).date > lastDay
    ) {
      fail("INVALID_INPUT")
    }
    if (endAt <= Date.now()) fail("IN_PAST")

    let affected = 0
    for (const resourceId of resourceIds) {
      const resource = await ctx.db.get("resources", resourceId)
      if (!resource) fail("NOT_FOUND")
      const closureId = await ctx.db.insert("closures", {
        resourceId,
        startAt,
        endAt,
        reason,
        createdBy: staff._id,
      })
      await audit(ctx, {
        actorId: staff._id,
        action: "closure.added",
        details: { closureId, resourceId, startAt, endAt, reason },
      })
      // Counted in full: a month-long closure on a busy calendar can cover
      // more bookings than the bounded overlap read returns.
      for await (const appointment of ctx.db
        .query("appointments")
        .withIndex("by_resourceId_and_startAt", (q) =>
          q
            .eq("resourceId", resourceId)
            .gt("startAt", startAt - MAX_APPOINTMENT_MS)
            .lt("startAt", endAt)
        )) {
        if (appointment.endAt > startAt && occupiesSlot(appointment.status))
          affected++
      }
    }
    return { affected }
  },
})

/** Reopens the time of a closure; its weekly hours become bookable again. */
export const removeClosure = mutation({
  args: { closureId: v.id("closures") },
  handler: async (ctx, { closureId }) => {
    const staff = await requireStaff(ctx)
    const closure = await ctx.db.get("closures", closureId)
    if (!closure) fail("NOT_FOUND")
    await ctx.db.delete("closures", closureId)
    await audit(ctx, {
      actorId: staff._id,
      action: "closure.removed",
      details: {
        closureId,
        resourceId: closure.resourceId,
        startAt: closure.startAt,
        endAt: closure.endAt,
        reason: closure.reason,
      },
    })
    return null
  },
})

/** A calendar's weekly hours, in clinic wall time. */
export const weeklyHours = query({
  args: { resourceId: v.id("resources") },
  handler: async (ctx, { resourceId }) => {
    await requireStaff(ctx)
    const rules = await ctx.db
      .query("workingHours")
      .withIndex("by_resourceId_and_weekday", (q) =>
        q.eq("resourceId", resourceId)
      )
      .take(7 * MAX_SHIFTS_PER_DAY)
    return rules
      .map(({ weekday, start, end }) => ({ weekday, start, end }))
      .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
  },
})

/**
 * Replaces a calendar's weekly hours. Bookings already outside the new hours
 * stay; staff move them by hand.
 */
export const setWeeklyHours = mutation({
  args: {
    resourceId: v.id("resources"),
    rules: v.array(
      v.object({ weekday: v.number(), start: v.string(), end: v.string() })
    ),
  },
  handler: async (ctx, args) => {
    const staff = await requireAdmin(ctx)
    const resource = await ctx.db.get("resources", args.resourceId)
    if (!resource) fail("NOT_FOUND")
    if (
      args.rules.some(
        (rule) =>
          !Number.isInteger(rule.weekday) ||
          rule.weekday < 1 ||
          rule.weekday > 7
      )
    ) {
      fail("INVALID_INPUT")
    }
    for (let weekday = 1; weekday <= 7; weekday++) {
      const shifts = args.rules.filter((rule) => rule.weekday === weekday)
      if (shifts.length > MAX_SHIFTS_PER_DAY || dayRulesProblem(shifts))
        fail("INVALID_INPUT")
    }

    const existing = await ctx.db
      .query("workingHours")
      .withIndex("by_resourceId_and_weekday", (q) =>
        q.eq("resourceId", resource._id)
      )
      .take(7 * MAX_SHIFTS_PER_DAY)
    for (const rule of existing) await ctx.db.delete("workingHours", rule._id)
    for (const { weekday, start, end } of args.rules) {
      await ctx.db.insert("workingHours", {
        resourceId: resource._id,
        weekday,
        start,
        end,
      })
    }
    await audit(ctx, {
      actorId: staff._id,
      action: "hours.changed",
      details: {
        resourceId: resource._id,
        hours: args.rules
          .map((rule) => `${rule.weekday} ${rule.start}-${rule.end}`)
          .sort()
          .join(", "),
      },
    })
    return null
  },
})

/**
 * Opens a calendar for extra time on one day, on top of its weekly hours,
 * such as a Sunday session when demand is high.
 */
export const addOpening = mutation({
  args: {
    resourceId: v.id("resources"),
    startAt: v.number(),
    endAt: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requireAdmin(ctx)
    const { startAt, endAt } = args
    const note = args.note?.trim() || undefined
    const date = instantToZoned(startAt).date
    if (
      (note && note.length > 80) ||
      !Number.isInteger(startAt / MINUTE_MS) ||
      !Number.isInteger(endAt / MINUTE_MS) ||
      endAt <= startAt ||
      instantToZoned(endAt - 1).date !== date
    ) {
      fail("INVALID_INPUT")
    }
    if (endAt <= Date.now()) fail("IN_PAST")
    const resource = await ctx.db.get("resources", args.resourceId)
    if (!resource) fail("NOT_FOUND")
    const { start, end } = dayBounds(date)
    const sameDay = await ctx.db
      .query("openings")
      .withIndex("by_resourceId_and_startAt", (q) =>
        q
          .eq("resourceId", resource._id)
          .gte("startAt", start)
          .lt("startAt", end)
      )
      .take(MAX_OPENINGS_PER_DAY)
    if (sameDay.length >= MAX_OPENINGS_PER_DAY) fail("INVALID_INPUT")

    const openingId = await ctx.db.insert("openings", {
      resourceId: resource._id,
      startAt,
      endAt,
      note,
      createdBy: staff._id,
    })
    await audit(ctx, {
      actorId: staff._id,
      action: "opening.added",
      details: {
        openingId,
        resourceId: resource._id,
        startAt,
        endAt,
        note: note ?? null,
      },
    })
    return openingId
  },
})

/**
 * Takes back an extra opening. Refused while bookings sit in its time, so no
 * patient is left booked onto a closed calendar.
 */
export const removeOpening = mutation({
  args: { openingId: v.id("openings") },
  handler: async (ctx, { openingId }) => {
    const staff = await requireAdmin(ctx)
    const opening = await ctx.db.get("openings", openingId)
    if (!opening) fail("NOT_FOUND")
    const busy = await busyIntervals(
      ctx,
      opening.resourceId,
      opening.startAt,
      opening.endAt
    )
    if (busy.length > 0) fail("OPENING_HAS_BOOKINGS")
    await ctx.db.delete("openings", openingId)
    await audit(ctx, {
      actorId: staff._id,
      action: "opening.removed",
      details: {
        openingId,
        resourceId: opening.resourceId,
        startAt: opening.startAt,
        endAt: opening.endAt,
        note: opening.note ?? null,
      },
    })
    return null
  },
})

export const setStatus = mutation({
  args: {
    appointmentId: v.id("appointments"),
    status: appointmentStatus,
    cancelReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx)
    const appointment = await ctx.db.get("appointments", args.appointmentId)
    if (!appointment) fail("NOT_FOUND")
    const from = appointment.status
    const to = args.status
    if (!canTransition(from, to)) fail("INVALID_TRANSITION")

    // Arrival, completion and no-show describe a visit that has started; they
    // can't be recorded for a future day.
    const visitStatus =
      to === "arrived" || to === "completed" || to === "noShow"
    const appointmentDay = instantToZoned(appointment.startAt).date
    if (visitStatus && appointmentDay > todayInClinic(Date.now()))
      fail("INVALID_TRANSITION")
    // A patient can't miss a visit that hasn't started yet.
    if (to === "noShow" && appointment.startAt > Date.now())
      fail("INVALID_TRANSITION")

    // Undoing a no-show takes the slot back, and someone may have booked it.
    if (!occupiesSlot(from) && occupiesSlot(to)) {
      const busy = await busyIntervals(
        ctx,
        appointment.resourceId,
        appointment.startAt,
        appointment.endAt,
        appointment._id
      )
      if (busy.length > 0) fail("SLOT_TAKEN")
    }

    const cancelReason =
      to === "cancelled" ? args.cancelReason?.trim() || undefined : undefined
    await ctx.db.patch("appointments", appointment._id, {
      status: to,
      cancelReason,
    })
    await audit(ctx, {
      actorId: staff._id,
      action: "appointment.status",
      appointmentId: appointment._id,
      patientId: appointment.patientId,
      details: { from, to, cancelReason: cancelReason ?? null },
    })
    return null
  },
})

export const appointment = query({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, { appointmentId }) => {
    await requireStaff(ctx)
    const found = await ctx.db.get("appointments", appointmentId)
    if (!found) return null
    const [patient, service, resource, createdBy] = await Promise.all([
      ctx.db.get("patients", found.patientId),
      ctx.db.get("services", found.serviceId),
      ctx.db.get("resources", found.resourceId),
      ctx.db.get("staff", found.createdBy),
    ])
    const events = await ctx.db
      .query("auditEvents")
      .withIndex("by_appointmentId", (q) =>
        q.eq("appointmentId", appointmentId)
      )
      .order("desc")
      .take(20)
    const actors = new Map<Id<"staff">, string>()
    for (const event of events) {
      if (!actors.has(event.actorId)) {
        actors.set(
          event.actorId,
          (await ctx.db.get("staff", event.actorId))?.name ?? ""
        )
      }
    }
    return {
      ...found,
      patient,
      service,
      resource: resource && {
        _id: resource._id,
        name: resource.name,
        kind: resource.kind,
      },
      createdByName: createdBy?.name ?? null,
      history: events.map((event) => ({
        _id: event._id,
        at: event._creationTime,
        action: event.action,
        actor: actors.get(event.actorId) ?? "",
        details: event.details ?? null,
      })),
    }
  },
})
