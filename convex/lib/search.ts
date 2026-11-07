/** Lower-cases and strips accents, so "kovacs" finds "Kovács". */
export function foldForSearch(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()
}

export function patientSearchText(patient: {
  familyName: string
  givenName: string
  birthDate: string
  taj?: string
  phone?: string
}) {
  return foldForSearch(
    [
      patient.familyName,
      patient.givenName,
      patient.birthDate,
      patient.taj ?? "",
      (patient.phone ?? "").replace(/\D/g, ""),
    ].join(" ")
  )
}
