import { expect, test } from "vitest"
import { formatTaj, isValidTaj, normalizeTaj, tajCheckDigit } from "./taj"

test("validates the TAJ check digit", () => {
  // 1·3 + 2·7 + 3·3 + 4·7 + 5·3 + 6·7 + 7·3 + 8·7 = 188
  expect(tajCheckDigit("12345678")).toBe(8)
  expect(isValidTaj("123456788")).toBe(true)
  expect(isValidTaj("123456789")).toBe(false)
  expect(isValidTaj("12345678")).toBe(false)
})

test("accepts the printed and dashed forms", () => {
  expect(normalizeTaj("123 456 788")).toBe("123456788")
  expect(normalizeTaj("123-456-788")).toBe("123456788")
  expect(formatTaj("123456788")).toBe("123 456 788")
})
