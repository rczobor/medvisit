import { v } from "convex/values"
import { query } from "./_generated/server"
import { isAdmin, requireStaff } from "./lib/auth"

export const sites = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    const rows = await ctx.db.query("sites").withIndex("by_sortOrder").take(50)
    return rows.map(({ _id, name }) => ({ _id, name }))
  },
})

/** Which tools the interface should offer the signed-in staff member. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx)
    return { isAdmin: isAdmin(staff) }
  },
})

export const servicesForResource = query({
  args: { resourceId: v.id("resources") },
  handler: async (ctx, { resourceId }) => {
    await requireStaff(ctx)
    const links = await ctx.db
      .query("resourceServices")
      .withIndex("by_resourceId_and_serviceId", (q) =>
        q.eq("resourceId", resourceId)
      )
      .take(500)
    const services = await Promise.all(
      links.map(async (link) => {
        const service = await ctx.db.get("services", link.serviceId)
        if (!service) return null
        return {
          _id: service._id,
          name: service.name,
          contrast: service.contrast,
          priceHuf: service.priceHuf,
          durationMinutes: link.durationMinutes ?? service.durationMinutes,
        }
      })
    )
    return services
      .filter((service) => service !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "hu"))
  },
})

/** The calendars that perform a service, for moving a booking between them. */
export const resourcesForService = query({
  args: { serviceId: v.id("services") },
  handler: async (ctx, { serviceId }) => {
    await requireStaff(ctx)
    const links = await ctx.db
      .query("resourceServices")
      .withIndex("by_serviceId", (q) => q.eq("serviceId", serviceId))
      .take(200)
    return links.map((link) => link.resourceId)
  },
})
