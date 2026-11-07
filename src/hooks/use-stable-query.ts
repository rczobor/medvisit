import { useRef } from "react"
import { useQuery } from "convex/react"
import type { OptionalRestArgsOrSkip } from "convex/react"
import type { FunctionReference } from "convex/server"

/**
 * `useQuery` that keeps showing the previous result while new arguments load,
 * so search results don't flash empty on every keystroke.
 */
export function useStableQuery<TQuery extends FunctionReference<"query">>(
  query: TQuery,
  ...args: OptionalRestArgsOrSkip<TQuery>
) {
  const result = useQuery(query, ...args)
  const stored = useRef(result)
  if (result !== undefined) stored.current = result
  return args[0] === "skip" ? undefined : stored.current
}
