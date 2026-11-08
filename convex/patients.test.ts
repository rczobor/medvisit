/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const staffToken = "https://issuer.example|reception-1"

async function setup() {
  const t = convexTest(schema, modules)
  await t.run((ctx) =>
    ctx.db.insert("staff", {
      name: "Teszt Recepció",
      role: "reception",
      tokenIdentifier: staffToken,
    })
  )
  const staff = t.withIdentity({ tokenIdentifier: staffToken })
  const base = {
    sex: "female" as const,
    birthDate: "1980-01-01",
  }
  const annaId = await staff.mutation(api.patients.create, {
    ...base,
    familyName: "Kiss",
    givenName: "Anna",
    taj: "123 456 788",
    phone: "+36 30 111 1111",
  })
  const evaId = await staff.mutation(api.patients.create, {
    ...base,
    familyName: "Nagy",
    givenName: "Éva",
    taj: "111111110",
  })
  return { t, staff, base, annaId, evaId }
}

test("an edit keeps the patient's own TAJ, refuses another patient's, and clears emptied fields", async () => {
  const { t, staff, base, annaId } = await setup()
  const edit = {
    ...base,
    patientId: annaId,
    familyName: "Kiss",
    givenName: "Anna Mária",
    taj: "123456788",
  }

  await expect(
    staff.mutation(api.patients.update, { ...edit, taj: "111 111 110" })
  ).rejects.toMatchObject({ data: { code: "DUPLICATE_TAJ" } })

  // The phone is left out, so it is removed.
  await staff.mutation(api.patients.update, edit)
  const card = await staff.query(api.patients.get, { patientId: annaId })
  expect(card?.patient).toMatchObject({
    givenName: "Anna Mária",
    taj: "123456788",
    phone: null,
  })
  const found = await staff.query(api.patients.search, { text: "anna maria" })
  expect(found.map((patient) => patient._id)).toEqual([annaId])

  const audit = await t.run((ctx) =>
    ctx.db
      .query("auditEvents")
      .withIndex("by_patientId", (q) => q.eq("patientId", annaId))
      .collect()
  )
  expect(audit.map((event) => [event.action, event.details])).toEqual([
    ["patient.created", undefined],
    ["patient.updated", { fields: "givenName,phone" }],
  ])
})
