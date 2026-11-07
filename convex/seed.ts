/**
 * Synthetic demo data. Every name, TAJ, phone number and note here is
 * generated; none comes from a real patient. The data is deterministic for a
 * given anchor date, so screenshots of the same day match between runs.
 *
 *   pnpm seed                    # anchored on today and the current time
 *   pnpm seed '{"anchorDate":"2026-11-09","now":1794213000000}'
 *
 * Pass both for screenshots: statuses depend on `now` (past visits are
 * completed, current ones arrived), so a fixed `now` gives a fixed board.
 */
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalMutation } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { workingIntervals } from "./lib/availability"
import type { WorkingRule } from "./lib/availability"
import { DEMO_TOKEN_IDENTIFIER, isSyntheticDemo } from "./lib/auth"
import { fail } from "./lib/errors"
import { patientSearchText } from "./lib/search"
import { tajCheckDigit } from "./lib/taj"
import { MINUTE_MS, addDays, isLocalDate, todayInClinic } from "./lib/time"
import type { AppointmentSource, ResourceKind } from "./validators"

const tables = [
  "auditEvents",
  "appointments",
  "patients",
  "workingHours",
  "resourceServices",
  "services",
  "resources",
  "sites",
  "staff",
] as const

const DELETE_BATCH = 2000

/** Wipes the deployment and repopulates it. Synthetic deployments only. */
const seedArgs = {
  anchorDate: v.optional(v.string()),
  now: v.optional(v.number()),
}

export const reset = internalMutation({
  args: seedArgs,
  handler: async (ctx, args) => {
    if (!isSyntheticDemo()) fail("NOT_SYNTHETIC_DEPLOYMENT")
    if (args.anchorDate !== undefined && !isLocalDate(args.anchorDate))
      fail("INVALID_INPUT")
    for (const table of tables) {
      const rows = await ctx.db.query(table).take(DELETE_BATCH)
      for (const row of rows) await ctx.db.delete(table, row._id)
      if (rows.length === DELETE_BATCH) {
        await ctx.scheduler.runAfter(0, internal.seed.reset, args)
        return "Deleting in batches; populating when empty."
      }
    }
    await ctx.scheduler.runAfter(0, internal.seed.populate, args)
    return "Cleared; populating."
  },
})

export const populate = internalMutation({
  args: seedArgs,
  handler: async (ctx, args) => {
    if (!isSyntheticDemo()) fail("NOT_SYNTHETIC_DEPLOYMENT")
    const now = args.now ?? Date.now()
    const anchorDate = args.anchorDate ?? todayInClinic(now)
    const random = mulberry32(hashString(anchorDate))

    const staffId = await ctx.db.insert("staff", {
      name: "Demó recepció",
      role: "reception",
      tokenIdentifier: DEMO_TOKEN_IDENTIFIER,
    })

    const serviceIds = new Map<string, Id<"services">>()
    for (const service of services) {
      serviceIds.set(service.name, await ctx.db.insert("services", service))
    }

    const resources = await insertSites(ctx, serviceIds)
    const patientIds = await insertPatients(ctx, random, 180)

    let count = 0
    for (let offset = -3; offset <= 7; offset++) {
      const date = addDays(anchorDate, offset)
      for (const resource of resources) {
        count += await fillDay(ctx, {
          resource,
          date,
          now,
          random,
          patientIds,
          staffId,
        })
      }
    }
    return `Seeded ${patientIds.length} patients and ${count} appointments around ${anchorDate}.`
  },
})

type ServiceSeed = {
  name: string
  kind: ResourceKind
  durationMinutes: number
  priceHuf: number
  contrast: boolean
}

