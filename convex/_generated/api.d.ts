/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as catalog from "../catalog.js"
import type * as lib_appointmentStatus from "../lib/appointmentStatus.js"
import type * as lib_auth from "../lib/auth.js"
import type * as lib_availability from "../lib/availability.js"
import type * as lib_errors from "../lib/errors.js"
import type * as lib_search from "../lib/search.js"
import type * as lib_taj from "../lib/taj.js"
import type * as lib_time from "../lib/time.js"
import type * as patients from "../patients.js"
import type * as schedule from "../schedule.js"
import type * as seed from "../seed.js"
import type * as validators from "../validators.js"

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server"

declare const fullApi: ApiFromModules<{
  catalog: typeof catalog
  "lib/appointmentStatus": typeof lib_appointmentStatus
  "lib/auth": typeof lib_auth
  "lib/availability": typeof lib_availability
  "lib/errors": typeof lib_errors
  "lib/search": typeof lib_search
  "lib/taj": typeof lib_taj
  "lib/time": typeof lib_time
  patients: typeof patients
  schedule: typeof schedule
  seed: typeof seed
  validators: typeof validators
}>

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>

export declare const components: {}
