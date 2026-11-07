import { cn } from "cn"
import type { AppointmentStatus } from "../../convex/lib/appointmentStatus"
import { statusLabel } from "@/lib/labels"

const dot: Record<AppointmentStatus, string> = {
  booked: "bg-status-booked",
  arrived: "bg-status-arrived",
  completed: "bg-status-completed",
  noShow: "bg-status-noshow",
  cancelled: "border border-status-cancelled bg-transparent",
}

export function StatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm whitespace-nowrap",
        className
      )}
    >
      <span
        className={cn("size-2 shrink-0 rounded-full", dot[status])}
        aria-hidden
      />
      {statusLabel[status]}
    </span>
  )
}
