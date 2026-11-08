import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { requireStaff } from "./lib/auth"
import { fail } from "./lib/errors"
import { foldForSearch, patientSearchText } from "./lib/search"
import { isValidTaj, normalizeTaj } from "./lib/taj"
import { isLocalDate, todayInClinic } from "./lib/time"
import { patientFields } from "./validators"
import type { Infer } from "convex/values"

function summary(patient: Doc<"patients">) {
  return {
    _id: patient._id,
    familyName: patient.familyName,
    givenName: patient.givenName,
    birthDate: patient.birthDate,
    taj: patient.taj ?? null,
    phone: patient.phone ?? null,
  }
}

export const search = query({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const text = foldForSearch(args.text)
    if (text.length < 2) return []

    const taj = normalizeTaj(text)
    if (/^\d{9}$/.test(taj)) {
      const byTaj = await ctx.db
        .query("patients")
        .withIndex("by_taj", (q) => q.eq("taj", taj))
        .take(1)
      if (byTaj.length > 0) return byTaj.map(summary)
    }

    const matches = await ctx.db
      .query("patients")
      .withSearchIndex("search_text", (q) => q.search("searchText", text))
      .take(8)
    return matches.map(summary)
  },
})

const optionalText = (value: string | undefined) => value?.trim() || undefined

const patientArgs = v.object(patientFields)

/**
 * Trims and checks patient fields for `create` and `update`. A TAJ already
 * on another patient fails, so one TAJ always finds one patient.
 */
async function cleanPatient(
  ctx: MutationCtx,
  args: Infer<typeof patientArgs>,
  self?: Id<"patients">
) {
  const familyName = args.familyName.trim()
  const givenName = args.givenName.trim()
  if (!familyName || !givenName) fail("INVALID_INPUT")
  if (
    !isLocalDate(args.birthDate) ||
    args.birthDate < "1900-01-01" ||
    args.birthDate > todayInClinic(Date.now())
  ) {
    fail("INVALID_INPUT")
  }

  const taj = args.taj ? normalizeTaj(args.taj) : undefined
  if (taj) {
    if (!isValidTaj(taj)) fail("INVALID_TAJ")
    const existing = await ctx.db
      .query("patients")
      .withIndex("by_taj", (q) => q.eq("taj", taj))
      .take(2)
    if (existing.some((patient) => patient._id !== self)) fail("DUPLICATE_TAJ")
  }

  const email = optionalText(args.email)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("INVALID_INPUT")

  return {
    familyName,
    givenName,
    sex: args.sex,
    birthDate: args.birthDate,
    birthPlace: optionalText(args.birthPlace),
    mothersName: optionalText(args.mothersName),
    taj,
    phone: optionalText(args.phone),
    email,
  }
}

export const create = mutation({
  args: patientFields,
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx)
    const patient = await cleanPatient(ctx, args)
    const patientId = await ctx.db.insert("patients", {
      ...patient,
      searchText: patientSearchText(patient),
    })
    await ctx.db.insert("auditEvents", {
      actorId: staff._id,
      action: "patient.created",
      patientId,
    })
    return patientId
  },
})

/** Fields compared to tell staff, in the audit log, what an edit changed. */
const editableFields = [
  "familyName",
  "givenName",
  "sex",
  "birthDate",
  "birthPlace",
  "mothersName",
  "taj",
  "phone",
  "email",
] as const

export const update = mutation({
  args: { patientId: v.id("patients"), ...patientFields },
  handler: async (ctx, { patientId, ...args }) => {
    const staff = await requireStaff(ctx)
    const existing = await ctx.db.get("patients", patientId)
    if (!existing) fail("NOT_FOUND")
    const patient = await cleanPatient(ctx, args, patientId)
    const changed = editableFields.filter(
      (field) => patient[field] !== existing[field]
    )
    if (changed.length === 0) return null
    // `replace` so a cleared optional field is removed, not kept.
    await ctx.db.replace("patients", patientId, {
      ...patient,
      searchText: patientSearchText(patient),
    })
    // Field names only: the audit log shouldn't hold a second copy of the data.
    await ctx.db.insert("auditEvents", {
      actorId: staff._id,
      action: "patient.updated",
      patientId,
      details: { fields: changed.join(",") },
    })
    return null
  },
})

/** A patient's record and visits, newest first, for the patient card. */
export const get = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await requireStaff(ctx)
    const patient = await ctx.db.get("patients", patientId)
    if (!patient) return null
    const appointmentDocs = await ctx.db
      .query("appointments")
      .withIndex("by_patientId_and_startAt", (q) =>
        q.eq("patientId", patientId)
      )
      .order("desc")
      .take(100)

    const names = new Map<string, string | null>()
    async function nameOf<T extends "services" | "resources" | "sites">(
      table: T,
      id: Id<T>
    ) {
      if (!names.has(id)) {
        names.set(id, (await ctx.db.get(table, id))?.name ?? null)
      }
      return names.get(id) ?? null
    }
    const appointments = []
    for (const appointment of appointmentDocs) {
      appointments.push({
        _id: appointment._id,
        siteId: appointment.siteId,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status,
        service: await nameOf("services", appointment.serviceId),
        resource: await nameOf("resources", appointment.resourceId),
        site: await nameOf("sites", appointment.siteId),
      })
    }
    return {
      patient: {
        _id: patient._id,
        familyName: patient.familyName,
        givenName: patient.givenName,
        sex: patient.sex,
        birthDate: patient.birthDate,
        birthPlace: patient.birthPlace ?? null,
        mothersName: patient.mothersName ?? null,
        taj: patient.taj ?? null,
        phone: patient.phone ?? null,
        email: patient.email ?? null,
      },
      appointments,
    }
  },
})
