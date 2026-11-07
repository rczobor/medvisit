/**
 * TAJ (Hungarian social security) numbers: nine digits, the last a check digit.
 * The check digit is the sum of the first eight digits, weighted 3 at odd and 7
 * at even positions, modulo 10.
 */

export function normalizeTaj(input: string) {
  return input.replace(/[\s-]/g, "")
}

export function tajCheckDigit(firstEight: string) {
  let sum = 0
  for (let index = 0; index < 8; index++) {
    sum += Number(firstEight[index]) * (index % 2 === 0 ? 3 : 7)
  }
  return sum % 10
}

export function isValidTaj(taj: string) {
  return /^\d{9}$/.test(taj) && tajCheckDigit(taj) === Number(taj[8])
}

/** `123456789` → `123 456 789`, the way the card prints it. */
export function formatTaj(taj: string) {
  return taj.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")
}
