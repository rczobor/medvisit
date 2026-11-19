import { useState } from "react"
import { useQuery } from "convex/react"
import type { FunctionArgs } from "convex/server"
import { api } from "../../convex/_generated/api"

/**
 * Patient search that keeps showing the previous results while new arguments
 * load, so results don't flash empty on every keystroke.
 */
export function usePatientSearch(
  args: FunctionArgs<typeof api.patients.search> | "skip"
) {
  const result = useQuery(api.patients.search, args)
  const [stored, setStored] = useState(result)
  if (result !== undefined && result !== stored) setStored(result)
  return args === "skip" ? undefined : (result ?? stored)
}
