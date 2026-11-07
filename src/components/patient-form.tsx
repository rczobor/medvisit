import { useEffect, useRef, useState } from "react"
import { useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { formatTaj, isValidTaj, normalizeTaj } from "../../convex/lib/taj"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { errorCode, errorMessage } from "@/lib/labels"

export type PatientSummary = {
  _id: Id<"patients">
  familyName: string
  givenName: string
  birthDate: string
  taj: string | null
  phone: string | null
}

const empty = {
  familyName: "",
  givenName: "",
  birthDate: "",
  taj: "",
  phone: "",
  email: "",
  birthPlace: "",
  mothersName: "",
}
type Values = typeof empty
type Sex = "female" | "male"
type Errors = Partial<Record<keyof Values | "sex" | "form", string>>

/** "Kiss Anna Mária" → family name "Kiss", given name "Anna Mária". */
function namesFrom(text: string) {
  if (/\d/.test(text)) return {}
  const [familyName = "", ...given] = text.trim().split(/\s+/)
  return { familyName, givenName: given.join(" ") }
}

function validate(values: Values, sex: Sex | null, today: string): Errors {
  const errors: Errors = {}
  if (!values.familyName.trim()) errors.familyName = "Adja meg a vezetéknevet."
  if (!values.givenName.trim()) errors.givenName = "Adja meg a keresztnevet."
  if (!sex) errors.sex = "Válassza ki a nemet."
  if (!values.birthDate) errors.birthDate = "Adja meg a születési dátumot."
  else if (values.birthDate < "1900-01-01" || values.birthDate > today) {
    errors.birthDate = "A születési dátum nem lehet a jövőben."
  }
  const taj = normalizeTaj(values.taj)
  if (taj && !isValidTaj(taj))
    errors.taj = "Ez nem érvényes TAJ-szám. Ellenőrizze a számjegyeket."
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = "Ellenőrizze az e-mail-címet."
  }
  return errors
}

/**
 * The new-patient form. Its submit and cancel buttons are rendered by the
 * caller in the sheet footer (associated through `id`), so they sit at the
 * sheet's bottom edge on every screen size.
 */
export function PatientForm({
  id,
  initialText,
  today,
  onCreated,
  onSavingChange,
}: {
  id: string
  initialText: string
  today: string
  onCreated: (patient: PatientSummary) => void
  onSavingChange: (saving: boolean) => void
}) {
  const create = useMutation(api.patients.create)
  const [values, setValues] = useState<Values>({
    ...empty,
    ...namesFrom(initialText),
  })
  const [sex, setSex] = useState<Sex | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // On phones the booking controls fill the screen above the form; show the
  // form itself (its section heading sits just above it) once it opens.
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: "start" })
  }, [])

  const field = (name: keyof Values) => ({
    id: `patient-${name}`,
    value: values[name],
    "aria-invalid": errors[name] ? true : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues((previous) => ({ ...previous, [name]: event.target.value })),
  })

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    const found = validate(values, sex, today)
    setErrors(found)
    if (Object.keys(found).length > 0 || !sex) return
    setSaving(true)
    onSavingChange(true)
    const taj = normalizeTaj(values.taj)
    try {
      const patientId = await create({
        familyName: values.familyName,
        givenName: values.givenName,
        sex,
        birthDate: values.birthDate,
        taj: taj || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        birthPlace: values.birthPlace || undefined,
        mothersName: values.mothersName || undefined,
      })
      onCreated({
        _id: patientId,
        familyName: values.familyName.trim(),
        givenName: values.givenName.trim(),
        birthDate: values.birthDate,
        taj: taj || null,
        phone: values.phone.trim() || null,
      })
    } catch (error) {
      const code = errorCode(error)
      setErrors(
        code === "INVALID_TAJ" || code === "DUPLICATE_TAJ"
          ? { taj: errorMessage(error) }
          : { form: errorMessage(error) }
      )
    } finally {
      setSaving(false)
      onSavingChange(false)
    }
  }

  return (
    <form
      ref={formRef}
      id={id}
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 rounded-md border bg-muted/40 p-3"
    >
      <FieldGroup className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="patient-familyName">Vezetéknév</FieldLabel>
          <Input {...field("familyName")} autoComplete="off" autoFocus />
          {errors.familyName && <FieldError>{errors.familyName}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="patient-givenName">Keresztnév</FieldLabel>
          <Input {...field("givenName")} autoComplete="off" />
          {errors.givenName && <FieldError>{errors.givenName}</FieldError>}
        </Field>
        <Field>
          <FieldLabel id="patient-sex-label">Nem</FieldLabel>
          <ToggleGroup
            aria-labelledby="patient-sex-label"
            variant="outline"
            value={sex ? [sex] : []}
            onValueChange={(next) => {
              const picked = next.at(-1)
              setSex(picked === "female" || picked === "male" ? picked : null)
            }}
          >
            <ToggleGroupItem value="female">Nő</ToggleGroupItem>
            <ToggleGroupItem value="male">Férfi</ToggleGroupItem>
          </ToggleGroup>
          {errors.sex && <FieldError>{errors.sex}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="patient-birthDate">Születési dátum</FieldLabel>
          <Input
            {...field("birthDate")}
            type="date"
            min="1900-01-01"
            max={today}
          />
          {errors.birthDate && <FieldError>{errors.birthDate}</FieldError>}
        </Field>
      </FieldGroup>
      {/* Required fields come first; the optional ones share one label instead
          of a marker on each, which wrapped badly at phone width. */}
      <fieldset className="flex flex-col border-t pt-3">
        {/* float + full width keeps the legend in the flow, not in the border. */}
        <legend className="float-left mb-3 w-full text-sm font-medium">
          Kiegészítő adatok{" "}
          <span className="font-normal text-muted-foreground">
            (nem kötelező)
          </span>
        </legend>
        <FieldGroup className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="patient-taj">TAJ-szám</FieldLabel>
            <Input
              {...field("taj")}
              inputMode="numeric"
              autoComplete="off"
              placeholder="000 000 000"
              className="tabular"
              onBlur={() => {
                const taj = normalizeTaj(values.taj)
                if (isValidTaj(taj))
                  setValues((previous) => ({
                    ...previous,
                    taj: formatTaj(taj),
                  }))
              }}
            />
            {errors.taj && <FieldError>{errors.taj}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="patient-phone">Telefonszám</FieldLabel>
            <Input
              {...field("phone")}
              type="tel"
              autoComplete="off"
              placeholder="+36 30 123 4567"
            />
          </Field>
          <Field className="col-span-2">
            <FieldLabel htmlFor="patient-email">E-mail-cím</FieldLabel>
            <Input {...field("email")} type="email" autoComplete="off" />
            {errors.email && <FieldError>{errors.email}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="patient-birthPlace">Születési hely</FieldLabel>
            <Input {...field("birthPlace")} autoComplete="off" />
          </Field>
          <Field>
            <FieldLabel htmlFor="patient-mothersName">Anyja neve</FieldLabel>
            <Input {...field("mothersName")} autoComplete="off" />
          </Field>
        </FieldGroup>
      </fieldset>
      {errors.form && (
        <p role="alert" className="text-sm text-destructive">
          {errors.form}
        </p>
      )}
    </form>
  )
}