const services: ServiceSeed[] = [
  mr("Koponya MR", 30, 64_900),
  mr("Koponya MR kontrasztanyaggal", 45, 89_900, true),
  mr("Nyaki gerinc MR", 30, 59_900),
  mr("Ágyéki gerinc MR", 30, 59_900),
  mr("Térd MR", 25, 54_900),
  mr("Váll MR", 30, 59_900),
  mr("Csípő MR", 30, 59_900),
  mr("Hasi MR kontrasztanyaggal", 50, 109_900, true),
  mr("Multiparametrikus prosztata MR", 45, 119_900, true),
  mr("Emlő MR", 45, 119_900, true),
  {
    name: "Koponya CT",
    kind: "ct",
    durationMinutes: 15,
    priceHuf: 39_900,
    contrast: false,
  },
  {
    name: "Mellkas CT",
    kind: "ct",
    durationMinutes: 15,
    priceHuf: 44_900,
    contrast: false,
  },
  {
    name: "Has-kismedence CT kontrasztanyaggal",
    kind: "ct",
    durationMinutes: 30,
    priceHuf: 69_900,
    contrast: true,
  },
  {
    name: "Mellkas röntgen",
    kind: "xray",
    durationMinutes: 10,
    priceHuf: 12_900,
    contrast: false,
  },
  {
    name: "Gerinc röntgen",
    kind: "xray",
    durationMinutes: 15,
    priceHuf: 14_900,
    contrast: false,
  },
  {
    name: "Végtag röntgen",
    kind: "xray",
    durationMinutes: 10,
    priceHuf: 11_900,
    contrast: false,
  },
  {
    name: "Gyógytorna",
    kind: "therapy",
    durationMinutes: 30,
    priceHuf: 14_000,
    contrast: false,
  },
  {
    name: "Magnetoterápia",
    kind: "therapy",
    durationMinutes: 20,
    priceHuf: 6_000,
    contrast: false,
  },
  {
    name: "Ortopédiai szakrendelés",
    kind: "consult",
    durationMinutes: 20,
    priceHuf: 29_000,
    contrast: false,
  },
]

function mr(
  name: string,
  durationMinutes: number,
  priceHuf: number,
  contrast = false
) {
  return { name, kind: "mr" as const, durationMinutes, priceHuf, contrast }
}

const weekdays = (start: string, end: string, days = [1, 2, 3, 4, 5]) =>
  days.map((weekday) => ({ weekday, start, end }))

type ResourceSeed = {
  name: string
  kind: ResourceKind
  step: number
  hours: WorkingRule[]
  services: string[]
  /** Duration factor on this resource; a 3 T scanner is faster. */
  speed?: number
  /** Share of working time the demo fills. */
  load: number
}

const servicesOf = (kind: ResourceKind) =>
  services
    .filter((service) => service.kind === kind)
    .map((service) => service.name)

const mrHours = [
  ...weekdays("07:00", "21:00"),
  { weekday: 6, start: "08:00", end: "14:00" },
]

const sites: { name: string; resources: ResourceSeed[] }[] = [
  {
    name: "Medical Point",
    resources: [
      {
        name: "MR 1,5 T",
        kind: "mr",
        step: 15,
        hours: mrHours,
        services: servicesOf("mr"),
        load: 0.87,
      },
      {
        name: "Röntgen",
        kind: "xray",
        step: 10,
        hours: weekdays("08:00", "18:00"),
        services: servicesOf("xray"),
        load: 0.12,
      },
      {
        name: "Gyógytorna",
        kind: "therapy",
        step: 15,
        hours: [...weekdays("08:00", "12:00"), ...weekdays("13:00", "18:00")],
        services: ["Gyógytorna"],
        load: 0.67,
      },
      {
        name: "Magnetoterápia",
        kind: "therapy",
        step: 10,
        hours: weekdays("09:00", "17:00"),
        services: ["Magnetoterápia"],
        load: 0.4,
      },
      {
        name: "Ortopédia",
        kind: "consult",
        step: 10,
        hours: weekdays("14:00", "18:00", [2, 4]),
        services: ["Ortopédiai szakrendelés"],
        load: 0.7,
      },
    ],
  },
  {
    name: "Caring Medical Center",
    resources: [
      {
        name: "MR 3 T",
        kind: "mr",
        step: 15,
        hours: mrHours,
        services: servicesOf("mr"),
        speed: 0.8,
        load: 0.83,
      },
      {
        name: "CT",
        kind: "ct",
        step: 15,
        hours: weekdays("08:00", "18:00"),
        services: servicesOf("ct"),
        load: 0.3,
      },
      {
        name: "Röntgen",
        kind: "xray",
        step: 10,
        hours: weekdays("08:00", "18:00"),
        services: servicesOf("xray"),
        load: 0.32,
      },
    ],
  },
  {
    name: "Caring Budaörs",
    resources: [
      {
        name: "MR 1,5 T",
        kind: "mr",
        step: 15,
        hours: mrHours,
        services: servicesOf("mr"),
        load: 0.67,
      },
      {
        name: "Magnetoterápia",
        kind: "therapy",
        step: 10,
        hours: weekdays("09:00", "17:00"),
        services: ["Magnetoterápia"],
        load: 0.35,
      },
    ],
  },
]

