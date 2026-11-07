import { cn } from "cn"
import {
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
  UserXIcon,
  XIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { AppointmentStatus } from "../../convex/lib/appointmentStatus"
import { statusLabel } from "@/lib/labels"

/** One icon per status, shared by the board, the list and the details sheet. */
export const statusIcon: Record<
  AppointmentStatus,
  { icon: LucideIcon; className: string }
> = {
  booked: { icon: ClockIcon, className: "text-status-booked" },
  arrived: { icon: CheckIcon, className: "text-status-arrived" },
  completed: { icon: CheckCheckIcon, className: "text-muted-foreground" },
  noShow: { icon: UserXIcon, className: "text-status-noshow" },
  cancelled: { icon: XIcon, className: "text-status-cancelled" },
}

export function StatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus
  className?: string
}) {
  const { icon: Icon, className: iconClassName } = statusIcon[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm whitespace-nowrap",
        className
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", iconClassName)} aria-hidden />
      {statusLabel[status]}
    </span>
  )
}
