import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import {
  MAX_APPOINTMENT_MINUTES,
  availableStarts,
  checkPlacement,
  workingIntervals,
} from "./lib/availability"
import type { Interval } from "./lib/availability"
import { canTransition, occupiesSlot } from "./lib/appointmentStatus"
import { requireStaff } from "./lib/auth"
import { fail } from "./lib/errors"
import {
  MINUTE_MS,
  dayBounds,
  instantToZoned,
  isLocalDate,
  isoWeekday,
  todayInClinic,
} from "./lib/time"
import type { LocalDate } from "./lib/time"
import { appointmentStatus, localDate } from "./validators"

const MAX_APPOINTMENT_MS = MAX_APPOINTMENT_MINUTES * MINUTE_MS
/** Clock skew allowed when booking a slot that is just starting. */
const PAST_GRACE_MS = 5 * MINUTE_MS

function requireDate(date: string): LocalDate {
  if (!isLocalDate(date)) fail("INVALID_INPUT")
  return date
}

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
  return workingIntervals(rules, date)
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
        working: await workingDay(ctx, resource._id, date),
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
    const starts = availableStarts({
      working: await workingDay(ctx, args.resourceId, date),
      busy: await busyIntervals(ctx, args.resourceId, start, end, args.ignore),
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
    working: await workingDay(ctx, resourceId, instantToZoned(startAt).date),
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
