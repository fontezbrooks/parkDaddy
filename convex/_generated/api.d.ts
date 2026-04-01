/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cronHandlers from "../cronHandlers.js";
import type * as crons from "../crons.js";
import type * as notifications from "../notifications.js";
import type * as notificationsHelpers from "../notificationsHelpers.js";
import type * as parkeaz from "../parkeaz.js";
import type * as pushTokens from "../pushTokens.js";
import type * as renewal from "../renewal.js";
import type * as sessions from "../sessions.js";
import type * as users from "../users.js";
import type * as vehicles from "../vehicles.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  cronHandlers: typeof cronHandlers;
  crons: typeof crons;
  notifications: typeof notifications;
  notificationsHelpers: typeof notificationsHelpers;
  parkeaz: typeof parkeaz;
  pushTokens: typeof pushTokens;
  renewal: typeof renewal;
  sessions: typeof sessions;
  users: typeof users;
  vehicles: typeof vehicles;
}>;

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
>;

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
>;

export declare const components: {};
