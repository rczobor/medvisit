import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import { requireStaff } from "./lib/auth"
import { fail } from "./lib/errors"
import { foldForSearch, patientSearchText } from "./lib/search"
import { isValidTaj, normalizeTaj } from "./lib/taj"
import { isLocalDate, todayInClinic } from "./lib/time"
import { patientFields } from "./validators"

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

export const create = mutation({
  args: patientFields,
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx)
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
        .take(1)
      if (existing.length > 0) fail("DUPLICATE_TAJ")
    }

    const email = optionalText(args.email)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail("INVALID_INPUT")

    const patient = {
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
