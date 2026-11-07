import { Link, useNavigate } from "@tanstack/react-router"
import { cn } from "cn"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import type { Id } from "../../convex/_generated/dataModel"
import { addDays, parseLocalDate } from "../../convex/lib/time"
import { useDesk } from "@/components/desk-context"
import { DatePicker } from "@/components/date-picker"
import { Button, buttonVariants } from "@/components/ui/button"

const segment =
  "rounded-[calc(var(--radius)-2px)] px-2.5 py-1 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
const segmentActive = "bg-card font-medium text-foreground shadow-xs"
const segmentIdle = "text-muted-foreground hover:text-foreground"

export function AppHeader({
  sites,
}: {
  sites: { _id: Id<"sites">; name: string }[]
}) {
  const { site, date, today, openBooking } = useDesk()
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b bg-card px-4 py-2">
      <span className="text-[15px] font-bold tracking-tight">MedVisit</span>

      <nav
        aria-label="Telephely"
        className="flex max-w-full overflow-x-auto rounded-md bg-muted p-0.5"
      >
        {sites.map((candidate) => (
          <Link
            key={candidate._id}
            to="."
            search={(previous) => ({
              ...previous,
              site: candidate._id,
              book: undefined,
            })}
            aria-current={candidate._id === site._id ? "page" : undefined}
            className={cn(
              segment,
              candidate._id === site._id ? segmentActive : segmentIdle
            )}
          >
            {candidate.name}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-1">
        <Link
          to="."
          search={(previous) => ({ ...previous, date: addDays(date, -1) })}
          aria-label="Előző nap"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <ChevronLeftIcon />
        </Link>
        <DatePicker
          value={date}
          currentYear={parseLocalDate(today).year}
          className="min-w-56 justify-start text-[15px] font-semibold"
          onChange={(picked) =>
            void navigate({
              to: ".",
              search: (previous) => ({ ...previous, date: picked }),
            })
          }
        />
        <Link
          to="."
          search={(previous) => ({ ...previous, date: addDays(date, 1) })}
          aria-label="Következő nap"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <ChevronRightIcon />
        </Link>
        <Link
          to="."
          search={(previous) => ({ ...previous, date: undefined })}
          aria-disabled={date === today}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "ml-1",
            date === today && "pointer-events-none opacity-50"
          )}
        >
          Ma
        </Link>
      </div>

      <nav aria-label="Nézet" className="flex rounded-md bg-muted p-0.5">
        <Link
          to="/"
          search={(previous) => previous}
          activeOptions={{ exact: true, includeSearch: false }}
          className={segment}
          activeProps={{ className: segmentActive, "aria-current": "page" }}
          inactiveProps={{ className: segmentIdle }}
        >
          Tábla
        </Link>
        <Link
          to="/lista"
          search={(previous) => previous}
          activeOptions={{ includeSearch: false }}
          className={segment}
          activeProps={{ className: segmentActive, "aria-current": "page" }}
          inactiveProps={{ className: segmentIdle }}
        >
          Lista
        </Link>
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <Button onClick={() => openBooking()}>
          <PlusIcon />
          Új foglalás
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={resolvedTheme === "dark" ? "Világos téma" : "Sötét téma"}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
        </Button>
      </div>
    </header>
  )
}