type SeededResource = {
  _id: Id<"resources">
  siteId: Id<"sites">
  hours: WorkingRule[]
  load: number
  services: { _id: Id<"services">; durationMinutes: number; priceHuf: number }[]
}

async function insertSites(
  ctx: MutationCtx,
  serviceIds: Map<string, Id<"services">>
) {
  const seeded: SeededResource[] = []
  for (const [siteOrder, site] of sites.entries()) {
    const siteId = await ctx.db.insert("sites", {
      name: site.name,
      sortOrder: siteOrder,
    })
    for (const [resourceOrder, resource] of site.resources.entries()) {
      const resourceId = await ctx.db.insert("resources", {
        siteId,
        name: resource.name,
        kind: resource.kind,
        slotStepMinutes: resource.step,
        sortOrder: resourceOrder,
      })
      for (const rule of resource.hours) {
        await ctx.db.insert("workingHours", { resourceId, ...rule })
      }
      const linked = []
      for (const name of resource.services) {
        const service = services.find((candidate) => candidate.name === name)
        const serviceId = serviceIds.get(name)
        if (!service || !serviceId)
          throw new Error(`Unknown seed service ${name}`)
        const durationMinutes = resource.speed
          ? Math.max(
              10,
              Math.round((service.durationMinutes * resource.speed) / 5) * 5
            )
          : undefined
        await ctx.db.insert("resourceServices", {
          resourceId,
          serviceId,
          durationMinutes,
        })
        linked.push({
          _id: serviceId,
          durationMinutes: durationMinutes ?? service.durationMinutes,
          priceHuf: service.priceHuf,
        })
      }
      seeded.push({
        _id: resourceId,
        siteId,
        hours: resource.hours,
        load: resource.load,
        services: linked,
      })
    }
  }
  return seeded
}

async function fillDay(
  ctx: MutationCtx,
  options: {
    resource: SeededResource
    date: string
    now: number
    random: () => number
    patientIds: Id<"patients">[]
    staffId: Id<"staff">
  }
) {
  const { resource, now, random, patientIds, staffId } = options
  let count = 0
  for (const shift of workingIntervals(resource.hours, options.date)) {
    let cursor = shift.start
    while (cursor < shift.end) {
      const service = pick(random, resource.services)
      const duration = service.durationMinutes * MINUTE_MS
      if (cursor + duration > shift.end) break
      if (random() > resource.load) {
        cursor += (5 + Math.floor(random() * 4) * 5) * MINUTE_MS
        continue
      }
      const startAt = cursor
      const endAt = cursor + duration
      cursor = endAt
      await ctx.db.insert("appointments", {
        siteId: resource.siteId,
        resourceId: resource._id,
        serviceId: service._id,
        patientId: pick(random, patientIds),
        startAt,
        endAt,
        status: statusFor(random, startAt, endAt, now),
        source: sourceFor(random),
        priceHuf: service.priceHuf,
        note: random() < 0.12 ? pick(random, notes) : undefined,
        createdBy: staffId,
      })
      count++
    }
  }
  return count
}

function statusFor(
  random: () => number,
  startAt: number,
  endAt: number,
  now: number
) {
  const roll = random()
  if (endAt <= now) {
    // Recently finished visits are often not closed yet at the desk.
    if (now - endAt < 30 * MINUTE_MS && roll < 0.5) return "arrived" as const
    return roll < 0.86
      ? ("completed" as const)
      : roll < 0.93
        ? ("noShow" as const)
        : ("cancelled" as const)
  }
  if (startAt <= now) return "arrived" as const
  return roll < 0.94 ? ("booked" as const) : ("cancelled" as const)
}

function sourceFor(random: () => number): AppointmentSource {
  const roll = random()
  return roll < 0.72 ? "staff" : roll < 0.88 ? "partner" : "online"
}

const notes = [
  "Klausztrofóbiás, nyugtatót kér",
  "Korábbi felvételeit CD-n hozza",
  "Kontrasztanyag-allergia kizárva",
  "Térdprotézise van, MR-kompatibilis",
  "Angolul beszél",
  "Kerekesszékkel érkezik",
  "Beutalót hoz",
]

