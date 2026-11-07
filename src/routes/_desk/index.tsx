import { createFileRoute } from "@tanstack/react-router"
import { DayBoard } from "@/components/day-board"

export const Route = createFileRoute("/_desk/")({ component: DayBoard })
