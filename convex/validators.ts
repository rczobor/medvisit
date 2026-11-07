import { v } from "convex/values"
import type { Infer } from "convex/values"

export const resourceKind = v.union(
  v.literal("mr"),
  v.literal("ct"),
  v.literal("xray"),
  v.literal("ultrasound"),
  v.literal("therapy"),
  v.literal("consult")
)
export type ResourceKind = Infer<typeof resourceKind>

export const appointmentStatus = v.union(
  v.literal("booked"),
  v.literal("arrived"),
  v.literal("completed"),
  v.literal("noShow"),
  v.literal("cancelled")
)

/** Who created the booking: our staff, the patient online, or a partner. */
export const appointmentSource = v.union(
  v.literal("staff"),
  v.literal("online"),
  v.literal("partner")
)
export type AppointmentSource = Infer<typeof appointmentSource>

export const sex = v.union(v.literal("female"), v.literal("male"))

export const staffRole = v.union(v.literal("admin"), v.literal("reception"))

export const localDate = v.string()

export const patientFields = {
  familyName: v.string(),
  givenName: v.string(),
  sex,
  birthDate: localDate,
  birthPlace: v.optional(v.string()),
  mothersName: v.optional(v.string()),
  taj: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
}