const familyNames = [
  "Nagy",
  "Kovács",
  "Tóth",
  "Szabó",
  "Horváth",
  "Varga",
  "Kiss",
  "Molnár",
  "Németh",
  "Farkas",
  "Balogh",
  "Papp",
  "Takács",
  "Juhász",
  "Lakatos",
  "Mészáros",
  "Oláh",
  "Simon",
  "Rácz",
  "Fekete",
  "Szilágyi",
  "Török",
  "Fehér",
  "Balázs",
  "Gál",
  "Szűcs",
  "Kocsis",
  "Pintér",
  "Fodor",
  "Szalai",
  "Sipos",
  "Magyar",
  "Lukács",
  "Gulyás",
  "Bíró",
  "Király",
  "Katona",
  "Jakab",
  "Sándor",
  "Boros",
  "Fazekas",
  "Kelemen",
  "Antal",
  "Orosz",
  "Somogyi",
  "Fülöp",
  "Veres",
  "Vincze",
  "Hegedűs",
  "Deák",
  "Bálint",
  "Illés",
  "Vass",
  "Lengyel",
  "Bakos",
  "Szőke",
  "Fábián",
  "Hajdu",
  "Vörös",
  "Pásztor",
]
const femaleNames = [
  "Anna",
  "Katalin",
  "Erzsébet",
  "Ilona",
  "Mária",
  "Éva",
  "Zsuzsanna",
  "Judit",
  "Ágnes",
  "Krisztina",
  "Andrea",
  "Erika",
  "Eszter",
  "Noémi",
  "Réka",
  "Dóra",
  "Petra",
  "Zsófia",
  "Hanna",
  "Lili",
  "Boglárka",
  "Orsolya",
  "Tímea",
  "Edit",
  "Ildikó",
  "Gabriella",
  "Szilvia",
  "Beáta",
  "Viktória",
  "Emőke",
]
const maleNames = [
  "László",
  "István",
  "József",
  "János",
  "Zoltán",
  "Sándor",
  "Gábor",
  "Ferenc",
  "Attila",
  "Péter",
  "Tamás",
  "Zsolt",
  "Tibor",
  "András",
  "Csaba",
  "Imre",
  "Lajos",
  "György",
  "Balázs",
  "Róbert",
  "Dávid",
  "Bence",
  "Máté",
  "Levente",
  "Ádám",
  "Dániel",
  "Gergő",
  "Norbert",
  "Krisztián",
  "Ödön",
]
const birthPlaces = [
  "Budapest",
  "Debrecen",
  "Szeged",
  "Miskolc",
  "Pécs",
  "Győr",
  "Nyíregyháza",
  "Kecskemét",
  "Székesfehérvár",
  "Szombathely",
  "Eger",
  "Sopron",
  "Vác",
  "Érd",
  "Budaörs",
]

async function insertPatients(
  ctx: MutationCtx,
  random: () => number,
  count: number
) {
  const ids: Id<"patients">[] = []
  const usedTaj = new Set<string>()
  for (let index = 0; index < count; index++) {
    const sex = random() < 0.4 ? ("female" as const) : ("male" as const)
    const familyName = pick(random, familyNames)
    const givenName = pick(random, sex === "female" ? femaleNames : maleNames)
    const year = 1940 + Math.floor(random() * 76)
    const birthDate = `${year}-${pad(1 + Math.floor(random() * 12))}-${pad(1 + Math.floor(random() * 28))}`
    let taj = syntheticTaj(random)
    while (usedTaj.has(taj)) taj = syntheticTaj(random)
    usedTaj.add(taj)
    const phone = `+36 ${pick(random, ["20", "30", "70"])} ${Math.floor(100 + random() * 900)} ${Math.floor(1000 + random() * 9000)}`
    const email =
      random() < 0.7
        ? `${ascii(givenName)}.${ascii(familyName)}${index}@example.com`
        : undefined
    const patient = {
      familyName,
      givenName,
      sex,
      birthDate,
      birthPlace: pick(random, birthPlaces),
      mothersName: `${pick(random, familyNames)} ${pick(random, femaleNames)}`,
      taj,
      phone,
      email,
    }
    ids.push(
      await ctx.db.insert("patients", {
        ...patient,
        searchText: patientSearchText(patient),
      })
    )
  }
  return ids
}

function syntheticTaj(random: () => number) {
  const firstEight = Array.from({ length: 8 }, () =>
    Math.floor(random() * 10)
  ).join("")
  return `${firstEight}${tajCheckDigit(firstEight)}`
}

function ascii(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]
}

function hashString(text: string) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  }
  return hash >>> 0
}

/** Small seeded PRNG so a given anchor date always produces the same demo. */
function mulberry32(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
