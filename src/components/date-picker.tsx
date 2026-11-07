import { useState } from "react"
import { CalendarDaysIcon } from "lucide-react"
import { hu } from "react-day-picker/locale"
import { parseLocalDate } from "../../convex/lib/time"
import type { LocalDate } from "../../convex/lib/time"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { formatDay } from "@/lib/format"

const toLocalDate = (date: Date): LocalDate =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

export function DatePicker({
  value,
  onChange,
  currentYear,
  className,
  id,
}: {
  value: LocalDate
  onChange: (date: LocalDate) => void
  /** The year left out of the label. */
  currentYear: number
  className?: string
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const { year, month, day } = parseLocalDate(value)
  const selected = new Date(year, month - 1, day)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button id={id} variant="ghost" className={className} />}
      >
        <CalendarDaysIcon className="text-muted-foreground" />
        <span className="first-letter:uppercase">
          {formatDay(value, currentYear)}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={hu}
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected}
          onSelect={(picked) => {
            if (!picked) return
            setOpen(false)
            onChange(toLocalDate(picked))
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
