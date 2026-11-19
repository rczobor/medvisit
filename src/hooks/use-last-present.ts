import { useState } from "react"

/**
 * `value`, or the last non-null value while it is null, so a sheet or dialog
 * keeps its content while it animates closed.
 */
export function useLastPresent<T>(value: T | null) {
  const [last, setLast] = useState(value)
  if (value !== null && value !== last) setLast(value)
  return value ?? last
}
