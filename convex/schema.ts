import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import {
  appointmentSource,
  appointmentStatus,
  patientFields,
  resourceKind,
  staffRole,
} from "./validators"

export default defineSchema({
  staff: defineTable({
    name: v.string(),
    role: staffRole,
    tokenIdentifier: v.string(),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),

  sites: defineTable({
    name: v.string(),
    sortOrder: v.number(),
  }).index("by_sortOrder", ["sortOrder"]),

  /** A bookable calendar: a scanner, a treatment room or a practitioner. */
  resources: defineTable({
    siteId: v.id("sites"),
    name: v.string(),
    kind: resourceKind,
    slotStepMinutes: v.number(),
    sortOrder: v.number(),
  }).index("by_siteId_and_sortOrder", ["siteId", "sortOrder"]),

  services: defineTable({
    name: v.string(),
    kind: resourceKind,
    durationMinutes: v.number(),
    priceHuf: v.number(),
    contrast: v.boolean(),
  }),

  /**
   * Which resource performs which service, and for how long there. The same
   * exam is often shorter on a faster scanner.
   */
  resourceServices: defineTable({
    resourceId: v.id("resources"),
    serviceId: v.id("services"),
    durationMinutes: v.optional(v.number()),
  })
    .index("by_resourceId_and_serviceId", ["resourceId", "serviceId"])
    .index("by_serviceId", ["serviceId"]),

  /** Weekly opening hours in clinic wall time; several rows make a split day. */
  workingHours: defineTable({
    resourceId: v.id("resources"),
    weekday: v.number(),
    start: v.string(),
    end: v.string(),
  }).index("by_resourceId_and_weekday", ["resourceId", "weekday"]),

  /**
   * Time a calendar is closed on top of its weekly hours: a holiday, a
   * service visit, leave. Bookings already in the window stay and must be
   * moved by hand.
   */
  closures: defineTable({
    resourceId: v.id("resources"),
    startAt: v.number(),
    endAt: v.number(),
    reason: v.string(),
    createdBy: v.id("staff"),
  }).index("by_resourceId_and_startAt", ["resourceId", "startAt"]),

  /**
   * Extra time a calendar is open on one day on top of its weekly hours, such
   * as a Sunday MR session. It never crosses midnight, so a day's openings
   * all start within that day. Closures still apply over it.
   */
  openings: defineTable({
    resourceId: v.id("resources"),
    startAt: v.number(),
    endAt: v.number(),
    note: v.optional(v.string()),
    createdBy: v.id("staff"),
  }).index("by_resourceId_and_startAt", ["resourceId", "startAt"]),

  patients: defineTable({
    ...patientFields,
    /** Lower-cased name, TAJ, phone and birth date, for the search index. */
    searchText: v.string(),
  })
    .index("by_taj", ["taj"])
    .searchIndex("search_text", { searchField: "searchText" }),

  appointments: defineTable({
    siteId: v.id("sites"),
    resourceId: v.id("resources"),
    serviceId: v.id("services"),
    patientId: v.id("patients"),
    startAt: v.number(),
    endAt: v.number(),
    status: appointmentStatus,
    source: appointmentSource,
    /** Price at booking time; later price changes don't rewrite it. */
    priceHuf: v.number(),
    note: v.optional(v.string()),
    cancelReason: v.optional(v.string()),
    createdBy: v.id("staff"),
  })
    .index("by_resourceId_and_startAt", ["resourceId", "startAt"])
    .index("by_siteId_and_startAt", ["siteId", "startAt"])
    .index("by_patientId_and_startAt", ["patientId", "startAt"]),

  auditEvents: defineTable({
    actorId: v.id("staff"),
    action: v.string(),
    appointmentId: v.optional(v.id("appointments")),
    patientId: v.optional(v.id("patients")),
    details: v.optional(
      v.record(v.string(), v.union(v.string(), v.number(), v.null()))
    ),
  })
    .index("by_appointmentId", ["appointmentId"])
    .index("by_patientId", ["patientId"]),
})
